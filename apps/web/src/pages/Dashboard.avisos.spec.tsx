import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';

/**
 * LOS AVISOS DEL DASHBOARD, RENDERIZADOS.
 *
 * ⚠️ **Este archivo existe porque los tests de función pura no alcanzan.**
 * `conteoDeStockPendiente` y `lecturaDeHorasPendiente` tienen sus ramas
 * probadas en shared, y aun así nadie se enteraría si el Dashboard le pasara
 * el mes equivocado, si no dibujara el aviso, si el descarte no durara, o si
 * —peor— el aviso saliera cuando la función dice que no hay nada que hacer.
 * En este repo ya pasó dos veces: una mutación que hacía que una pantalla
 * dejara de filtrar no tumbaba un solo test con las nueve ramas cubiertas.
 *
 * Se mockea `@/lib/api` y NADA más: los hooks de React Query, los componentes
 * y las funciones puras son los de verdad.
 *
 * ⚠️ Y se mockea `@/lib/today`, que es de dónde sale el "hoy" que la pantalla
 * le pasa a las funciones puras. Sin eso el test dependería de la fecha de la
 * máquina: pasaría hoy y fallaría solo algún día.
 */

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  hoy: { valor: '2026-10-10' },
}));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

vi.mock('@/lib/today', async () => {
  const real = await vi.importActual<typeof import('@/lib/today')>('@/lib/today');
  return {
    ...real,
    todayKey: () => mocks.hoy.valor,
    currentMonthKey: () => mocks.hoy.valor.slice(0, 7),
  };
});

const { DashboardPage } = await import('@/pages/Dashboard');

/** Lo que devuelve la API en cada escenario. */
interface Escenario {
  /** `GET /filament/stock/last-closed` */
  ultimoCierre?: string | null;
  /** `GET /printers/usage` → `printers[].lastReading.month` */
  lecturas?: (string | null)[];
}

/**
 * LA PUERTA DE LAS RESPUESTAS.
 *
 * ⚠️ **Sin esto, cada test de "no aparece" pasaba sin probar nada.** Un
 * `queryByText` corrido antes de que llegue la respuesta no encuentra el aviso
 * porque todavía no hay datos, no porque la regla lo apague: la verificación
 * por mutación lo destapó —borrar la guarda de "ningún mes cerrado todavía" no
 * tumbaba un solo test de pantalla—.
 *
 * Con la puerta, `cargar()` resuelve TODAS las consultas y espera a que React
 * pinte lo que salga de ellas. Recién ahí una ausencia significa algo.
 */
function montar(e: Escenario = {}) {
  let abrir = () => {};
  const puerta = new Promise<void>((r) => {
    abrir = r;
  });
  const responder = (url: string) => {
    if (url === '/filament/stock/last-closed') {
      return Promise.resolve({ data: { month: e.ultimoCierre ?? null } });
    }
    if (url === '/printers/usage') {
      return Promise.resolve({
        data: {
          month: '2026-10',
          printers: (e.lecturas ?? []).map((mes, i) => ({
            id: `p${i}`,
            name: `Máquina ${i}`,
            lifetimeHours: 4800,
            maintPerHour: 0,
            jobs: 0,
            hours: 0,
            lastReading: mes ? { month: mes, hours: 100 } : null,
            hoursThisMonth: null,
            measuredJobs: 0,
            pieces: 0,
            reprints: 0,
            failureRate: null,
            lifeUsed: null,
            maintenance: { spent: 0, charged: 0, difference: 0 },
          })),
          maintenanceRate: { spent: 0, hours: 0, ratePerHour: null },
          total: {
            hours: 0,
            printersWithoutReading: 0,
            measuredJobs: 0,
            pieces: 0,
            reprints: 0,
            failureRate: null,
            unmeasuredJobs: 0,
            jobs: 0,
          },
        },
      });
    }
    // Las listas que el resto del Dashboard pide: vacías. `null` y no
    // `undefined` para lo demás: React Query rechaza `undefined` como dato.
    if (
      [
        '/sales',
        '/expenses',
        '/orders/payments',
        '/campaigns',
        '/store/products',
        '/purchase-invoices',
        '/loans',
        '/counterparties',
      ].includes(url)
    ) {
      return Promise.resolve({ data: [] });
    }
    return Promise.resolve({ data: null });
  };
  /**
   * ⚠️ `/sales` y `/expenses` responden ÚLTIMOS, una vuelta de macrotask
   * después del resto, y `cargar()` espera el cartel que depende de ELLOS. Así
   * el barrera es real: cuando se mide una ausencia, las consultas de los
   * avisos ya respondieron y React ya pintó lo que saliera de ellas.
   */
  mocks.get.mockImplementation(async (url: string) => {
    await puerta;
    if (url === '/sales' || url === '/expenses') {
      await new Promise((r) => setTimeout(r, 0));
    }
    return responder(url);
  });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const vista = render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <DashboardPage />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  /** Resuelve las consultas y espera a que React pinte el resultado. */
  const cargar = async () => {
    abrir();
    // Con las listas vacías el Dashboard dibuja este cartel: es la señal de
    // que terminó de cargar. `act` envuelve el resto de los flushes.
    await screen.findByText(/Sin datos en este periodo/);
    await act(async () => {});
  };
  return { ...vista, cargar };
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.hoy.valor = '2026-10-10';
  localStorage.clear();
});

