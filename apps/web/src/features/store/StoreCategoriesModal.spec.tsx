import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

vi.mock('@/components/toast', () => ({
  notify: { error: vi.fn(), success: vi.fn() },
}));

const CATEGORIAS = [
  { id: 'madre', name: 'Llaveros', slug: 'llaveros', position: 0, parentId: null },
  { id: 'hija', name: 'Anime', slug: 'anime', position: 1, parentId: 'madre' },
];

async function montar() {
  mocks.get.mockImplementation((url: string) =>
    Promise.resolve({ data: url === '/store/categories' ? CATEGORIAS : [] }),
  );
  mocks.patch.mockResolvedValue({ data: CATEGORIAS[1] });
  const { StoreCategoriesModal } = await import('./StoreCategoriesModal');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <ConfirmProvider>
          <StoreCategoriesModal open onOpenChange={() => {}} />
        </ConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('StoreCategoriesModal', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it('⚠️ al renombrar, el PATCH incluye el parentId: antes el hook mandaba solo { name }', async () => {
    await montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Renombrar Anime' }));
    const campo = await screen.findByLabelText('Nuevo nombre de Anime');
    fireEvent.change(campo, { target: { value: 'Animé' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar nombre/i }));
    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/store/categories/hija', {
        name: 'Animé',
        parentId: 'madre',
      }),
    );
  });
});
