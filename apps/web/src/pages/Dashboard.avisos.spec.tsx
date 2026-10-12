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
  /** `GET /store/products` → cuántas fichas quedaron bajo el margen mínimo. */
  fichasBajoMargen?: number;
  /** `GET /campaigns` → cuántas campañas vigentes no rinden. */
  campanasFlojas?: number;
  /** `GET /purchase-invoices` → cuántas facturas no llegaron cuando dijeron. */
  comprasAtrasadas?: number;
  /** `GET /orders` → los encargos tal como los devuelve el backend. */
  encargos?: {
    code: number;
    status: string;
    deliveryDate: string | null;
    balance: number;
    createdAt?: string;
  }[];
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
    // Los tres avisos de ACCIÓN, apagados salvo que el escenario los encienda.
    // Cada fixture trae SOLO lo que su aviso lee: el resto de los campos no
    // los mira nadie y escribirlos sería pedirle al test que sepa de más.
    if (url === '/store/products') {
      return Promise.resolve({
        data: Array.from({ length: e.fichasBajoMargen ?? 0 }, (_, i) => ({
          id: `sp${i}`,
          name: `Llavero ${i}`,
          recost: { status: { belowMin: true } },
        })),
      });
    }
    if (url === '/campaigns') {
      return Promise.resolve({
        data: Array.from({ length: e.campanasFlojas ?? 0 }, (_, i) => ({
          id: `c${i}`,
          name: `Campaña ${i}`,
          // Vigente (sin fecha de fin) y gastando más de lo que deja → AT_RISK.
          status: 'ACTIVE',
          endDate: null,
          stats: { invested: 50, revenue: 10, profit: 0, sales: 1, orders: 0, hasCost: false },
        })),
      });
    }
    if (url === '/purchase-invoices') {
      return Promise.resolve({
        data: Array.from({ length: e.comprasAtrasadas ?? 0 }, (_, i) => ({
          id: `f${i}`,
          expectedAt: '2026-10-05',
          voidedAt: null,
          supplier: { name: `Filaven ${i}` },
          lines: [{ quantity: 2, unitPrice: 10, received: 0 }],
        })),
      });
    }
    if (url === '/orders') {
      return Promise.resolve({
        data: (e.encargos ?? []).map((o, i) => ({
          id: `o${i}`,
          code: o.code,
          clientId: 'cl1',
          client: { id: 'cl1', name: 'Cliente' },
          status: o.status,
          deliveryDate: o.deliveryDate,
          notes: null,
          lines: [],
          payments: [],
          createdAt: o.createdAt ?? '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          // El saldo llega DERIVADO por el backend: la pantalla no lo recalcula.
          total: o.balance,
          paid: 0,
          balance: o.balance,
        })),
      });
    }
    // Las listas que el resto del Dashboard pide: vacías. `null` y no
    // `undefined` para lo demás: React Query rechaza `undefined` como dato.
    if (['/sales', '/expenses', '/orders/payments', '/loans', '/counterparties'].includes(url)) {
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

/**
 * EL RENGLÓN COLAPSADO, si se dibujó.
 *
 * Se busca por ROL y no por texto: es un disclosure, y lo que el test tiene
 * que poder afirmar es que hay algo que se puede abrir. Su nombre accesible es
 * todo su texto ("2 recordatorios · Conteo de stock y lecturas de horas"), así
 * que `/recordatorios/` lo encuentra sin fijar el detalle.
 */
const renglon = () => screen.queryByRole('button', { name: /recordatorios/ });

/** Abre el renglón. Falla si no hay renglón que abrir, que es parte del punto. */
const desplegar = () => fireEvent.click(screen.getByRole('button', { name: /recordatorios/ }));

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

/**
 * LOS DOS RECORDATORIOS, COLAPSADOS EN UN RENGLÓN (2026-10-10).
 *
 * ⚠️ **El problema que resuelve es de ALTO, medido**: los cinco avisos
 * apilados son ~440 px de un viewport de 844 y dejan los KPIs abajo del
 * pliegue. Decisión del dueño: los tres que exigen una ACCIÓN se quedan a la
 * vista y los dos recordatorios descartables se colapsan.
 *
 * ⚠️ **Por qué estos tests son de PANTALLA y no de función**: lo que puede
 * romperse acá no es una rama de `conteoDeStockPendiente` —esas están probadas
 * en shared— sino el CABLEADO: que el renglón aparezca cuando no hay nada,
 * que se coma un aviso que tenía que quedar a la vista, o que al desplegarlo
 * los textos ya no sean los mismos. Nada de eso lo ve un test de función pura.
 */
describe('Los dos recordatorios se colapsan en un renglón', () => {
  it('con los DOS, el renglón los cuenta, los nombra y no se ven sueltos', async () => {
    mocks.hoy.valor = '2026-11-20';
    const { cargar } = montar({ ultimoCierre: '2026-08', lecturas: ['2026-09'] });
    await cargar();

    // El renglón dice CUÁNTOS hay y DE QUÉ son: "2 recordatorios" a secas es
    // una caja cerrada, y nadie abre una caja cerrada todos los días.
    expect(screen.getByText('2 recordatorios')).toBeInTheDocument();
    expect(screen.getByText('conteo de stock y lecturas de horas')).toBeInTheDocument();
    expect(renglon()).toHaveAttribute('aria-expanded', 'false');

    // Y los dos avisos NO están dibujados: si estuvieran, el renglón sería un
    // adorno que suma alto en vez de recuperarlo.
    expect(screen.queryByText(SIN_CONTEO)).not.toBeInTheDocument();
    expect(screen.queryByText(/anotás las horas/)).not.toBeInTheDocument();
  });

  it('al tocarlo se despliegan los dos, con sus textos y enlaces intactos', async () => {
    mocks.hoy.valor = '2026-11-20';
    const { cargar } = montar({ ultimoCierre: '2026-08', lecturas: ['2026-09'] });
    await cargar();

    desplegar();

    // Los MISMOS textos y los mismos destinos que antes de colapsarlos:
    // colapsar es una decisión de alto, no una reescritura de los avisos.
    expect(screen.getByText(/Faltan 2 conteos de stock/)).toBeInTheDocument();
    expect(screen.getByText(SIN_CONTEO).closest('a')).toHaveAttribute(
      'href',
      '/filament/stock?mes=2026-10',
    );
    expect(
      screen.getByText('Hace 51 días que no anotás las horas de tus impresoras.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/anotás las horas/).closest('a')).toHaveAttribute(
      'href',
      '/production',
    );
    expect(renglon()).toHaveAttribute('aria-expanded', 'true');
  });

  it('se puede volver a cerrar', async () => {
    mocks.hoy.valor = '2026-11-20';
    const { cargar } = montar({ ultimoCierre: '2026-08', lecturas: ['2026-09'] });
    await cargar();

    desplegar();
    expect(screen.getByText(SIN_CONTEO)).toBeInTheDocument();

    desplegar();
    expect(screen.queryByText(SIN_CONTEO)).not.toBeInTheDocument();
  });

  /**
   * ⚠️ **CON UNO SOLO NO HAY RENGLÓN.** Un renglón que dice "1 recordatorio"
   * mide lo mismo que el aviso que esconde: no recupera ni un píxel y encima
   * pide un toque para leer algo que ya cabía. El colapso existe por el alto,
   * así que donde no hay alto que ganar no hay colapso.
   */
  it('con UN solo recordatorio no hay renglón: el aviso va a la vista', async () => {
    // Sin impresoras cargadas el de las lecturas no existe: queda el del conteo.
    const { cargar } = montar({ ultimoCierre: '2026-08' });
    await cargar();

    expect(renglon()).not.toBeInTheDocument();
    expect(screen.getByText('Falta contar el stock de septiembre de 2026.')).toBeInTheDocument();
  });

  /** ⚠️ Con cero, NADA: ni un renglón que diga "0 recordatorios". */
  it('con CERO recordatorios no se dibuja ningún renglón', async () => {
    const { cargar } = montar({ ultimoCierre: '2026-09', lecturas: [] });
    await cargar();

    expect(renglon()).not.toBeInTheDocument();
    expect(screen.queryByText(SIN_CONTEO)).not.toBeInTheDocument();
    expect(screen.queryByText(/anotás las horas/)).not.toBeInTheDocument();
  });

  /**
   * ⚠️ El descarte sigue siendo INDIVIDUAL y con su misma clave: colapsar no
   * cambió cómo se calla un aviso. Y al quedar uno solo, el renglón se va:
   * ya no hay dos que agrupar.
   */
  it('desplegado, cada uno se descarta por su cuenta y el otro queda a la vista', async () => {
    mocks.hoy.valor = '2026-11-20';
    const { cargar } = montar({ ultimoCierre: '2026-08', lecturas: ['2026-09'] });
    await cargar();

    desplegar();
    fireEvent.click(screen.getByLabelText('Descartar el aviso del conteo de octubre de 2026'));

    expect(screen.queryByText(SIN_CONTEO)).not.toBeInTheDocument();
    expect(screen.getByText(/anotás las horas/)).toBeInTheDocument();
    expect(renglon()).not.toBeInTheDocument();
  });

  /**
   * ⚠️ **EL MISMO CASO PERO AL REVÉS, Y NO ES REDUNDANTE.** El test de arriba
   * calla el PRIMERO de la lista, así que pasaba igual con el grupo cableado
   * para mandarle a todos el `onDescartar` del primero — lo destapó la
   * mutación. Callando el SEGUNDO, ese cableado se cae: la X de las lecturas
   * callaría el conteo, o sea el aviso que el dueño NO eligió callar.
   */
  it('desplegado, callar el SEGUNDO no calla el primero', async () => {
    mocks.hoy.valor = '2026-11-20';
    const { cargar } = montar({ ultimoCierre: '2026-08', lecturas: ['2026-09'] });
    await cargar();

    desplegar();
    fireEvent.click(screen.getByLabelText('Descartar el aviso de las lecturas de horas'));

    expect(screen.queryByText(/anotás las horas/)).not.toBeInTheDocument();
    expect(screen.getByText(SIN_CONTEO)).toBeInTheDocument();
  });

  /**
   * ⚠️ **LOS TRES QUE EXIGEN ACCIÓN NO SE COLAPSAN**, ni cuando el renglón
   * está cerrado. Es la mitad de la decisión del dueño y la que un refactor
   * se lleva sin darse cuenta: el día que alguien decida que la compra
   * atrasada "también se puede descartar", la plata deja de avisar.
   */
  it('los tres avisos que exigen ACCIÓN quedan a la vista con el renglón cerrado', async () => {
    mocks.hoy.valor = '2026-11-20';
    const { cargar } = montar({
      ultimoCierre: '2026-08',
      lecturas: ['2026-09'],
      fichasBajoMargen: 2,
      campanasFlojas: 1,
      comprasAtrasadas: 1,
    });
    await cargar();

    expect(renglon()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/2 productos ya no dan el margen esperado/)).toBeInTheDocument();
    expect(screen.getByText(/1 campaña no está rindiendo/)).toBeInTheDocument();
    expect(screen.getByText(/1 compra no llegó cuando dijeron/)).toBeInTheDocument();
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
    // Con dos recordatorios nacen colapsados: hay que abrir el renglón para
    // verlos (y para llegar a sus botones de descartar).
    desplegar();

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
    // En noviembre el conteo de octubre ya está cerrado: el de las lecturas es
    // el ÚNICO recordatorio, así que va a la vista y no hay renglón que abrir.
    expect(renglon()).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Descartar el aviso de las lecturas de horas'));
    primera.unmount();

    mocks.hoy.valor = '2026-12-05';
    const segunda = montar({ ultimoCierre: '2026-10', lecturas: ['2026-09'] });
    await segunda.cargar();
    // En diciembre son DOS (noviembre sin contar + las lecturas, que volvieron
    // al cambiar el mes): colapsados.
    desplegar();

    // El conteo pendiente ahora es noviembre: nadie lo descartó, tiene que estar.
    expect(screen.getByText('Falta contar el stock de noviembre de 2026.')).toBeInTheDocument();
  });
});

/**
 * LOS AVISOS DE ENCARGOS, RENDERIZADOS (2026-10-12).
 *
 * Las cuatro reglas están probadas en `shared/calc/encargos.spec.ts` con sus
 * bordes. Lo que se fija acá es el CABLEADO: que la pantalla le pase los
 * encargos y el "hoy" correctos, que dibuje el aviso, que el descarte dure, y
 * —sobre todo— que **no aparezca cuando no hay nada que hacer**.
 *
 * ⚠️ En producción hay cero casos en las cuatro categorías, así que estos
 * tests son la única evidencia de que el cableado anda.
 */
describe('Avisos de encargos', () => {
  /** El estado real del negocio: 23 entregados y cobrados. Silencio. */
  it('con todo entregado y cobrado no dice nada', async () => {
    const vista = montar({
      encargos: [
        { code: 23, status: 'DELIVERED', deliveryDate: '2026-10-02', balance: 0 },
        { code: 24, status: 'DELIVERED', deliveryDate: '2026-10-08', balance: 0 },
      ],
    });
    await vista.cargar();

    expect(screen.queryByText(/fecha de entrega/i)).toBeNull();
    expect(screen.queryByText(/todavía te deben/i)).toBeNull();
    expect(screen.queryByText(/próximos días/i)).toBeNull();
  });

  it('avisa del encargo al que se le pasó la fecha, y el enlace lleva a Encargos', async () => {
    const vista = montar({
      encargos: [{ code: 25, status: 'IN_PRODUCTION', deliveryDate: '2026-10-05', balance: 0 }],
    });
    await vista.cargar();

    expect(screen.getByText(/Al encargo #25 se le pasó la fecha de entrega/)).toBeTruthy();
    const enlace = screen.getByRole('link', { name: /#25/ });
    expect(enlace.getAttribute('href')).toBe('/orders');
  });

  /** ⚠️ El hermano alcanzable: entregado, la fecha pasada no es un problema. */
  it('un entregado con la fecha pasada NO avisa', async () => {
    const vista = montar({
      encargos: [{ code: 25, status: 'DELIVERED', deliveryDate: '2026-10-05', balance: 0 }],
    });
    await vista.cargar();

    expect(screen.queryByText(/se le pasó la fecha/)).toBeNull();
  });

  it('avisa de lo entregado y sin cobrar, que es plata afuera', async () => {
    const vista = montar({
      encargos: [{ code: 24, status: 'DELIVERED', deliveryDate: '2026-10-02', balance: 15 }],
    });
    await vista.cargar();

    expect(screen.getByText(/Entregaste el encargo #24 y todavía te deben/)).toBeTruthy();
  });

  it('avisa de lo que se entrega en los próximos días', async () => {
    const vista = montar({
      encargos: [{ code: 25, status: 'IN_PRODUCTION', deliveryDate: '2026-10-12', balance: 15 }],
    });
    await vista.cargar();

    expect(screen.getByText(/El encargo #25 se entrega en los próximos días/)).toBeTruthy();
    // ⚠️ Y NO como "sin cobrar": que falte plata de un encargo abierto es lo
    // normal. Avisar de eso sería avisar de todos.
    expect(screen.queryByText(/todavía te deben/)).toBeNull();
  });

  it('avisa de la cotización que quedó sin respuesta', async () => {
    const vista = montar({
      encargos: [
        {
          code: 26,
          status: 'QUOTED',
          deliveryDate: null,
          balance: 0,
          createdAt: '2026-09-20T00:00:00.000Z',
        },
      ],
    });
    await vista.cargar();

    expect(screen.getByText(/La cotización #26 lleva semanas sin respuesta/)).toBeTruthy();
  });

  /**
   * ⚠️ **EL DESCARTE NO DURA UN MES, dura mientras sean LOS MISMOS encargos.**
   * Los de conteo y lecturas son tareas mensuales; un encargo vencido es una
   * fila concreta. Si se callara por un mes, el que se venza mañana quedaría
   * tapado por el descarte de hoy.
   */
  it('se puede descartar, y el descarte sobrevive a recargar la pantalla', async () => {
    const encargos = [
      { code: 25, status: 'IN_PRODUCTION', deliveryDate: '2026-10-05', balance: 0 },
    ];
    const vista = montar({ encargos });
    await vista.cargar();

    fireEvent.click(screen.getByLabelText('Descartar el aviso de las entregas pasadas de fecha'));
    expect(screen.queryByText(/se le pasó la fecha/)).toBeNull();

    vista.unmount();
    const otra = montar({ encargos });
    await otra.cargar();
    expect(screen.queryByText(/se le pasó la fecha/)).toBeNull();
  });

  it('pero si se vence OTRO encargo, el aviso vuelve', async () => {
    const vista = montar({
      encargos: [{ code: 25, status: 'IN_PRODUCTION', deliveryDate: '2026-10-05', balance: 0 }],
    });
    await vista.cargar();
    fireEvent.click(screen.getByLabelText('Descartar el aviso de las entregas pasadas de fecha'));
    vista.unmount();

    const otra = montar({
      encargos: [
        { code: 25, status: 'IN_PRODUCTION', deliveryDate: '2026-10-05', balance: 0 },
        { code: 27, status: 'CONFIRMED', deliveryDate: '2026-10-06', balance: 0 },
      ],
    });
    await otra.cargar();

    expect(screen.getByText(/A 2 encargos se les pasó la fecha: #25, #27/)).toBeTruthy();
  });

  /** Cada clase se calla por su cuenta: callar una no calla las otras. */
  it('descartar las entregas pasadas no calla las que están sin cobrar', async () => {
    const vista = montar({
      encargos: [
        { code: 25, status: 'IN_PRODUCTION', deliveryDate: '2026-10-05', balance: 0 },
        { code: 24, status: 'DELIVERED', deliveryDate: '2026-10-02', balance: 15 },
      ],
    });
    await vista.cargar();

    // Con dos recordatorios el renglón se colapsa: hay que desplegarlo.
    fireEvent.click(screen.getByRole('button', { name: /recordatorios/ }));
    fireEvent.click(screen.getByLabelText('Descartar el aviso de las entregas pasadas de fecha'));

    expect(screen.queryByText(/se le pasó la fecha/)).toBeNull();
    expect(screen.getByText(/todavía te deben/)).toBeTruthy();
  });

  /** El renglón los cuenta y los nombra solo, sin lista escrita a mano. */
  it('con varios, el renglón plegado los cuenta y los nombra', async () => {
    const vista = montar({
      encargos: [
        { code: 25, status: 'IN_PRODUCTION', deliveryDate: '2026-10-05', balance: 0 },
        { code: 24, status: 'DELIVERED', deliveryDate: '2026-10-02', balance: 15 },
      ],
    });
    await vista.cargar();

    const renglon = screen.getByRole('button', { name: /recordatorios/ });
    expect(renglon.textContent).toContain('2 recordatorios');
    expect(renglon.textContent).toContain('entregas pasadas de fecha');
    expect(renglon.textContent).toContain('encargos entregados sin cobrar');
  });
});

/**
 * ⚠️ **EL AMONTONAMIENTO, que es el riesgo documentado de esta pantalla.**
 * El plan de la fase 6 lo dejó escrito: "mirar el Dashboard con los cuatro
 * avisos a la vez; si no entran, la conversación es cuál se va, no achicar la
 * letra". Con los de encargos pueden ser SEIS recordatorios a la vez, y la
 * única razón por la que eso no tapa la pantalla es que se pliegan en UN
 * renglón. Este test es esa garantía: si alguien hace que dejen de plegarse,
 * se cae acá y no en la cara del dueño.
 */
describe('Seis recordatorios siguen siendo un renglón', () => {
  const TODOS = {
    ultimoCierre: '2026-08',
    lecturas: ['2026-07'],
    encargos: [
      { code: 25, status: 'IN_PRODUCTION', deliveryDate: '2026-10-05', balance: 0 },
      { code: 24, status: 'DELIVERED', deliveryDate: '2026-10-02', balance: 15 },
      { code: 28, status: 'CONFIRMED', deliveryDate: '2026-10-12', balance: 0 },
      {
        code: 26,
        status: 'QUOTED',
        deliveryDate: null,
        balance: 0,
        createdAt: '2026-09-20T00:00:00.000Z',
      },
    ],
  };

  it('los seis se cuentan, se nombran y NINGUNO se dibuja suelto', async () => {
    const vista = montar(TODOS);
    await vista.cargar();

    const renglon = screen.getByRole('button', { name: /recordatorios/ });
    expect(renglon.textContent).toContain('6 recordatorios');
    // Plegado, ninguno de los seis muestra su texto ni su botón de descarte.
    expect(screen.queryByText(/se le pasó la fecha/)).toBeNull();
    expect(screen.queryByText(/Falta contar el stock/)).toBeNull();
    expect(screen.queryByLabelText(/^Descartar/)).toBeNull();
  });

  it('desplegado aparecen los seis, cada uno con su botón de callar', async () => {
    const vista = montar(TODOS);
    await vista.cargar();
    fireEvent.click(screen.getByRole('button', { name: /recordatorios/ }));

    expect(screen.getAllByLabelText(/^Descartar/).length).toBe(6);
    expect(screen.getByText(/se le pasó la fecha/)).toBeTruthy();
    expect(screen.getByText(/todavía te deben/)).toBeTruthy();
    // ⚠️ Textos del TÍTULO de cada tarjeta, no los del renglón: el renglón
    // sigue dibujado cuando está desplegado y nombra lo mismo, así que un
    // patrón suelto encuentra dos elementos y el test se cae por ambiguo.
    expect(screen.getByText(/El encargo #28 se entrega en los próximos días/)).toBeTruthy();
    expect(screen.getByText(/La cotización #26 lleva semanas sin respuesta/)).toBeTruthy();
  });
});
