import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, patch: mocks.patch, post: mocks.post, delete: mocks.del },
  apiErrorMessage: () => 'falló',
}));

const PRODUCTO = {
  id: 'p1', slug: 'llavero', name: 'Llavero', kind: 'PHYSICAL',
  summary: null, description: null, priceUsd: '10.0000', compareAtUsd: null,
  leadTimeDays: null, minQty: 1, material: null, badge: null, custom: false,
  specs: [], priceTiers: [], visible: true, position: 0, categoryId: null, category: null,
  productId: null, quoteId: null, costAtPublish: null, images: [], optionGroups: [],
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
};

function respuesta(url: string) {
  if (url === '/store/products/p1') return { data: PRODUCTO };
  if (url === '/store/categories') return { data: [] };
  if (url === '/store/status') return { data: { storageReady: true } };
  if (url === '/settings') return { data: { currency: 'USD', locale: 'es-VE' } };
  return { data: null };
}

async function montar() {
  mocks.get.mockImplementation((url: string) => Promise.resolve(respuesta(url)));
  mocks.patch.mockResolvedValue({ data: PRODUCTO });
  const { StoreProductDetailPage } = await import('@/pages/StoreProductDetail');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/store/p1']}>
        <TooltipProvider>
          <ConfirmProvider>
            <Routes>
              <Route path="/store/:id" element={<StoreProductDetailPage />} />
            </Routes>
          </ConfirmProvider>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StoreProductDetail — precios por cantidad', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.patch.mockReset();
    mocks.post.mockReset();
    mocks.del.mockReset();
  });

  it('agrega un tramo y lo guarda como fracción', async () => {
    await montar();
    await screen.findByDisplayValue('Llavero');
    fireEvent.click(screen.getByRole('button', { name: /agregar tramo/i }));
    fireEvent.change(screen.getByLabelText('Cantidad del tramo'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Descuento del tramo %'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        '/store/products/p1',
        expect.objectContaining({ priceTiers: [{ minQty: 10, discountPct: 0.1 }] }),
      ),
    );
  });
});
