import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockCountRow } from '@calc3d/shared';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

/**
 * EL PESO DE LOS ROLLOS EMPEZADOS (Tarea 6 de «filamento como inventario»).
 *
 * Es la única puerta por la que el dato entra: sin esta casilla no se puede
 * pesar nada. Regla del dueño: NADA SE ESTIMA. Lo que no está medido vale 0 y
 * se avisa; cerrar el mes sigue siendo posible.
 *
 * Los dos tests del plan que pedían preseleccionar «el carrete de esa marca» o
 * «el reutilizable» según la compra (con carrete / recarga) NO SE ESCRIBEN, y
 * no es un olvido: `TipoDeCarrete` es `{ id, nombre, gramos }`, sin marca ni
 * marca de «reutilizable», así que serían semántica inventada; y `isRefill` es
 * null en 58 de 71 compras, así que casi nunca dispararían. La única
 * preselección es la que el dueño hizo el mes pasado para esa ficha.
 *
 * Se mockea `@/lib/api` y nada más.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { StockTab } = await import('@/features/filament/StockTab');

const base: Omit<StockCountRow, 'materialId' | 'name' | 'brand' | 'color'> = {
  type: 'PLA',
  status: 'ACTIVE',
  sealed: 0,
  inUse: 0,
  running: 0,
  total: 0,
  needsBrandCheck: false,
  counted: false,
  canDelete: false,
  exhausted: false,
  previous: null,
  carretesPrevios: null,
  pesosGuardados: { inUse: null, running: null },
  lastRollPrice: 20,
  received: null,
};

// m1: un rollo «En uso» y uno «Por acabarse», NUNCA pesados (sin carrete previo).
// m2: un rollo «En uso»; el mes pasado se pesó en el carrete c-a.
// m3: solo rollos sellados: no hay nada que pesar.
const FILAS: StockCountRow[] = [
  { ...base, materialId: 'm1', name: 'PLA Amarillo', brand: 'Creality', color: 'Amarillo', inUse: 1, running: 1, total: 2 },
  {
    ...base,
    materialId: 'm2',
    name: 'PLA Blanco',
    brand: 'Bambu',
    color: 'Blanco',
    inUse: 1,
    total: 1,
    previous: { sealed: 0, inUse: 1, running: 0 },
    carretesPrevios: { inUse: 'c-a', running: null },
  },
  { ...base, materialId: 'm3', name: 'PLA Negro', brand: 'Sunlu', color: 'Negro', sealed: 2, total: 2 },
];

const CARRETES = [
  { id: 'c-a', nombre: 'Cartón Creality', gramos: 150 },
  { id: 'c-b', nombre: 'Plástico Bambu', gramos: 250 },
];

const M1 = 'PLA Amarillo Creality';
const M2 = 'PLA Blanco Bambu';

function montar(
  opts: { cerrado?: boolean; rollosSinPesar?: number; carretes?: typeof CARRETES; filas?: StockCountRow[] } = {},
) {
  const cerrado = opts.cerrado ?? false;
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/filament/stock') return { data: opts.filas ?? FILAS };
    if (url === '/settings/carretes') return { data: opts.carretes ?? CARRETES };
    if (url === '/filament/stock/status') {
      return {
        data: {
          month: '2026-10',
          closed: cerrado,
          closedAt: cerrado ? '2026-10-31T12:00:00.000Z' : null,
          reopenedAt: null,
          canClose: true,
          closableFrom: '2026-10-31',
          rollosSinPesar: opts.rollosSinPesar ?? 0,
          pesosSobreElRolloLleno: [],
        },
      };
    }
    if (url === '/filament/summary') {
      return {
        data: {
          month: '2026-10', totalRolls: 0, running: 0, consumption: null, purchased: 0, restock: [],
          pendingBrandCheck: 0, countedColors: 1, totalColors: 1, averagePurchased: 1,
          valor: { sellados: 0, abiertosPesados: 0, total: 0, rollosSinPesar: 0, sinPrecio: 0 },
          complete: false,
        },
      };
    }
    return { data: null };
  });
  mocks.post.mockResolvedValue({ data: { month: '2026-10', closed: true } });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <ConfirmProvider>
            <StockTab />
          </ConfirmProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const cargar = async () => {
  await screen.findAllByRole('article');
  // Los tipos de carrete llegan por una consulta aparte.
  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/settings/carretes'));
  await act(async () => {});
};

const casillaDePeso = (etiqueta: string, ficha: string) =>
  screen.queryByLabelText(`Peso en balanza (g) · ${etiqueta} · ${ficha}`);
const pesar = (etiqueta: string, ficha: string, gramos: number) =>
  fireEvent.change(casillaDePeso(etiqueta, ficha) as HTMLElement, { target: { value: String(gramos) } });
const selectorDeCarrete = (etiqueta: string, ficha: string) =>
  screen.queryByLabelText(`¿En qué carrete está? · ${etiqueta} · ${ficha}`);
const elegirCarrete = (etiqueta: string, ficha: string, opcion: string) => {
  fireEvent.keyDown(selectorDeCarrete(etiqueta, ficha) as HTMLElement, { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: opcion }));
};
const botonCerrar = () => screen.getByRole('button', { name: /Guardar y cerrar/ });

async function cerrarYLeerCuerpo() {
  fireEvent.click(botonCerrar());
  const dialogo = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar y cerrar' }));
  await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
  const [url, cuerpo] = mocks.post.mock.calls[0] as [
    string,
    { counts: Array<{ materialId: string; inUsePeso?: unknown; runningPeso?: unknown }> },
  ];
  expect(url).toBe('/filament/stock/close');
  return Object.fromEntries(cuerpo.counts.map((c) => [c.materialId, c]));
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
  localStorage.clear();
});

describe('La casilla «Peso en balanza (g)»', () => {
  it('cada rollo «En uso» y «Por acabarse» tiene la suya; lo sellado y lo vacío, no', async () => {
    montar();
    await cargar();

    expect(casillaDePeso('En uso', M1)).toBeInTheDocument();
    expect(casillaDePeso('Por acabarse', M1)).toBeInTheDocument();
    expect(casillaDePeso('En uso', M2)).toBeInTheDocument();
    // m2 no tiene nada «Por acabarse» y m3 solo tiene rollos sellados: nada que pesar.
    expect(casillaDePeso('Por acabarse', M2)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Peso en balanza.*PLA Negro/)).not.toBeInTheDocument();
  });

  it('al escribir el peso pregunta «¿En qué carrete está?» con los tipos y «Sin carrete»', async () => {
    montar();
    await cargar();
    // Antes de escribir un peso no hay nada que preguntar.
    expect(selectorDeCarrete('En uso', M1)).not.toBeInTheDocument();

    pesar('En uso', M1, 1100);
    expect(selectorDeCarrete('En uso', M1)).toBeInTheDocument();

    fireEvent.keyDown(selectorDeCarrete('En uso', M1) as HTMLElement, { key: 'Enter' });
    expect(screen.getByRole('option', { name: 'Cartón Creality · 150 g' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Plástico Bambu · 250 g' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sin carrete' })).toBeInTheDocument();
  });

  // ⚠️ El que más importa: la preselección vacía NO es un error. Rellenarla con una
  // suposición (p. ej. «con carrete» porque la compra lo insinúa) es lo que este
  // diseño saca. Casi siempre va a estar vacía, y está bien.
  it('si el mes pasado no se eligió carrete NO hay nada preseleccionado: hay que elegirlo', async () => {
    montar();
    await cargar();

    pesar('En uso', M1, 1100);

    const selector = selectorDeCarrete('En uso', M1) as HTMLElement;
    expect(selector).toHaveTextContent('¿En qué carrete está?');
    expect(selector).not.toHaveTextContent('Cartón Creality');
    expect(selector).not.toHaveTextContent('Sin carrete');
    // Y sin carrete, el rollo no cuenta: lo dice en vez de mostrar gramos inventados.
    expect(screen.getByText(/elige en qué carrete está/)).toBeInTheDocument();
    expect(screen.queryByText(/Quedan \d+ g/)).not.toBeInTheDocument();
  });

  it('lo que se eligió el mes pasado para esa ficha se ofrece igual, sin volver a preguntar', async () => {
    montar();
    await cargar();

    pesar('En uso', M2, 900);

    expect(selectorDeCarrete('En uso', M2)).toHaveTextContent('Cartón Creality · 150 g');
    expect(screen.getByText('Quedan 750 g de filamento.')).toBeInTheDocument();
  });

  it('la preselección es de ESA ficha: otra sin carrete previo sigue sin nada', async () => {
    montar();
    await cargar();

    pesar('En uso', M2, 900);
    pesar('En uso', M1, 900);

    expect(selectorDeCarrete('En uso', M1)).toHaveTextContent('¿En qué carrete está?');
    expect(selectorDeCarrete('En uso', M1)).not.toHaveTextContent('Cartón Creality');
  });

  it('muestra los gramos que quedan, y si la balanza marca menos que el carrete lo dice', async () => {
    montar();
    await cargar();

    pesar('En uso', M2, 100); // el carrete preseleccionado pesa 150

    expect(screen.getByText(/La balanza marca menos que el carrete/)).toBeInTheDocument();
    expect(screen.queryByText(/Quedan -?\d+ g/)).not.toBeInTheDocument();
  });
});

describe('«Sin pesar», antes de cerrar', () => {
  it('un rollo sin peso o sin carrete queda marcado como «sin pesar», a la vista', async () => {
    montar();
    await cargar();

    // m1 tiene dos rollos empezados y m2 uno: ninguno está pesado todavía.
    expect(screen.getAllByText('Sin pesar: vale 0 en el inventario.')).toHaveLength(3);

    pesar('En uso', M1, 1100); // con peso pero SIN carrete: sigue sin pesar, y dice por qué
    expect(screen.getAllByText('Sin pesar: vale 0 en el inventario.')).toHaveLength(2);
    expect(screen.getByText(/elige en qué carrete está/)).toBeInTheDocument();
  });

  it('el botón de cerrar dice cuántos rollos empezados quedan sin pesar, y que valen 0', async () => {
    montar();
    await cargar();

    expect(botonCerrar()).toHaveTextContent('3 sin pesar');
    expect(screen.getByText(/3 rollos empezados sin pesar: valen 0/)).toBeInTheDocument();

    pesar('En uso', M2, 900); // el carrete viene del mes pasado: queda pesado
    expect(botonCerrar()).toHaveTextContent('2 sin pesar');

    pesar('En uso', M1, 1100);
    expect(botonCerrar()).toHaveTextContent('2 sin pesar'); // con peso pero sin carrete: no cuenta
    elegirCarrete('En uso', M1, 'Plástico Bambu · 250 g');
    expect(botonCerrar()).toHaveTextContent('1 sin pesar');
    expect(screen.getByText(/1 rollo empezado sin pesar: valen 0/)).toBeInTheDocument();
  });

  // La balanza pesa UN rollo por casilla (así lo guarda el servidor): si hay dos, el otro vale 0.
  it('una casilla con DOS rollos: pesar uno deja el otro sin pesar, y la pantalla lo dice', async () => {
    montar({
      filas: [{ ...FILAS[0], inUse: 2, running: 0, total: 2 }],
    });
    await cargar();
    expect(botonCerrar()).toHaveTextContent('2 sin pesar');
    expect(screen.getByText(/Hay 2 rollos aquí y la balanza pesa uno/)).toBeInTheDocument();

    pesar('En uso', M1, 1100);
    elegirCarrete('En uso', M1, 'Plástico Bambu · 250 g');

    expect(botonCerrar()).toHaveTextContent('1 sin pesar');
  });

  it('con todo pesado el botón no avisa de nada', async () => {
    montar();
    await cargar();

    pesar('En uso', M2, 900);
    pesar('En uso', M1, 900);
    elegirCarrete('En uso', M1, 'Cartón Creality · 150 g');
    pesar('Por acabarse', M1, 400);
    elegirCarrete('Por acabarse', M1, 'Plástico Bambu · 250 g');

    expect(botonCerrar()).not.toHaveTextContent('sin pesar');
    expect(screen.queryByText(/sin pesar: valen 0/)).not.toBeInTheDocument();
  });

  // El botón AVISA, no bloquea: un rollo sin pesar vale 0 (decisión del dueño) y hoy en
  // producción 18 de 26 rollos empezados están sin pesar: un bloqueo dejaría el mes sin cerrar.
  it('avisa pero NO bloquea: se puede cerrar con rollos sin pesar y el aviso va en la confirmación', async () => {
    montar();
    await cargar();
    expect(botonCerrar()).toBeEnabled();

    fireEvent.click(botonCerrar());
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('3 rollos empezados sin pesar valen 0 en el inventario');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar y cerrar' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
  });
});

describe('Lo que viaja en el cierre', () => {
  it('manda el peso y el carrete de lo que se pesó, y NO manda la clave de lo que no se tocó', async () => {
    montar();
    await cargar();
    pesar('En uso', M2, 900); // carrete c-a heredado del mes pasado

    const counts = await cerrarYLeerCuerpo();

    expect(counts.m2.inUsePeso).toEqual({ pesoBalanza: 900, carreteTipoId: 'c-a' });
    // Sin la clave el servidor CONSERVA lo que ya hubiera guardado (reabrir y re-cerrar no borra pesos).
    expect('inUsePeso' in counts.m1).toBe(false);
    expect('runningPeso' in counts.m1).toBe(false);
    expect('inUsePeso' in counts.m3).toBe(false);
    // Y los gramos jamás viajan: los calcula el servidor.
    expect(JSON.stringify(counts.m2)).not.toMatch(/gramos|carretePeso/i);
  });

  it('«Sin carrete» elegido a propósito viaja como carrete null (y el rollo sigue sin pesar)', async () => {
    montar();
    await cargar();
    pesar('En uso', M1, 700);
    elegirCarrete('En uso', M1, 'Sin carrete');

    expect(botonCerrar()).toHaveTextContent('3 sin pesar');
    const counts = await cerrarYLeerCuerpo();

    expect(counts.m1.inUsePeso).toEqual({ pesoBalanza: 700, carreteTipoId: null });
  });

  it('el peso de un carrete elegido a mano viaja con su id', async () => {
    montar();
    await cargar();
    pesar('Por acabarse', M1, 600);
    elegirCarrete('Por acabarse', M1, 'Plástico Bambu · 250 g');

    const counts = await cerrarYLeerCuerpo();

    expect(counts.m1.runningPeso).toEqual({ pesoBalanza: 600, carreteTipoId: 'c-b' });
  });

  it('lo escrito sobrevive a recargar la pantalla (vive en el mismo borrador)', async () => {
    const primera = montar();
    await cargar();
    pesar('En uso', M1, 1100);
    elegirCarrete('En uso', M1, 'Plástico Bambu · 250 g');
    primera.unmount();

    montar();
    await cargar();

    expect(casillaDePeso('En uso', M1)).toHaveValue(1100);
    expect(selectorDeCarrete('En uso', M1)).toHaveTextContent('Plástico Bambu · 250 g');
  });
});

describe('Con el mes cerrado', () => {
  it('no hay casillas de peso y dice cuántos rollos empezados quedaron sin pesar (el dato final del servidor)', async () => {
    montar({ cerrado: true, rollosSinPesar: 4 });
    await screen.findByText(/Cerrado el/);
    await act(async () => {});

    expect(screen.getByText(/4 rollos empezados sin pesar: valen 0/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Peso en balanza/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar y cerrar/ })).not.toBeInTheDocument();
  });

  it('con todo pesado no mete ese aviso', async () => {
    montar({ cerrado: true, rollosSinPesar: 0 });
    await screen.findByText(/Cerrado el/);
    await act(async () => {});

    expect(screen.queryByText(/sin pesar/)).not.toBeInTheDocument();
  });
});

describe('Sin tipos de carrete registrados', () => {
  it('manda a registrarlos en vez de dejar un desplegable inútil', async () => {
    montar({ carretes: [] });
    await cargar();

    pesar('En uso', M1, 1100);

    expect(screen.getByText(/no registraste ningún tipo de carrete/)).toBeInTheDocument();
  });
});

// Reabrir es la ÚNICA forma de corregir un mes cerrado: la pantalla tiene que mostrar lo ya
// pesado (si no, las casillas salen en blanco y el aviso cuenta como sin pesar rollos pesados).
describe('Un mes con pesos ya guardados (reabierto)', () => {
  const guardada = (over: Partial<StockCountRow>): StockCountRow[] => [{ ...FILAS[1], ...over }];

  it('la casilla pesada aparece con su peso y su carrete, y el aviso cuenta la verdad', async () => {
    montar({ filas: guardada({ pesosGuardados: { inUse: { pesoBalanza: 900, carreteTipoId: 'c-b' }, running: null } }) });
    await cargar();

    expect(casillaDePeso('En uso', M2)).toHaveValue(900);
    expect(selectorDeCarrete('En uso', M2)).toHaveTextContent('Plástico Bambu · 250 g');
    expect(screen.getByText('Quedan 650 g de filamento.')).toBeInTheDocument();
    expect(botonCerrar()).not.toHaveTextContent('sin pesar');
  });

  it('re-cerrar sin tocar nada re-envía EXACTAMENTE lo guardado (el servidor lo conserva)', async () => {
    montar({ filas: guardada({ pesosGuardados: { inUse: { pesoBalanza: 900, carreteTipoId: 'c-b' }, running: null } }) });
    await cargar();

    const counts = await cerrarYLeerCuerpo();

    // Con balanza y tipo idénticos, la regla de la tarea 4 conserva el peso congelado.
    expect(counts.m2.inUsePeso).toEqual({ pesoBalanza: 900, carreteTipoId: 'c-b' });
    expect('runningPeso' in counts.m2).toBe(false);
  });

  it('las DOS casillas vuelven con lo suyo, cada una con su peso y su carrete', async () => {
    montar({
      filas: guardada({
        inUse: 1,
        running: 1,
        pesosGuardados: {
          inUse: { pesoBalanza: 900, carreteTipoId: 'c-a' },
          running: { pesoBalanza: 400, carreteTipoId: 'c-b' },
        },
      }),
    });
    await cargar();

    expect(casillaDePeso('En uso', M2)).toHaveValue(900);
    expect(casillaDePeso('Por acabarse', M2)).toHaveValue(400);
    expect(selectorDeCarrete('Por acabarse', M2)).toHaveTextContent('Plástico Bambu · 250 g');
    const counts = await cerrarYLeerCuerpo();
    expect(counts.m2.runningPeso).toEqual({ pesoBalanza: 400, carreteTipoId: 'c-b' });
  });

  it('una balanza guardada SIN carrete vuelve como «Sin carrete» y no se rellena con el del mes pasado', async () => {
    montar({
      filas: guardada({
        carretesPrevios: { inUse: 'c-a', running: null },
        pesosGuardados: { inUse: { pesoBalanza: 650, carreteTipoId: null }, running: null },
      }),
    });
    await cargar();

    expect(selectorDeCarrete('En uso', M2)).toHaveTextContent('Sin carrete');
    expect(botonCerrar()).toHaveTextContent('1 sin pesar'); // sigue sin pesar: es lo que había
    const counts = await cerrarYLeerCuerpo();
    expect(counts.m2.inUsePeso).toEqual({ pesoBalanza: 650, carreteTipoId: null });
  });

  it('si los tipos de carrete no cargaron, igual re-envía el id guardado (no lo borra)', async () => {
    montar({
      carretes: [],
      filas: guardada({ pesosGuardados: { inUse: { pesoBalanza: 900, carreteTipoId: 'c-b' }, running: null } }),
    });
    await cargar();

    const counts = await cerrarYLeerCuerpo();

    expect(counts.m2.inUsePeso).toEqual({ pesoBalanza: 900, carreteTipoId: 'c-b' });
  });
});
