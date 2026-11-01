import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';

/**
 * EL CÓDIGO ES NUESTRO; EL NÚMERO ES DEL PROVEEDOR (2026-11-01).
 *
 * ⚠️ Hasta acá la única identidad de una compra en pantalla era `reference`,
 * el número que pone el proveedor: una compra sin papel aparecía SIN NOMBRE y
 * no había forma de referirse a ella. Lo que se prueba acá es que la pantalla
 * muestra el código propio **siempre**, tenga o no número del proveedor.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { PurchasesPage } = await import('@/pages/Purchases');

const factura = (over: Record<string, unknown>) => ({
  id: 'f1',
  code: 1,
  date: '2026-10-05T00:00:00.000Z',
  expectedAt: null,
  reference: null,
  notes: null,
  supplier: { id: 's1', name: 'StratoFill' },
  voidedAt: null,
  voidReason: null,
  source: 'MANUAL',
  lines: [],
  payments: [],
  total: 100,
  pagado: 0,
  saldo: 100,
  aFavor: 0,
  aFavorDisponible: 0,
  pedido: 1,
  recibido: 0,
  porRecibir: 1,
  status: { pago: 'SIN_PAGAR', mercaderia: 'SIN_RECIBIR' },
  ...over,
});

function montar(facturas: Record<string, unknown>[]) {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/purchase-invoices') return Promise.resolve({ data: facturas });
    if (url === '/materials' || url === '/components' || url === '/printers') {
      return Promise.resolve({ data: [] });
    }
    if (url === '/counterparties' || url === '/clients') return Promise.resolve({ data: [] });
    if (url.startsWith('/catalog-options')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: null });
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <PurchasesPage />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('El código propio en la lista de compras', () => {
  it('muestra el código de la compra', async () => {
    montar([factura({ code: 1, reference: 'A-001' })]);
    expect(await screen.findByText('C-0001')).toBeInTheDocument();
  });

  // ⚠️ El caso que motivó el cambio: la compra del Cyan no tiene recibo y
  // aparecía sin nombre. Ahora tiene el suyo.
  it('una compra SIN número del proveedor igual tiene su código', async () => {
    montar([factura({ code: 2, reference: null })]);
    expect(await screen.findByText('C-0002')).toBeInTheDocument();
  });

  // ⚠️ Los dos tienen que convivir y verse distintos: el código identifica la
  // compra acá adentro y el número sirve para cruzar el estado de cuenta.
  it('muestra también el número del proveedor, etiquetado como suyo', async () => {
    montar([factura({ code: 3, reference: 'A-004' })]);
    expect(await screen.findByText('C-0003')).toBeInTheDocument();
    expect(await screen.findByText(/proveedor: A-004/i)).toBeInTheDocument();
  });

  it('el formulario pide el número DEL PROVEEDOR, no un número nuestro', async () => {
    montar([]);
    fireEvent.click(await screen.findByRole('button', { name: /Nueva factura|Cargar factura/i }));
    await screen.findByText('Qué pediste');
    expect(screen.getByLabelText(/N.º del proveedor/i)).toBeInTheDocument();
  });
});
