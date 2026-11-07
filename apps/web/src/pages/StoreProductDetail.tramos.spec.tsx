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

let categoriasMock: unknown[] = [];

function respuesta(url: string) {
  if (url === '/store/products/p1') return { data: PRODUCTO };
  if (url === '/store/categories') return { data: categoriasMock };
  if (url === '/store/products') return { data: [] };
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
    categoriasMock = [];
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

  it('el selector de categoría lista las hijas sangradas bajo su madre', async () => {
    const cat = (id: string, name: string, position: number, parentId: string | null) => ({
      id, name, slug: id, position, parentId,
    });
    // Desordenadas a propósito: el orden lo tiene que dar el árbol, no la entrada.
    categoriasMock = [
      cat('autos', 'Autos', 0, 'juguetes'),
      cat('hogar', 'Hogar', 1, null),
      cat('juguetes', 'Juguetes', 0, null),
    ];
    await montar();
    await screen.findByDisplayValue('Llavero');
    fireEvent.click(await screen.findByRole('combobox', { name: 'Categoría' }));
    const textos = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(textos).toEqual(['Sin categoría', 'Juguetes', '\u00A0\u00A0Autos', 'Hogar']);
  });

  it('con 8 o más categorías (variante con buscador) la hija conserva la sangría, también al filtrar', async () => {
    const cat = (id: string, name: string, position: number, parentId: string | null) => ({
      id, name, slug: id, position, parentId,
    });
    categoriasMock = [
      cat('juguetes', 'Juguetes', 0, null),
      cat('autos', 'Autos', 0, 'juguetes'),
      cat('munecas', 'Muñecas', 1, 'juguetes'),
      cat('hogar', 'Hogar', 1, null),
      cat('cocina', 'Cocina', 0, 'hogar'),
      cat('oficina', 'Oficina', 2, null),
      cat('jardin', 'Jardín', 3, null),
      cat('mascotas', 'Mascotas', 4, null),
    ]; // 8 categorías + "Sin categoría" = 9 opciones, sobre el mínimo para buscar
    await montar();
    await screen.findByDisplayValue('Llavero');
    fireEvent.click(await screen.findByRole('combobox', { name: 'Categoría' }));

    const textos = async () => (await screen.findAllByRole('option')).map((o) => o.textContent);
    const todas = await textos();
    expect(todas.slice(0, 5)).toEqual([
      'Sin categoría', 'Juguetes', '\u00A0\u00A0Autos', '\u00A0\u00A0Muñecas', 'Hogar',
    ]);
    expect(todas.indexOf('\u00A0\u00A0Cocina')).toBe(todas.indexOf('Hogar') + 1);

    // Mayúsculas: ejerce el normalizado del buscador sin tocar la sangría.
    fireEvent.change(screen.getByLabelText('Buscar en la lista'), { target: { value: 'AUTOS' } });
    await waitFor(async () => expect(await textos()).toEqual(['\u00A0\u00A0Autos']));
    // Con acento: "muñecas" se encuentra escribiendo "munecas".
    fireEvent.change(screen.getByLabelText('Buscar en la lista'), { target: { value: 'munecas' } });
    await waitFor(async () => expect(await textos()).toEqual(['\u00A0\u00A0Muñecas']));
  });
});
