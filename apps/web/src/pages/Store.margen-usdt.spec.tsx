import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

/**
 * EL MARGEN DE LA TARJETA SE MIDE EN USDT (2026-11-08).
 *
 * El costo se calcula en USDT y el precio se publica en dólares BCV, que valen menos.
 * Hasta hoy la tarjeta dividía uno por el otro y mostraba un margen inflado: el llavero
 * decía 582 % donde el real era 498 %.
 *
 * ⚠️ La cuenta vive en `shared` y ya tiene sus tests; lo que se fija acá es que la
 * PANTALLA use la convertida. Cambiar `usdt.margen(...)` por `productMarkup(...)` deja
 * los 970 tests de función pura en verde y la tarjeta mintiendo otra vez.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, patch: mocks.patch, post: mocks.post, delete: mocks.del },
  apiErrorMessage: () => 'falló',
}));

/** Un producto a $1,50 BCV con costo $0,22 USDT: el caso real de los identificadores. */
const PRODUCTO = {
  id: 'p1',
  slug: 'identificadores',
  name: 'Identificadores',
  kind: 'PHYSICAL',
  summary: null,
  description: null,
  priceUsd: '1.5000',
  compareAtUsd: null,
  leadTimeDays: null,
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
  costAtPublish: '0.2200',
  images: [],
  optionGroups: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

/** Las tasas del 2026-11-08: el dólar BCV vale menos que el USDT. */
const TASAS = [
  { label: 'BCV Dólar', currencyCode: 'VES', rate: 900 },
  { label: 'Binance / USDT', currencyCode: 'VES', rate: 1026 },
];

async function montar(rates: unknown[] = TASAS) {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/store/products') return Promise.resolve({ data: [PRODUCTO] });
    if (url === '/store/categories') return Promise.resolve({ data: [] });
    if (url === '/store/status') return Promise.resolve({ data: { storageReady: true } });
    if (url === '/exchange-rates') return Promise.resolve({ data: { rates } });
    if (url === '/settings')
      return Promise.resolve({
        data: {
          currency: 'USD',
          locale: 'en-US',
          defaultRateLabel: 'BCV Dólar',
          protectionRateLabel: 'Binance / USDT',
        },
      });
    return Promise.resolve({ data: null });
  });
  const { StorePage } = await import('@/pages/Store');
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <TooltipProvider>
          <ConfirmProvider>
            <StorePage />
          </ConfirmProvider>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText('Identificadores');
}

describe('la tarjeta del catálogo mide el margen contra lo que entra', () => {
  it('muestra el margen en USDT, no el de la etiqueta en BCV', async () => {
    await montar();
    // 1.50 × 900 / 1026 = 1.32 USDT → (1.32 − 0.22) / 0.22 = 500 %.
    // El nominal sería (1.50 − 0.22) / 0.22 = 582 %, que es lo que decía antes.
    const margen = await screen.findByText(/margen/i);
    expect(margen.textContent).toContain('500%');
    expect(margen.textContent).toContain('USDT');
    expect(margen.textContent).not.toContain('582');
  });

  it('sin las tasas cargadas no se atribuye ser el real', async () => {
    await montar([]);
    const margen = await screen.findByText(/margen/i);
    expect(margen.textContent).toContain('sobre el costo');
    expect(margen.textContent).not.toContain('USDT');
  });
});
