import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, patch: mocks.patch, post: mocks.post, delete: mocks.del },
  apiErrorMessage: () => 'falló',
}));

const cat = (id: string, name: string, position: number, parentId: string | null) => ({
  id, name, slug: id, position, parentId,
});

const producto = (id: string, name: string, categoryId: string | null) => ({
  id, slug: id, name, kind: 'PHYSICAL', summary: null, description: null,
  priceUsd: '10.0000', compareAtUsd: null, leadTimeDays: null, minQty: 1, material: null,
  badge: null, custom: false, specs: [], priceTiers: [], visible: true, position: 0,
  categoryId, category: categoryId ? { id: categoryId, name: 'x', slug: 'x' } : null,
  productId: null, quoteId: null, costAtPublish: null, images: [], optionGroups: [],
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
});

const CATEGORIAS = [
  cat('juguetes', 'Juguetes', 0, null),
  cat('autos-j', 'Autos', 0, 'juguetes'),
  cat('llaveros', 'Llaveros', 1, null),
  cat('autos-l', 'Autos', 0, 'llaveros'),
];
const PRODUCTOS = [
  producto('p1', 'Auto de juguete', 'autos-j'),
  producto('p2', 'Llavero auto', 'autos-l'),
  producto('p3', 'Peluche', 'juguetes'),
  producto('p4', 'Sin clasificar', null),
];

let categoriasMock: unknown[] = CATEGORIAS;
let qc: QueryClient;

function respuesta(url: string) {
  if (url === '/store/products') return { data: PRODUCTOS };
  if (url === '/store/categories') return { data: categoriasMock };
  if (url === '/store/status') return { data: { storageReady: true } };
  if (url === '/settings') return { data: { currency: 'USD', locale: 'es-VE' } };
  return { data: null };
}

async function montar() {
  mocks.get.mockImplementation((url: string) => Promise.resolve(respuesta(url)));
  const { StorePage } = await import('@/pages/Store');
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TooltipProvider>
          <ConfirmProvider>
            <StorePage />
          </ConfirmProvider>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText('Peluche');
}

/** Abre el filtro de categoría y elige la opción en la posición dada (0 = «todas»). */
async function elegirCategoria(posicion: number) {
  const trigger = await screen.findByRole('combobox', { name: 'Categoría' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const opciones = await screen.findAllByRole('option');
  fireEvent.click(opciones[posicion]);
}

const visibles = () =>
  ['Auto de juguete', 'Llavero auto', 'Peluche', 'Sin clasificar'].filter(
    (n) => screen.queryByText(n) !== null,
  );

describe('Tienda (vitrina del panel) — filtro por categoría', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    categoriasMock = CATEGORIAS;
  });

  it('las opciones salen de las categorías y muestran la jerarquía con sangría', async () => {
    await montar();
    fireEvent.keyDown(await screen.findByRole('combobox', { name: 'Categoría' }), { key: 'Enter' });
    const textos = (await screen.findAllByRole('option')).map((o) => o.textContent);
    // «Autos» está en las dos madres: cada una lleva la suya entre paréntesis.
    expect(textos).toEqual([
      'Categoría: todas', 'Juguetes', '  Autos (Juguetes)', 'Llaveros',
      '  Autos (Llaveros)',
    ]);
  });

  it('⚠️ dos subcategorías homónimas bajo madres distintas NO se mezclan al filtrar', async () => {
    await montar();
    await elegirCategoria(2); // «Autos» bajo Juguetes
    await waitFor(() => expect(visibles()).toEqual(['Auto de juguete']));

    await elegirCategoria(4); // «Autos» bajo Llaveros
    await waitFor(() => expect(visibles()).toEqual(['Llavero auto']));
  });

  it('filtrar por una madre incluye los productos de sus hijas', async () => {
    await montar();
    await elegirCategoria(1); // Juguetes
    await waitFor(() => expect(visibles()).toEqual(['Auto de juguete', 'Peluche']));
  });

  it('una madre sin productos propios (todos en sus hijas) igual se puede elegir', async () => {
    await montar();
    await elegirCategoria(3); // Llaveros: su único producto está en «Autos»
    await waitFor(() => expect(visibles()).toEqual(['Llavero auto']));
  });

  it('una categoría que ya no existe deja el filtro en «todas» y no vacía la vitrina', async () => {
    await montar();
    await elegirCategoria(2);
    await waitFor(() => expect(visibles()).toEqual(['Auto de juguete']));

    categoriasMock = [cat('llaveros', 'Llaveros', 1, null)];
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ['store', 'categories'] });
    });

    await waitFor(() => expect(visibles()).toHaveLength(4));
    expect(screen.getByRole('combobox', { name: 'Categoría' }).textContent).toContain(
      'Categoría: todas',
    );
  });
});
