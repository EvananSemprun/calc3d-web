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
let tramosMock: unknown[] = [];

function respuesta(url: string) {
  if (url === '/store/products/p1') return { data: { ...PRODUCTO, priceTiers: tramosMock } };
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
    tramosMock = [];
  });

  /**
   * ⚠️ EL EDITOR TRABAJA EN PRECIOS, NO EN PORCENTAJES (2026-11-08).
   *
   * Con el descuento en % no se puede llegar a un precio redondo: de $10 un 27 % da
   * $7,30 pero de $1,50 da $1,0950. Y el campo cortaba a enteros con `Math.round`, así
   * que una ficha con 26,6 % guardado —hay una publicada— quedaba en 27 % al tocar
   * cualquier otra cosa: un precio que cambia sin que nadie lo pida.
   */
  it('un tramo nuevo se guarda con SU PRECIO, no con un porcentaje', async () => {
    await montar();
    await screen.findByDisplayValue('Llavero');
    fireEvent.click(screen.getByRole('button', { name: /agregar tramo/i }));
    fireEvent.change(screen.getByLabelText('Cantidad del tramo'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Precio del tramo'), { target: { value: '8.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith(
        '/store/products/p1',
        expect.objectContaining({ priceTiers: [{ minQty: 10, unitPriceUsd: 8.5 }] }),
      ),
    );
  });

  it('⚠️ un tramo VIEJO guardado como % se abre con su precio, sin cambiar lo que cobra', async () => {
    // Es la ficha publicada: 26,6 % sobre $10 son $7,34. Si el editor lo abriera en 0 o
    // lo redondeara, guardar pisaría el precio de un producto que está a la venta.
    tramosMock = [{ minQty: 20, discountPct: 0.266 }];
    await montar();
    await screen.findByDisplayValue('Llavero');
    await waitFor(() =>
      expect((screen.getByLabelText('Precio del tramo') as HTMLInputElement).value).toBe('7.34'),
    );
  });

  it('no deja guardar un tramo sin precio', async () => {
    await montar();
    await screen.findByDisplayValue('Llavero');
    fireEvent.click(screen.getByRole('button', { name: /agregar tramo/i }));
    fireEvent.change(screen.getByLabelText('Cantidad del tramo'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mocks.patch).not.toHaveBeenCalled());
  });

  it('no deja guardar un tramo que SUBE el precio: no sería mayoreo', async () => {
    await montar();
    await screen.findByDisplayValue('Llavero');
    fireEvent.click(screen.getByRole('button', { name: /agregar tramo/i }));
    fireEvent.change(screen.getByLabelText('Cantidad del tramo'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Precio del tramo'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mocks.patch).not.toHaveBeenCalled());
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

  it('⚠️ dos hijas homónimas bajo madres distintas llevan la madre entre paréntesis, también al buscar', async () => {
    const cat = (id: string, name: string, position: number, parentId: string | null) => ({
      id, name, slug: id, position, parentId,
    });
    categoriasMock = [
      cat('juguetes', 'Juguetes', 0, null),
      cat('autos-j', 'Autos', 0, 'juguetes'),
      cat('munecas', 'Muñecas', 1, 'juguetes'),
      cat('llaveros', 'Llaveros', 1, null),
      cat('autos-l', 'Autos', 0, 'llaveros'),
      cat('hogar', 'Hogar', 2, null),
      cat('oficina', 'Oficina', 3, null),
      cat('jardin', 'Jardín', 4, null),
    ]; // 8 categorías + "Sin categoría": variante con buscador
    await montar();
    await screen.findByDisplayValue('Llavero');
    fireEvent.click(await screen.findByRole('combobox', { name: 'Categoría' }));

    const textos = async () => (await screen.findAllByRole('option')).map((o) => o.textContent);
    const todas = await textos();
    expect(todas).toContain('  Autos (Juguetes)');
    expect(todas).toContain('  Autos (Llaveros)');
    // El nombre único queda limpio.
    expect(todas).toContain('  Muñecas');

    fireEvent.change(screen.getByLabelText('Buscar en la lista'), { target: { value: 'autos' } });
    await waitFor(async () =>
      expect(await textos()).toEqual(['  Autos (Juguetes)', '  Autos (Llaveros)']),
    );
  });
});
