import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';
import { errorCualquiera, errorDeConciliacion } from '@/features/cash/aviso-de-conciliacion.ayuda';

/**
 * EL CALLEJÓN SIN SALIDA DEL AVISO DE CONCILIACIÓN — abono de encargo.
 *
 * El caso REAL del dueño (2026-11-16): abono del encargo #56, $11, fecha 16/11,
 * con una conciliación confirmada de ese mismo día. El servidor contesta 400
 * con «vuelve a intentarlo confirmando», salía un toast, y el diálogo **no
 * tenía con qué confirmar**: reintentar daba el mismo toast y el abono no se
 * guardaba nunca.
 *
 * ⚠️ Lo que se mide acá es lo que ningún test puro puede ver: que el 400 dibuje
 * el botón, y que tocarlo reenvíe **con** `confirmoConciliacion`. El candado del
 * servidor ya tiene sus 64 tests (`conciliacion-cableado.spec.ts`); el agujero
 * estaba en esta mitad.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));
const notificado = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));
vi.mock('@/components/toast', () => ({ notify: notificado, Toaster: () => null }));

const { OrderDetailPage } = await import('@/pages/OrderDetail');

const ENCARGO = {
  id: 'o1',
  code: 56,
  status: 'CONFIRMED',
  deliveryDate: null,
  notes: null,
  originChannel: null,
  campaignId: null,
  printerId: null,
  reprints: null,
  currencyLabel: null,
  exchangeRates: null,
  settledAt: null,
  client: { id: 'c1', name: 'Victoria Fuenmayor', phone: null },
  lines: [{ description: 'Llaveros', quantity: 20, unit: 'u', unitPrice: 1.5 }],
  payments: [],
  total: 30,
  paid: 0,
  balance: 30,
};

function montar() {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/orders/o1') return Promise.resolve({ data: ENCARGO });
    if (url === '/exchange-rates') return Promise.resolve({ data: { rates: [] } });
    if (url === '/campaigns') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: null });
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/orders/o1']}>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function abrirYGuardar() {
  montar();
  fireEvent.click(await screen.findByRole('button', { name: /Abono/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Registrar abono/ }));
}

const abonos = () => mocks.post.mock.calls.filter((c) => String(c[0]).includes('/payments'));

describe('abono de encargo: el aviso de conciliación tiene salida', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    notificado.error.mockReset();
  });

  it('el 400 del candado dibuja el aviso y «Guardar igual», no un toast', async () => {
    mocks.post.mockRejectedValue(errorDeConciliacion());
    await abrirYGuardar();

    // El texto es el del SERVIDOR, con la fecha y el estado de la conciliación.
    expect(await screen.findByText(/fecha igual o anterior/)).toBeInTheDocument();
    expect(screen.getByText(/2026-11-16 \(confirmada\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar igual' })).toBeInTheDocument();
    // ⚠️ El toast se va solo y deja al dueño sin la salida: era el bug.
    expect(notificado.error).not.toHaveBeenCalled();
  });

  it('«Guardar igual» reenvía CON confirmoConciliacion y guarda', async () => {
    mocks.post.mockRejectedValueOnce(errorDeConciliacion()).mockResolvedValue({ data: {} });
    await abrirYGuardar();

    fireEvent.click(await screen.findByRole('button', { name: 'Guardar igual' }));

    await vi.waitFor(() => expect(abonos()).toHaveLength(2));
    expect(abonos()[0][1]).toMatchObject({ confirmoConciliacion: false });
    expect(abonos()[1][1]).toMatchObject({ confirmoConciliacion: true });
    // El mismo abono, no otro: la fecha y el monto se reenvían tal cual.
    expect(abonos()[1][1]).toMatchObject({ amount: 30 });
  });

  it('un 400 que NO es el candado sigue saliendo por toast, sin botón', async () => {
    mocks.post.mockRejectedValue(errorCualquiera());
    await abrirYGuardar();

    await vi.waitFor(() => expect(notificado.error).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Guardar igual' })).not.toBeInTheDocument();
  });

  it('el aviso va en ÁMBAR y en píldora, no en rojo', async () => {
    // El ámbar y el oro de marca miden 1.04:1: el borde y el fondo lo separan
    // por FORMA. Y rojo querría decir «te frena», que no es el caso.
    mocks.post.mockRejectedValue(errorDeConciliacion());
    await abrirYGuardar();

    const pildora = (await screen.findByText(/fecha igual o anterior/)).parentElement!;
    expect(pildora.className).toContain('border-warning/50');
    expect(pildora.className).toContain('bg-warning/10');
    expect(pildora.className).not.toContain('destructive');
  });
});
