import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';
import { errorDeConciliacion } from '@/features/cash/aviso-de-conciliacion.ayuda';

/**
 * LAS PUERTAS QUE PASAN POR EL CANDADO DE CONCILIACIÓN — una por pantalla.
 *
 * ⚠️ Lo que se mide es el CABLEADO de cada una: que el flag llegue donde el
 * contrato lo espera. La lógica del aviso se prueba una sola vez en
 * `features/cash/aviso-de-conciliacion.spec.tsx`.
 *
 * ⚠️ **Y el detalle que un test puro no puede ver: el flag viaja en el CUERPO
 * cuando se crea o se edita, y en la QUERY cuando se borra** (un DELETE no
 * lleva cuerpo; la API lo valida con `ConfirmoConciliacionQuerySchema`).
 * Mandarlo en el lugar equivocado deja al servidor sin verlo, el 400 vuelve y
 * el botón «Guardar igual» parece roto.
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

const { SalesPage } = await import('@/pages/Sales');

function montar(nodo: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <ConfirmProvider>{nodo}</ConfirmProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const VENTA = {
  id: 's1',
  date: '2026-11-16T00:00:00.000Z',
  amount: 11,
  kind: 'COUNTER',
  note: null,
  clientId: null,
  client: null,
  originChannel: null,
  campaignId: null,
};

beforeEach(() => {
  mocks.get.mockReset().mockImplementation(async (url: string) => {
    if (url === '/sales') return { data: [VENTA] };
    return { data: [] };
  });
  mocks.post.mockReset();
  mocks.patch.mockReset();
  mocks.del.mockReset();
  notificado.error.mockReset();
});

describe('venta de mostrador', () => {
  it('crear: el 400 dibuja «Guardar igual» y reenvía con la confirmación en el CUERPO', async () => {
    mocks.post.mockRejectedValueOnce(errorDeConciliacion()).mockResolvedValue({ data: {} });
    montar(<SalesPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Registrar venta/ }));
    fireEvent.change(screen.getByRole('spinbutton', { name: /Monto/ }), {
      target: { value: '11' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }));

    expect(await screen.findByText(/fecha igual o anterior/)).toBeInTheDocument();
    expect(notificado.error).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar igual' }));

    await vi.waitFor(() => expect(mocks.post.mock.calls).toHaveLength(2));
    expect(mocks.post.mock.calls[0][1]).toMatchObject({ confirmoConciliacion: false });
    expect(mocks.post.mock.calls[1][1]).toMatchObject({
      confirmoConciliacion: true,
      amount: 11,
      kind: 'COUNTER',
    });
  });

  it('borrar: la confirmación extra reenvía con el flag en la QUERY, no en el cuerpo', async () => {
    mocks.del.mockRejectedValueOnce(errorDeConciliacion()).mockResolvedValue({ data: {} });
    montar(<SalesPage />);

    fireEvent.click((await screen.findAllByRole('button', { name: /Borrar|Eliminar/ }))[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByText(/fecha igual o anterior/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar igual' }));

    await vi.waitFor(() => expect(mocks.del.mock.calls).toHaveLength(2));
    expect(mocks.del.mock.calls[0]).toEqual([
      '/sales/s1',
      { params: { confirmoConciliacion: false } },
    ]);
    expect(mocks.del.mock.calls[1]).toEqual([
      '/sales/s1',
      { params: { confirmoConciliacion: true } },
    ]);
  });
});