afterEach(() => localStorage.clear());

/**
 * El DETALLE del aviso del conteo, que es igual en singular y en plural.
 *
 * ⚠️ Las ausencias se comprueban con ESTE texto y no con el título: la
 * verificación por mutación destapó que `/Falta contar el stock/` **no matchea
 * el plural** ("Faltan 2 conteos de stock…"), así que una mutación que hacía
 * aparecer el aviso en un negocio sin ningún cierre pasaba inadvertida.
 */
const SIN_CONTEO = /conteo de rollos/;

describe('Aviso: falta contar el stock del mes anterior', () => {
  it('con septiembre sin cerrar avisa, y el enlace abre ESE mes', async () => {
    const { cargar } = montar({ ultimoCierre: '2026-08' });
    await cargar();

    const aviso = screen.getByText('Falta contar el stock de septiembre de 2026.');
    // El enlace lleva el mes pendiente: sin eso cae en octubre, que todavía no
    // se puede cerrar, y hay que volver con la flecha.
    expect(aviso.closest('a')).toHaveAttribute('href', '/filament/stock?mes=2026-09');
  });

  it('con septiembre CERRADO no avisa (y es el único dato que cambia)', async () => {
    const { cargar } = montar({ ultimoCierre: '2026-09' });
    await cargar();

    expect(screen.queryByText(SIN_CONTEO)).not.toBeInTheDocument();
  });

  it('sin NINGÚN mes cerrado todavía no avisa: un negocio que arranca', async () => {
    const { cargar } = montar({ ultimoCierre: null });
    await cargar();

    expect(screen.queryByText(SIN_CONTEO)).not.toBeInTheDocument();
  });

  it('se puede DESCARTAR, y el descarte sobrevive a recargar la pantalla', async () => {
    const primera = montar({ ultimoCierre: '2026-08' });
    await primera.cargar();

    fireEvent.click(screen.getByLabelText('Descartar el aviso del conteo de septiembre de 2026'));
    expect(screen.queryByText(SIN_CONTEO)).not.toBeInTheDocument();

    // Recargar = volver a montar con el MISMO localStorage.
    primera.unmount();
    const segunda = montar({ ultimoCierre: '2026-08' });
    await segunda.cargar();

    expect(screen.queryByText(SIN_CONTEO)).not.toBeInTheDocument();
  });

  it('el descarte dura hasta que CAMBIA el mes: en noviembre vuelve', async () => {
    const primera = montar({ ultimoCierre: '2026-08' });
    await primera.cargar();
    fireEvent.click(screen.getByLabelText('Descartar el aviso del conteo de septiembre de 2026'));
    primera.unmount();

    // Pasó el mes y ahora el pendiente es octubre: el aviso vuelve, porque
    // lo descartado era el de septiembre. Si no volviera, sería un aviso perdido.
    mocks.hoy.valor = '2026-11-02';
    const segunda = montar({ ultimoCierre: '2026-08' });
    await segunda.cargar();

    expect(screen.getByText(/Faltan 2 conteos de stock/)).toBeInTheDocument();
  });
});

