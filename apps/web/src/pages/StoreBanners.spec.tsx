import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
}));

const BANNERS = [
  {
    id: 'b1',
    title: 'Promo de verano',
    subtitle: 'Hasta agotar',
    imageKey: 'org/store/banners/a.png',
    imageUrl: 'https://cdn.example/org/store/banners/a.png',
    linkType: 'URL',
    linkValue: 'https://wa.me/58412',
    position: 0,
    visible: true,
  },
  {
    id: 'b2',
    title: 'Llaveros nuevos',
    subtitle: null,
    imageKey: 'org/store/banners/b.png',
    imageUrl: 'https://cdn.example/org/store/banners/b.png',
    linkType: 'CATEGORY',
    linkValue: 'llaveros',
    position: 1,
    visible: false,
  },
];

function respuestaPorUrl(url: string) {
  if (url === '/store/banners') return { data: BANNERS };
  if (url === '/store/status') return { data: { storageReady: true } };
  if (url === '/store/categories') return { data: [] };
  if (url === '/store/products') return { data: [] };
  return { data: null };
}

async function montar() {
  mocks.get.mockImplementation((url: string) => Promise.resolve(respuestaPorUrl(url)));
  const { StoreBannersPage } = await import('@/pages/StoreBanners');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TooltipProvider>
          <ConfirmProvider>
            <StoreBannersPage />
          </ConfirmProvider>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('StoreBannersPage', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.patch.mockReset();
    mocks.del.mockReset();
  });

  it('lista los banners cargados', async () => {
    await montar();
    expect(await screen.findByText('Promo de verano')).toBeInTheDocument();
    expect(screen.getByText('Llaveros nuevos')).toBeInTheDocument();
    // El oculto muestra su insignia.
    expect(screen.getByText('Oculto')).toBeInTheDocument();
  });

  it('"Nuevo banner" abre el formulario', async () => {
    await montar();
    await screen.findByText('Promo de verano');
    fireEvent.click(screen.getByRole('button', { name: /nuevo banner/i }));
    // El formulario (único lugar con "Subir imagen" y "Guardar") aparece.
    expect(await screen.findByText('Subir imagen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });
});
