import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockCountRow } from '@calc3d/shared';
import { TooltipProvider } from '@/components/overlays';

/**
 * EL TERCER ESTADO EN EL CONTEO («solo pedido especial», 2026-11-13).
 *
 * ⚠️ Las funciones puras ya están probadas en `shared`. Lo que ninguna ve es la
 * PANTALLA: que el filtro ofrezca los tres estados, que la insignia distinga
 * los tres (con el `=== 'DISCONTINUED'` de antes, el tercero salía SIN insignia
 * y parecía una ficha normal) y que el total en rojo —«no hay»— no se pinte en
 * una ficha que el dueño decidió no reponer.
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

const fila = (id: string, color: string, status: StockCountRow['status']): StockCountRow => ({
  materialId: id,
  name: `PLA ${color}`,
  type: 'PLA',
  brand: `Marca ${color}`,
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

// Las tres en CERO en un mes CERRADO: ahí el total sale en rojo si «no hay» importa.
const FILAS: StockCountRow[] = [
  fila('m1', 'Amarillo', 'ACTIVE'),
  fila('m2', 'Blanco', 'DISCONTINUED'),
  fila('m3', 'Dorado', 'SOLO_PEDIDO_ESPECIAL'),
];

function montar() {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/filament/stock') return { data: FILAS };
    if (url === '/filament/stock/status') {
      return {
        data: {
          month: '2026-10',
          closed: true,
          closedAt: '2026-10-31T12:00:00.000Z',
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
          complete: true,
        },
      };
    }
    return { data: null };
  });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <StockTab />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const cargar = async () => {
  await screen.findByText('Rollos en total');
  await act(async () => {});
};

beforeEach(() => {
  mocks.get.mockReset();
  localStorage.clear();
});

describe('StockTab — los tres estados de una ficha', () => {
  it('el filtro de estado ofrece los TRES valores', async () => {
    montar();
    await cargar();
    fireEvent.keyDown(screen.getByLabelText('Filtrar por estado de la ficha'), { key: 'Enter' });

    // Se lee el TEXTO de las opciones abiertas (el Select de la casa es de Radix y
    // no dibuja <option> nativos hasta abrirse).
    const textos = screen.getAllByRole('option').map((o) => o.textContent);
    expect(textos).toEqual(['Estado: todas', 'Activas', 'Descontinuadas', 'Solo pedido especial']);
  });

  it('la insignia distingue los tres: la activa no lleva, las otras dos llevan la suya', async () => {
    montar();
    await cargar();
    // Desde el 13/11 las dos fuera del conteo no salen en la grilla hasta pedirlas.
    fireEvent.click(screen.getByRole('button', { name: 'Mostrarlas' }));

    expect(screen.getAllByText('descontinuado')).toHaveLength(1);
    expect(screen.getAllByText('solo pedido especial')).toHaveLength(1);
    // La insignia está en la tarjeta de SU ficha y no en la de otra.
    expect(screen.getByText('PLA Dorado').closest('div')).toBeTruthy();
    const tarjetaDorado = screen.getByText('Marca Dorado').closest('li, article, div[class*="rounded"]')!;
    expect(within(tarjetaDorado as HTMLElement).queryByText('solo pedido especial')).toBeInTheDocument();
    const tarjetaAmarillo = screen.getByText('Marca Amarillo').closest('li, article, div[class*="rounded"]')!;
    expect(within(tarjetaAmarillo as HTMLElement).queryByText('solo pedido especial')).toBeNull();
    expect(within(tarjetaAmarillo as HTMLElement).queryByText('descontinuado')).toBeNull();
  });

  it('filtrar por «Solo pedido especial» deja solo esa ficha', async () => {
    montar();
    await cargar();

    fireEvent.keyDown(screen.getByLabelText('Filtrar por estado de la ficha'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: 'Solo pedido especial' }));

    expect(screen.getByText('Marca Dorado')).toBeInTheDocument();
    expect(screen.queryByText('Marca Amarillo')).toBeNull();
    expect(screen.queryByText('Marca Blanco')).toBeNull();
  });

  // Hermano: la activa en cero SÍ se pinta en rojo. Sin él, un componente que
  // nunca pintara rojo pasaría este test sin probar nada.
  it('el 0 en rojo («no hay») es solo de las que se reponen: la activa sí, las otras dos no', async () => {
    const { container } = montar();
    await cargar();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrarlas' }));

    const rojos = [...container.querySelectorAll('.text-destructive')].filter(
      (el) => el.textContent === '0',
    );
    expect(rojos).toHaveLength(1);
    // Y ese único rojo está en la tarjeta de la activa.
    const tarjetaAmarillo = screen.getByText('Marca Amarillo').closest('li, article, div[class*="rounded"]')!;
    expect(tarjetaAmarillo.contains(rojos[0])).toBe(true);
  });
});
