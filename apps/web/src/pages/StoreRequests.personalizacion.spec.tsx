import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

/**
 * La bandeja muestra la personalización del cliente (Feature C): la nota y la
 * foto de la línea. La foto llega como URL (la API nunca manda la clave de R2);
 * acá se dibuja como miniatura clickeable.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { StoreRequestsPage } = await import('@/pages/StoreRequests');

const SOLICITUD = {
  id: 'req-1',
  kind: 'ORDER' as const,
  status: 'NEW' as const,
  customerName: 'Ana',
  customerPhone: '0412-1234567',
  customerNote: null,
  description: null,
  lines: [
    {
      slug: 'taza',
      description: 'Taza',
      quantity: 1,
      options: {},
      unitPrice: 10,
      customNote: 'con mi logo',
      customImageUrl: 'https://cdn.example/org/custom-uploads/x.png',
    },
  ],
  totalUsd: '10.0000',
  createdAt: '2026-10-14T00:00:00.000Z',
  reviewedAt: null,
  client: null,
  order: null,
};

function montar() {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/store/requests') return Promise.resolve({ data: [SOLICITUD] });
    return Promise.resolve({ data: null });
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <ConfirmProvider>
          <MemoryRouter>
            <StoreRequestsPage />
          </MemoryRouter>
        </ConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('Bandeja: personalización del cliente', () => {
  beforeEach(() => mocks.get.mockReset());

  it('muestra la nota y la foto (miniatura con la URL) de la línea', async () => {
    montar();
    await screen.findByText(/con mi logo/);

    // La nota, tal cual.
    expect(screen.getByText(/con mi logo/)).toBeInTheDocument();
    // La foto, como <img> con la URL que mandó la API.
    const img = screen.getByRole('img', { name: /Taza/ });
    expect(img).toHaveAttribute('src', 'https://cdn.example/org/custom-uploads/x.png');
  });
});
