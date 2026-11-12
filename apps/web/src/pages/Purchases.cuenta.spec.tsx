import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';
import type { PurchaseInvoice } from '@/features/purchases/api';

/**
 * LA CUENTA DEL ABONO LLEGA AL SERVIDOR.
 *
 * El servidor ya aceptaba `accountId` y lo validaba por organización, pero el
 * modal nunca lo mandaba: el dueño escribía «Binance» a mano en la nota. Este
 * archivo prueba el CABLEADO (lo que viaja en el POST), que es lo que borrar una
 * línea del JSX rompería sin que ninguna función pura se entere.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { PurchasesPage } = await import('@/pages/Purchases');

const FACTURA: PurchaseInvoice = {
  id: 'f1',
  code: 1,
  date: '2026-11-05T00:00:00.000Z',
  expectedAt: null,
  reference: 'FAC-0001',
  notes: null,
  supplier: { id: 's1', name: 'StratoFill' },
  voidedAt: null,
  voidReason: null,
  createdAt: '2026-11-05T10:00:00.000Z',
  source: 'MANUAL',
  lines: [
    {
      id: 'l1',
      materialId: 'm1',
      materialName: 'PLA Negro',
      printerId: null,
      printerName: null,
      nombreNuevo: null,
      componentId: null,
      componentName: null,
      nuevoTipo: null,
      nuevaMarca: null,
      nuevoTipoFilamento: null,
      nuevoColor: null,
      isRefill: null,
      quantity: 2,
      unitPrice: 25,
      received: 2,
      porRecibir: 0,
      recepciones: [],
    },
  ],
  payments: [],
  total: 50,
  pagado: 0,
  saldo: 50,
  aFavor: 0,
  aFavorDisponible: 0,
  pedido: 2,
  recibido: 2,
  porRecibir: 0,
  status: { pago: 'SIN_PAGAR', mercaderia: 'RECIBIDA' },
};

const CUENTA = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  kind: 'EXCHANGE',
  currency: 'USD',
  shared: false,
  sharedWithId: null,
  autoAttributeShortfall: false,
  isDefault: false,
  active: true,
  ...over,
});

function montar() {
  mocks.post.mockResolvedValue({ data: {} });
  mocks.get.mockImplementation((url: string) => {
    if (url === '/purchase-invoices') return Promise.resolve({ data: [FACTURA] });
    if (url === '/cash-accounts')
      return Promise.resolve({ data: [CUENTA('acc1', 'Binance'), CUENTA('acc2', 'Banesco')] });
    if (url === '/counterparties' || url === '/clients') return Promise.resolve({ data: [] });
    if (url === '/materials' || url === '/printers') return Promise.resolve({ data: [] });
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

async function abrirAbonar() {
  montar();
  const referencia = await screen.findByText(/FAC-0001/);
  const tarjeta = referencia.closest('li');
  if (!tarjeta) throw new Error('la tarjeta de la factura no se dibujó');
  fireEvent.click(within(tarjeta).getByRole('button', { name: 'Abonar' }));
  await screen.findByText('Abonar a la factura');
}

/** Se abre con el TECLADO: con el puntero Radix espera un `pointerup` que jsdom no sintetiza. */
async function elegirCuenta(nombre: string) {
  const selector = await screen.findByLabelText('¿De qué cuenta salió?');
  fireEvent.keyDown(selector, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByText(nombre));
}

const cuerpoDelPost = () => mocks.post.mock.calls[0][1] as Record<string, unknown>;

describe('Abonar: la cuenta de la que salió la plata', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
  });

  it('la cuenta que elige el dueño viaja en el POST', async () => {
    await abrirAbonar();
    await elegirCuenta('Binance');
    fireEvent.click(screen.getByRole('button', { name: 'Abonar' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post.mock.calls[0][0]).toBe('/purchase-invoices/f1/payments');
    expect(cuerpoDelPost().accountId).toBe('acc1');
  });

  it('…y su hermano: sin elegir ninguna, viaja null (no una por defecto inventada)', async () => {
    await abrirAbonar();
    await screen.findByLabelText('¿De qué cuenta salió?');
    fireEvent.click(screen.getByRole('button', { name: 'Abonar' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(cuerpoDelPost().accountId).toBeNull();
  });
});
