import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

/**
 * FOTO POR COLOR — el panel (Fase B).
 *
 * Lo que se fija acá es lo que la Review Focus del plan pide del panel: al editar
 * un producto, el DTO conserva los `id` de los grupos y opciones que ya existían
 * (si no, el diff por id del backend no reconoce nada y las fotos enlazadas a una
 * opción se pierden) y marca `drivesPhoto` en el grupo que define la foto, de a
 * uno por vez.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), del: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, patch: mocks.patch, delete: mocks.del, post: mocks.post },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { StoreProductDetailPage } = await import('@/pages/StoreProductDetail');

/** Producto con un grupo Color (Rojo, Azul) con ids, como lo precarga `editar`. */
const PRODUCTO = {
  id: 'sp1',
  slug: 'llavero',
  name: 'Llavero',
  kind: 'PHYSICAL' as const,
  summary: null,
  description: null,
  priceUsd: '10.0000',
  compareAtUsd: null,
  leadTimeDays: null,
  minQty: 1,
  material: null,
  badge: null,
  custom: false,
  specs: [],
  priceTiers: [],
  visible: false,
  position: 0,
  categoryId: null,
  category: null,
  productId: null,
  quoteId: null,
  costAtPublish: null,
  images: [],
  optionGroups: [
    {
      id: 'g1',
      name: 'Color',
      required: true,
      drivesPhoto: false,
      options: [
        { id: 'o1', value: 'Rojo', priceDeltaUsd: '0', swatchHex: '#FF0000', images: [] },
        { id: 'o2', value: 'Azul', priceDeltaUsd: '0', swatchHex: '#0000FF', images: [] },
      ],
    },
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  recost: null,
};

function montar() {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/store/products/sp1') return Promise.resolve({ data: PRODUCTO });
    if (url === '/store/categories') return Promise.resolve({ data: [] });
    if (url === '/store/status') return Promise.resolve({ data: { storageReady: true } });
    return Promise.resolve({ data: null });
  });
  mocks.patch.mockResolvedValue({ data: PRODUCTO });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={['/store/sp1']}>
            <Routes>
              <Route path="/store/:id" element={<StoreProductDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('Tienda: foto por color (panel)', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.patch.mockReset();
  });

  it('al marcar "define la foto" guarda drivesPhoto:true y conserva los ids', async () => {
    montar();
    // El formulario cargó con el nombre del producto.
    await screen.findByDisplayValue('Llavero');

    fireEvent.click(screen.getByRole('switch', { name: 'Este grupo define la foto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    const [url, body] = mocks.patch.mock.calls[0];
    expect(url).toBe('/store/products/sp1');
    expect(body.optionGroups).toHaveLength(1);
    // El grupo conserva su id y queda marcado como el que define la foto.
    expect(body.optionGroups[0]).toMatchObject({ id: 'g1', drivesPhoto: true });
    // Y las opciones conservan los suyos: es lo que el diff del backend reconoce.
    expect(body.optionGroups[0].options[0].id).toBe('o1');
    expect(body.optionGroups[0].options[1].id).toBe('o2');
  });

  it('marcar "define la foto" es exclusivo: desmarca el otro grupo', async () => {
    // Dos grupos, los dos empiezan sin definir la foto.
    const dosGrupos = {
      ...PRODUCTO,
      optionGroups: [
        PRODUCTO.optionGroups[0],
        {
          id: 'g2',
          name: 'Tamaño',
          required: false,
          drivesPhoto: false,
          options: [{ id: 'o3', value: 'Grande', priceDeltaUsd: '2', swatchHex: null, images: [] }],
        },
      ],
    };
    mocks.get.mockImplementation((url: string) => {
      if (url === '/store/products/sp1') return Promise.resolve({ data: dosGrupos });
      if (url === '/store/categories') return Promise.resolve({ data: [] });
      if (url === '/store/status') return Promise.resolve({ data: { storageReady: true } });
      return Promise.resolve({ data: null });
    });
    mocks.patch.mockResolvedValue({ data: dosGrupos });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <ConfirmProvider>
            <MemoryRouter initialEntries={['/store/sp1']}>
              <Routes>
                <Route path="/store/:id" element={<StoreProductDetailPage />} />
              </Routes>
            </MemoryRouter>
          </ConfirmProvider>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    await screen.findByDisplayValue('Llavero');

    const toggles = screen.getAllByRole('switch', { name: 'Este grupo define la foto' });
    expect(toggles).toHaveLength(2);
    fireEvent.click(toggles[0]); // marca el Color
    fireEvent.click(toggles[1]); // marcar Tamaño debe desmarcar Color

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    const body = mocks.patch.mock.calls[0][1];
    expect(body.optionGroups.filter((g: { drivesPhoto: boolean }) => g.drivesPhoto)).toHaveLength(1);
    expect(body.optionGroups.find((g: { id: string }) => g.id === 'g2').drivesPhoto).toBe(true);
  });
});
