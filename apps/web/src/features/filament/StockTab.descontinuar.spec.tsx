import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockCountRow } from '@calc3d/shared';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

/**
 * DESCONTINUAR POR MARCA, Y EL TERCER ESTADO FUERA DE LA GRILLA DEL CONTEO (13/11).
 *
 * ⚠️ Dos decisiones que ninguna función pura ve, porque viven en la pantalla:
 *  1. «Toda la marca» confirma ENUMERANDO las fichas. Un «se van a descontinuar
 *     14» no deja ver que entró una que no correspondía, y es irreversible de a una.
 *  2. Las fichas fuera del conteo (`entraEnConteo`) se esconden de lo que hay que
 *     CONTAR, pero NO de lo que se GUARDA: el cierre sigue siendo la foto completa
 *     del estante. Con una afuera, el rollo que quede se perdería sin que nadie lo viera.
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

const fila = (
  id: string,
  color: string,
  brand: string,
  status: StockCountRow['status'],
): StockCountRow => ({
  materialId: id,
  name: `PLA ${color}`,
  type: 'PLA',
  brand,
  color,
  status,
  sealed: 0,
  inUse: 0,
  running: 0,
  total: 0,
  needsBrandCheck: false,
  counted: true,
  canDelete: false,
  exhausted: false,
  previous: null,
  lastRollPrice: 20,
  received: null,
});

// Eryone: dos activas + una «solo pedido especial» + una ya descontinuada. Sinco: una activa.
const FILAS: StockCountRow[] = [
  fila('e1', 'Rojo', 'Eryone', 'ACTIVE'),
  fila('e2', 'Azul', 'Eryone', 'ACTIVE'),
  fila('e3', 'Dorado', 'Eryone', 'SOLO_PEDIDO_ESPECIAL'),
  fila('e4', 'Verde', 'Eryone', 'DISCONTINUED'),
  fila('s1', 'Negro', 'Sinco', 'ACTIVE'),
];

function montar(filasDelMes: StockCountRow[] = FILAS) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/filament/stock') return { data: filasDelMes };
    if (url === '/filament/stock/status') {
      return {
        data: {
          month: '2026-10',
          closed: false,
          closedAt: null,
          reopenedAt: null,
          canClose: true,
          closableFrom: '2026-10-31',
        },
      };
    }
    if (url === '/filament/summary') {
      return {
        data: {
          month: '2026-10', totalRolls: 0, running: 0, consumption: null, purchased: 0, restock: [],
          pendingBrandCheck: 0, countedColors: 1, totalColors: 1, averagePurchased: 1,
          valor: { sellados: 0, enUso: 0, porAcabarse: 0, total: 0, piso: 0, techo: 0, sinPrecio: 0 },
          complete: false,
        },
      };
    }
    return { data: null };
  });
  mocks.patch.mockResolvedValue({ data: { updated: 2 } });
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
  await screen.findByLabelText('PLA Rojo Eryone');
  await act(async () => {});
};

const elegirMarca = (marca: string) => {
  fireEvent.keyDown(screen.getByLabelText('Filtrar por marca'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: marca }));
};

beforeEach(() => {
  mocks.get.mockReset();
  mocks.patch.mockReset();
  mocks.post.mockReset();
  localStorage.clear();
});

describe('StockTab — descontinuar toda la marca', () => {
  it('sin una marca elegida no hay botón: no se descontinúa «todo» por accidente', async () => {
    montar();
    await cargar();
    expect(screen.queryByRole('button', { name: /Descontinuar toda la marca/ })).toBeNull();
  });

  it('la confirmación ENUMERA las fichas, una por una, y no dice solo un número', async () => {
    montar();
    await cargar();
    elegirMarca('Eryone');

    fireEvent.click(screen.getByRole('button', { name: /Descontinuar toda la marca Eryone/ }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText(/PLA Rojo/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/PLA Azul/)).toBeInTheDocument();
    // Las que NO se tocan no se listan como si se fueran a descontinuar.
    expect(within(dialogo).queryByText(/PLA Negro/)).toBeNull();
    expect(within(dialogo).queryByText(/PLA Dorado/)).toBeNull();
    expect(within(dialogo).queryByText(/PLA Verde/)).toBeNull();
  });

  it('al confirmar manda SOLO las activas de esa marca, en un solo pedido', async () => {
    montar();
    await cargar();
    elegirMarca('Eryone');

    fireEvent.click(screen.getByRole('button', { name: /Descontinuar toda la marca Eryone/ }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Descontinuar' }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch).toHaveBeenCalledWith('/materials/status/batch', {
      ids: ['e1', 'e2'],
      status: 'DISCONTINUED',
    });
  });

  it('si el dueño cancela, no se escribe nada', async () => {
    montar();
    await cargar();
    elegirMarca('Eryone');

    fireEvent.click(screen.getByRole('button', { name: /Descontinuar toda la marca Eryone/ }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    await act(async () => {});
    expect(mocks.patch).not.toHaveBeenCalled();
  });
});

describe('StockTab — las fichas fuera del conteo', () => {
  it('no salen en la grilla por defecto y un aviso dice cuántas son', async () => {
    montar();
    await cargar();

    expect(screen.queryByLabelText('PLA Dorado Eryone')).toBeNull();
    expect(screen.queryByLabelText('PLA Verde Eryone')).toBeNull();
    expect(screen.getByLabelText('PLA Rojo Eryone')).toBeInTheDocument();
    expect(screen.getByText(/2 fichas descontinuadas o solo para pedido especial no se muestran/)).toBeInTheDocument();
  });

  it('«Mostrarlas» las trae a la grilla y «Ocultarlas» las vuelve a sacar', async () => {
    montar();
    await cargar();

    fireEvent.click(screen.getByRole('button', { name: 'Mostrarlas' }));
    expect(screen.getByLabelText('PLA Dorado Eryone')).toBeInTheDocument();
    expect(screen.getByLabelText('PLA Verde Eryone')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ocultarlas' }));
    expect(screen.queryByLabelText('PLA Dorado Eryone')).toBeNull();
  });

  it('filtrar por ese estado a propósito las muestra (si no, el filtro daría una grilla vacía)', async () => {
    montar();
    await cargar();

    fireEvent.keyDown(screen.getByLabelText('Filtrar por estado de la ficha'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Solo pedido especial' }));

    expect(screen.getByLabelText('PLA Dorado Eryone')).toBeInTheDocument();
  });

  // ⚠️ La decisión central: esconder de lo que se CUENTA no es esconder de lo que se GUARDA.
  it('el cierre guarda TODAS las fichas, también las que no se muestran', async () => {
    montar();
    await cargar();

    fireEvent.click(screen.getByRole('button', { name: /Guardar y cerrar/ }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar y cerrar' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const [url, cuerpo] = mocks.post.mock.calls[0] as [string, { counts: { materialId: string }[] }];
    expect(url).toBe('/filament/stock/close');
    expect(cuerpo.counts.map((c) => c.materialId).sort()).toEqual(['e1', 'e2', 'e3', 'e4', 's1']);
  });
});

// Eryone también tiene un PETG: con el filtro de tipo en PLA, ese NO se ve.
const CON_PETG: StockCountRow[] = [...FILAS, { ...fila('e5', 'Negro', 'Eryone', 'ACTIVE'), type: 'PETG', name: 'PETG Negro' }];

const elegirTipo = (tipo: string) => {
  fireEvent.keyDown(screen.getByLabelText('Filtrar por tipo de filamento'), { key: 'Enter' });
  fireEvent.click(screen.getByRole('option', { name: tipo }));
};

describe('StockTab — «toda la marca» con filtros puestos', () => {
  it('si el lote incluye fichas que los filtros esconden, la confirmación lo dice', async () => {
    montar(CON_PETG);
    await cargar();
    elegirTipo('PLA');
    elegirMarca('Eryone');

    fireEvent.click(screen.getByRole('button', { name: /Descontinuar toda la marca Eryone/ }));
    const dialogo = await screen.findByRole('alertdialog');

    expect(within(dialogo).getByText(/1 de estas no se ven con los filtros puestos: PETG Negro/)).toBeInTheDocument();
  });

  // Hermano: sin nada escondido, el aviso NO sale (uno que sale siempre deja de leerse).
  it('sin fichas escondidas por los filtros no dice nada', async () => {
    montar(CON_PETG);
    await cargar();
    elegirMarca('Eryone');

    fireEvent.click(screen.getByRole('button', { name: /Descontinuar toda la marca Eryone/ }));
    const dialogo = await screen.findByRole('alertdialog');

    expect(within(dialogo).getByText(/PETG Negro/)).toBeInTheDocument();
    expect(within(dialogo).queryByText(/no se ven con los filtros/)).toBeNull();
  });
});

describe('StockTab — selección múltiple para descontinuar', () => {
  const marcar = (nombre: string) => fireEvent.click(screen.getByLabelText(`Seleccionar ${nombre}`));

  it('sin nada marcado no hay barra de selección', async () => {
    montar();
    await cargar();
    expect(screen.queryByRole('button', { name: 'Descontinuar seleccionadas' })).toBeNull();
  });

  it('la confirmación ENUMERA las elegidas (con su marca) y manda solo esas', async () => {
    montar();
    await cargar();
    marcar('PLA Rojo Eryone');
    marcar('PLA Negro Sinco');
    expect(screen.getByText(/2 fichas seleccionadas/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Descontinuar seleccionadas' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText(/PLA Rojo \(Eryone\)/)).toBeInTheDocument();
    expect(within(dialogo).getByText(/PLA Negro \(Sinco\)/)).toBeInTheDocument();
    expect(within(dialogo).queryByText(/PLA Azul/)).toBeNull();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Descontinuar' }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch).toHaveBeenCalledWith('/materials/status/batch', { ids: ['e1', 's1'], status: 'DISCONTINUED' });
  });

  it('cancelar no escribe nada', async () => {
    montar();
    await cargar();
    marcar('PLA Rojo Eryone');
    fireEvent.click(screen.getByRole('button', { name: 'Descontinuar seleccionadas' }));
    const dialogo = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await act(async () => {});
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  // ⚠️ Descontinuar a ciegas: lo marcado que ya no se ve NO puede seguir marcado.
  it('al cambiar un filtro la selección se limpia: al volver, no queda nada marcado', async () => {
    montar();
    await cargar();
    marcar('PLA Rojo Eryone');
    expect(screen.getByRole('button', { name: 'Descontinuar seleccionadas' })).toBeInTheDocument();

    elegirMarca('Sinco');
    fireEvent.keyDown(screen.getByLabelText('Filtrar por marca'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Marca: todas' }));

    expect(screen.getByLabelText('Seleccionar PLA Rojo Eryone')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Descontinuar seleccionadas' })).toBeNull();
  });
});

describe('StockTab — los avisos cuentan lo que se ve y concuerdan en número', () => {
  // Eryone tiene 2 fuera del conteo; Sinco, 1 más. En total son 3, pero con la marca Eryone puesta se ven 2.
  const CON_OTRA_FUERA = [...FILAS, fila('s2', 'Plata', 'Sinco', 'DISCONTINUED')];

  it('«Se ven también…» cuenta las de la vista con los filtros puestos, no las de todas las marcas', async () => {
    montar(CON_OTRA_FUERA);
    await cargar();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrarlas' }));
    expect(screen.getByText(/Se ven también 3 fichas descontinuadas/)).toBeInTheDocument();

    elegirMarca('Eryone');

    expect(screen.getByText(/Se ven también 2 fichas descontinuadas/)).toBeInTheDocument();
    expect(screen.queryByText(/Se ven también 3 fichas/)).toBeNull();
    expect(screen.getAllByRole('article').length).toBe(4); // lo que se ve: 2 activas + 2 fuera
  });

  it('si ninguna de las de fuera coincide con los filtros, lo dice en vez de contar 0', async () => {
    montar(FILAS);
    await cargar();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrarlas' }));

    elegirMarca('Sinco');

    expect(screen.getByText(/Ninguna ficha descontinuada o solo para pedido especial coincide con los filtros/)).toBeInTheDocument();
  });

  it('el plural concuerda: «esta ficha» con 1 y «estas fichas» con 2, sin «(s)»', async () => {
    montar(FILAS);
    await cargar();

    elegirMarca('Sinco');
    fireEvent.click(screen.getByRole('button', { name: /Descontinuar toda la marca Sinco/ }));
    let dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText(/Se van a descontinuar esta ficha: PLA Negro/)).toBeInTheDocument();
    expect(dialogo.textContent).not.toMatch(/\(s\)/);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    elegirMarca('Eryone');
    fireEvent.click(screen.getByRole('button', { name: /Descontinuar toda la marca Eryone/ }));
    dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText(/Se van a descontinuar estas 2 fichas: /)).toBeInTheDocument();
  });
});
