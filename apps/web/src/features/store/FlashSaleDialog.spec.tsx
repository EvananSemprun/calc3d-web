import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/overlays';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, patch: mocks.patch },
  apiErrorMessage: () => 'falló',
}));

function settings(extra: Record<string, unknown> = {}) {
  return {
    data: {
      currency: 'USD', locale: 'es-VE', hasLogo: false, businessName: 'Banano Lab',
      saleTitle: null, saleStartsAt: null, saleEndsAt: null, ...extra,
    },
  };
}

async function montar() {
  mocks.get.mockImplementation((url: string) =>
    url === '/settings' ? Promise.resolve(settings()) : Promise.resolve({ data: null }),
  );
  mocks.patch.mockResolvedValue(settings());
  const { FlashSaleDialog } = await import('./FlashSaleDialog');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <FlashSaleDialog open onOpenChange={() => {}} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('FlashSaleDialog', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.patch.mockReset();
  });

  it('guarda las fechas convertidas a UTC', async () => {
    await montar();
    fireEvent.change(await screen.findByLabelText(/título/i), { target: { value: 'Oferta' } });
    fireEvent.change(screen.getByLabelText(/empieza/i), { target: { value: '2026-10-20T18:00' } });
    fireEvent.change(screen.getByLabelText(/termina/i), { target: { value: '2026-10-27T23:00' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/settings', {
        saleTitle: 'Oferta',
        saleStartsAt: '2026-10-20T22:00:00.000Z',
        saleEndsAt: '2026-10-28T03:00:00.000Z',
      }),
    );
  });

  it('no guarda si el fin no es posterior al inicio', async () => {
    await montar();
    fireEvent.change(await screen.findByLabelText(/empieza/i), { target: { value: '2026-10-20T18:00' } });
    fireEvent.change(screen.getByLabelText(/termina/i), { target: { value: '2026-10-20T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));
    await screen.findByText(/debe terminar después/i);
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('"Quitar oferta" manda los tres en null', async () => {
    await montar();
    fireEvent.click(await screen.findByRole('button', { name: /quitar oferta/i }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/settings', {
        saleTitle: null,
        saleStartsAt: null,
        saleEndsAt: null,
      }),
    );
  });
});