describe('Aviso: hace mucho que no leés el contador de horas', () => {
  it('con la última lectura de hace más de un mes avisa y dice cuánto hace', async () => {
    mocks.hoy.valor = '2026-11-20';
    const { cargar } = montar({ lecturas: ['2026-09'] });
    await cargar();

    expect(
      screen.getByText('Hace 51 días que no anotás las horas de tus impresoras.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Hace 51 días/).closest('a')).toHaveAttribute('href', '/production');
  });

  it('con la lectura del mes pasado NO avisa: todavía está a tiempo', async () => {
    // Hoy 10/10 y la última lectura es de septiembre: la de octubre se anota a
    // fin de mes. Avisar acá sería molestar sin que nada esté atrasado.
    const { cargar } = montar({ lecturas: ['2026-09'] });
    await cargar();

    expect(screen.queryByText(/anotás las horas/)).not.toBeInTheDocument();
  });

  it('si NUNCA se leyó un contador, el aviso NO dice "hace N días"', async () => {
    const { cargar } = montar({ lecturas: [null, null] });
    await cargar();

    // "Hace N días desde la última" no se puede decir sin una última lectura:
    // el aviso dice otra cosa.
    expect(screen.getByText('Nunca anotaste las horas de tus impresoras.')).toBeInTheDocument();
    expect(screen.queryByText(/Hace \d+ días/)).not.toBeInTheDocument();
  });

  it('sin impresoras cargadas no avisa nada', async () => {
    const { cargar } = montar({ lecturas: [] });
    await cargar();

    expect(screen.queryByText(/anotás las horas/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nunca anotaste/)).not.toBeInTheDocument();
  });

  it('se puede descartar, y vuelve al cambiar el mes', async () => {
    mocks.hoy.valor = '2026-11-20';
    const primera = montar({ lecturas: ['2026-09'] });
    await primera.cargar();

    fireEvent.click(screen.getByLabelText('Descartar el aviso de las lecturas de horas'));
    expect(screen.queryByText(/anotás las horas/)).not.toBeInTheDocument();

    primera.unmount();
    mocks.hoy.valor = '2026-12-01';
    const segunda = montar({ lecturas: ['2026-09'] });
    await segunda.cargar();

    expect(screen.getByText(/anotás las horas/)).toBeInTheDocument();
  });
});

describe('Los avisos conviven', () => {
  /**
   * ⚠️ **Los dos descartes son INDEPENDIENTES.** Cada uno guarda en su clave
   * (`dashboard:aviso-conteo` y `dashboard:aviso-lecturas`): con la clave
   * copiada y pegada, callar uno callaría al otro — y el que se perdería es el
   * que el dueño no eligió callar, que es la peor forma de perder un aviso.
   */
  it('callar el del conteo no calla el de las lecturas', async () => {
    mocks.hoy.valor = '2026-11-20';
    const { cargar } = montar({ ultimoCierre: '2026-08', lecturas: ['2026-09'] });
    await cargar();

    // Los dos a la vez, cada uno con su enlace.
    expect(screen.getByText(SIN_CONTEO).closest('a')).toHaveAttribute(
      'href',
      '/filament/stock?mes=2026-10',
    );
    expect(screen.getByText(/anotás las horas/).closest('a')).toHaveAttribute(
      'href',
      '/production',
    );

    fireEvent.click(screen.getByLabelText('Descartar el aviso del conteo de octubre de 2026'));

    expect(screen.queryByText(SIN_CONTEO)).not.toBeInTheDocument();
    expect(screen.getByText(/anotás las horas/)).toBeInTheDocument();
  });

  /**
   * ⚠️ **EL CASO QUE DESTAPÓ LA MUTACIÓN.** El test de arriba pasaba igual con
   * las dos claves pisadas, porque los dos avisos guardan meses DISTINTOS (el
   * del conteo guarda el mes pendiente; el de las lecturas, el mes en curso).
   * Donde el valor coincide es un mes después: callar las lecturas en noviembre
   * guarda `'2026-11'`, y en diciembre el conteo pendiente ES noviembre. Con
   * una sola clave, ese aviso aparecería **ya callado sin que nadie lo
   * callara** — un aviso perdido en silencio, que es justo lo que esta fase
   * tiene que evitar.
   */
  it('callar las lecturas en noviembre no calla el conteo de noviembre en diciembre', async () => {
    mocks.hoy.valor = '2026-11-20';
    const primera = montar({ ultimoCierre: '2026-10', lecturas: ['2026-09'] });
    await primera.cargar();
    fireEvent.click(screen.getByLabelText('Descartar el aviso de las lecturas de horas'));
    primera.unmount();

    mocks.hoy.valor = '2026-12-05';
    const segunda = montar({ ultimoCierre: '2026-10', lecturas: ['2026-09'] });
    await segunda.cargar();

    // El conteo pendiente ahora es noviembre: nadie lo descartó, tiene que estar.
    expect(screen.getByText('Falta contar el stock de noviembre de 2026.')).toBeInTheDocument();
  });
});
