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

function montar() {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/filament/stock') return { data: FILAS };
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
    expect(screen.getByText(/2 ficha\(s\) descontinuadas o solo para pedido especial/)).toBeInTheDocument();
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
