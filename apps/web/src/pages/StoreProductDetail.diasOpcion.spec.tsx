import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

/**
 * DÍAS DE ENTREGA POR OPCIÓN (2026-11-09).
 *
 * El plazo era del producto entero, así que el dueño lo venía escribiendo a mano DENTRO
 * del nombre de la opción («20 cm · 3 días»). Ahora cada opción tiene su campo y la
 * tienda puede calcular el plazo de la combinación elegida.
 *
 * ⚠️ Lo que se fija acá es que el campo LLEGUE AL GUARDADO. El input se puede pintar
 * perfecto y no viajar en el PATCH: ahí el dueño escribe los días, ve «Producto
 * guardado» y no cambia nada. Por eso el test mira el cuerpo de la petición.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, patch: mocks.patch, post: mocks.post, delete: mocks.del },
  apiErrorMessage: () => 'falló',
}));

const PRODUCTO = {
  id: 'p1',
  slug: 'arbol',
  name: 'Árbol de Navidad',
  kind: 'PHYSICAL',
  summary: null,
  description: null,
  priceUsd: '8.0000',
  compareAtUsd: null,
  leadTimeDays: 2,
  minQty: 1,
  material: null,
  badge: null,
  custom: false,
  specs: [],
  priceTiers: [],
  visible: true,
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
      name: 'Tamaño',
      required: true,
      drivesPhoto: false,
      options: [
        { id: 'o1', value: '15 cm', priceDeltaUsd: '0', swatchHex: null, leadTimeDays: null, images: [] },
        { id: 'o2', value: '30 cm', priceDeltaUsd: '14.0000', swatchHex: null, leadTimeDays: 3, images: [] },
      ],
    },
  ],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation((url: string) => {
    if (url.startsWith('/store/products/')) return Promise.resolve({ data: PRODUCTO });
    if (url === '/store/categories') return Promise.resolve({ data: [] });
    if (url === '/store/status') return Promise.resolve({ data: { storageReady: false } });
    if (url === '/exchange-rates') return Promise.resolve({ data: { rates: [] } });
    if (url === '/settings') return Promise.resolve({ data: { currency: 'USD', locale: 'en-US' } });
    return Promise.resolve({ data: null });
  });
  mocks.patch.mockResolvedValue({ data: PRODUCTO });
});

async function montar() {
  const { StoreProductDetailPage } = await import('@/pages/StoreProductDetail');
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/store/products/p1']}>
        <TooltipProvider>
          <ConfirmProvider>
            <Routes>
              <Route path="/store/products/:id" element={<StoreProductDetailPage />} />
            </Routes>
          </ConfirmProvider>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByDisplayValue('Árbol de Navidad');
}

const diasDe = (opcion: string) => screen.getByLabelText(`Días de entrega de ${opcion}`);

describe('el panel edita los días de entrega de cada opción', () => {
  it('muestra los días guardados de cada opción', async () => {
    await montar();
    expect((diasDe('15 cm') as HTMLInputElement).value).toBe('');
    expect((diasDe('30 cm') as HTMLInputElement).value).toBe('3');
  });

  it('los días escritos VIAJAN en el guardado', async () => {
    await montar();
    fireEvent.change(diasDe('15 cm'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    const cuerpo = mocks.patch.mock.calls[0][1] as {
      optionGroups: { options: { value: string; leadTimeDays: number | null }[] }[];
    };
    expect(cuerpo.optionGroups[0].options).toEqual([
      expect.objectContaining({ value: '15 cm', leadTimeDays: 1 }),
      expect.objectContaining({ value: '30 cm', leadTimeDays: 3 }),
    ]);
  });

  it('vacío viaja como null, no como 0: un 0 sería entrega el mismo día', async () => {
    await montar();
    fireEvent.change(diasDe('30 cm'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    const cuerpo = mocks.patch.mock.calls[0][1] as {
      optionGroups: { options: { value: string; leadTimeDays: number | null }[] }[];
    };
    expect(cuerpo.optionGroups[0].options[1].leadTimeDays).toBeNull();
  });
});
