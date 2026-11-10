import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';

/**
 * LO COMPROMETIDO JUNTO AL PUNTO DE EQUILIBRIO, RENDERIZADO (fase B, tarea 2).
 *
 * «A proveedores» pasó a ser solo la mercadería que ya llegó sin pagar, y lo
 * pedido y no recibido vive en `totals.comprometido`. El Dashboard lee ese
 * campo: si siguiera leyendo `totals.proveedores`, la línea desaparecería el
 * día que «A proveedores» valga $0 y nadie lo leería como un bug.
 *
 * ⚠️ Y el conteo de facturas sale de `facturasComprometidas`, no de `facturas`
 * (que cuenta las que tienen DEUDA): con $334 comprometidos y 0 facturas con
 * deuda, el aviso diría «en 0 facturas».
 *
 * Se mockea `@/lib/api` y nada más.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { DashboardPage } = await import('@/pages/Dashboard');

/** Las tres facturas abiertas de producción: nada llegó, todo es compromiso. */
const OVERVIEW = (over: { comprometido: number; facturasComprometidas: number }) => ({
  loans: [],
  owner: {
    counterparty: { id: 'cp', name: 'Propietario', kind: 'OWNER' },
    obligations: [],
    total: 0,
    applicationOrder: 'OLDEST_FIRST',
  },
  suppliers: {
    groups: [
      {
        supplierId: 'prov-a',
        supplierName: 'StratoFill',
        total: 0,
        facturas: 0, // ← cero facturas con DEUDA, a propósito
        comprometido: over.comprometido,
        facturasComprometidas: over.facturasComprometidas,
        aFavor: 0,
        facturasAFavor: 0,
      },
    ],
    total: 0,
    aFavor: 0,
    comprometido: over.comprometido,
    facturasComprometidas: over.facturasComprometidas,
  },
  totals: {
    prestamista: 0,
    propietario: 0,
    proveedores: 0,
    comprometido: over.comprometido,
    total: 0,
  },
});

function montar(over: { comprometido: number; facturasComprometidas: number }) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/loans/overview') return { data: OVERVIEW(over) };
    if (url === '/settings') {
      return {
        data: {
          fixedCosts: [{ concept: 'Alquiler', monthlyAmount: 100 }],
          breakEvenMarginPct: 0.5,
          equipmentReserve: 0,
        },
      };
    }
    if (url === '/sales') {
      return {
        data: [{ id: 's1', date: '2026-10-05', amount: 50, kind: 'COUNTER', clientId: null }],
      };
    }
    if (['/expenses', '/orders/payments', '/loans', '/counterparties', '/orders'].includes(url)) {
      return { data: [] };
    }
    return { data: null };
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <DashboardPage />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => mocks.get.mockReset());

describe('Dashboard: lo comprometido al lado del equilibrio', () => {
  it('muestra los $334 comprometidos aunque «A proveedores» valga 0', async () => {
    montar({ comprometido: 334, facturasComprometidas: 3 });

    const aviso = await screen.findByText(/pedidos a proveedores/);
    const parrafo = aviso.closest('p')!;
    expect(parrafo.textContent).toMatch(/334/);
    expect(parrafo.textContent).toMatch(/Además tienes comprometidos/);
  });

  it('cuenta las facturas comprometidas: «3 facturas», no «0»', async () => {
    montar({ comprometido: 334, facturasComprometidas: 3 });

    const aviso = await screen.findByText(/pedidos a proveedores/);
    expect(aviso.closest('p')!.textContent).toMatch(/3\s+facturas/);
    expect(aviso.closest('p')!.textContent).not.toMatch(/\b0\s+facturas/);
  });

  it('sin nada comprometido, la línea no se dibuja', async () => {
    montar({ comprometido: 0, facturasComprometidas: 0 });

    await screen.findByText(/Punto de equilibrio del mes/);
    expect(screen.queryByText(/pedidos a proveedores/)).toBeNull();
  });
});
