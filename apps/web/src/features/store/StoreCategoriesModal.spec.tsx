import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useCreateStoreCategory, useUpdateStoreCategory } from './api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';
import { notify } from '@/components/toast';

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
  { id: 'otra', name: 'Figuras', slug: 'figuras', position: 2, parentId: null },
];

/** Productos: 1 directo en la madre y 2 en su hija. */
const PRODUCTOS = [
  { id: 'p1', categoryId: 'madre' },
  { id: 'p2', categoryId: 'hija' },
  { id: 'p3', categoryId: 'hija' },
];

async function montar(categorias: unknown[] = CATEGORIAS, productos: unknown[] = []) {
  mocks.get.mockImplementation((url: string) =>
    Promise.resolve({ data: url === '/store/categories' ? categorias : productos }),
  );
  mocks.patch.mockResolvedValue({ data: CATEGORIAS[1] });
  mocks.post.mockResolvedValue({ data: CATEGORIAS[1] });
  mocks.del.mockResolvedValue({});
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

function envoltura() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

/** Cuerpo real de la última llamada (toHaveBeenCalledWith no distingue clave ausente de undefined). */
const cuerpoPatch = () => mocks.patch.mock.calls.at(-1)![1] as Record<string, unknown>;

describe('hooks de categoría', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.patch.mockResolvedValue({ data: CATEGORIAS[1] });
    mocks.post.mockResolvedValue({ data: CATEGORIAS[1] });
  });

  it('renombrar NO manda parentId: el cuerpo del PATCH no trae la clave', async () => {
    const { result } = renderHook(() => useUpdateStoreCategory(), { wrapper: envoltura() });
    await result.current.mutateAsync({ id: 'hija', name: 'Animé' });
    expect(mocks.patch.mock.calls.at(-1)![0]).toBe('/store/categories/hija');
    expect('parentId' in cuerpoPatch()).toBe(false);
    expect(cuerpoPatch()).toEqual({ name: 'Animé' });
  });

  it('mover manda parentId con su valor', async () => {
    const { result } = renderHook(() => useUpdateStoreCategory(), { wrapper: envoltura() });
    await result.current.mutateAsync({ id: 'hija', parentId: 'otra' });
    expect(cuerpoPatch()).toEqual({ parentId: 'otra' });
    expect('name' in cuerpoPatch()).toBe(false);
  });

  it('mover a la raíz manda parentId: null', async () => {
    const { result } = renderHook(() => useUpdateStoreCategory(), { wrapper: envoltura() });
    await result.current.mutateAsync({ id: 'hija', parentId: null });
    expect(cuerpoPatch()).toEqual({ parentId: null });
  });

  it('crear con madre manda parentId en el POST', async () => {
    const { result } = renderHook(() => useCreateStoreCategory(), { wrapper: envoltura() });
    await result.current.mutateAsync({ name: 'Anime', parentId: 'madre' });
    expect(mocks.post).toHaveBeenCalledWith('/store/categories', { name: 'Anime', parentId: 'madre' });
  });
});

describe('StoreCategoriesModal', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    vi.mocked(notify.error).mockClear();
  });

  const abrirDesplegable = (nombre: string | RegExp) =>
    fireEvent.keyDown(screen.getByRole('combobox', { name: nombre }), { key: 'Enter' });
  const escribirNueva = (texto: string) =>
    fireEvent.change(screen.getByLabelText('Nombre de la categoría nueva'), {
      target: { value: texto },
    });

  it('lista las hijas debajo de su madre, sangradas', async () => {
    await montar();
    await screen.findByText('Anime');
    const filas = screen.getAllByRole('listitem').map((li) => ({
      nombre: li.querySelector('[data-nombre]')?.textContent,
      nivel: li.getAttribute('data-nivel'),
    }));
    expect(filas).toEqual([
      { nombre: 'Llaveros', nivel: 'madre' },
      { nombre: 'Anime', nivel: 'hija' },
      { nombre: 'Figuras', nivel: 'madre' },
    ]);
  });

  it('el alta permite elegir una categoría madre y la manda en el POST', async () => {
    await montar();
    await screen.findByText('Anime');
    escribirNueva('Autos');
    abrirDesplegable('Categoría madre');
    fireEvent.click(screen.getByRole('option', { name: 'Figuras' }));
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post).toHaveBeenCalledWith('/store/categories', {
      name: 'Autos',
      parentId: 'otra',
    });
  });

  it('sin elegir madre, el alta manda parentId: null (categoría principal)', async () => {
    await montar();
    await screen.findByText('Anime');
    escribirNueva('Autos');
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post.mock.calls[0][1]).toEqual({ name: 'Autos', parentId: null });
  });

  it('el selector de madre NO ofrece una categoría que ya tiene madre', async () => {
    await montar();
    await screen.findByText('Anime');
    abrirDesplegable('Categoría madre');
    const ofrecidas = screen.getAllByRole('option').map((o) => o.textContent);
    expect(ofrecidas).toEqual(['Ninguna (categoría principal)', 'Llaveros', 'Figuras']);
  });

  it('⚠️ dos subcategorías con el mismo nombre bajo madres distintas se permiten', async () => {
    await montar();
    await screen.findByText('Anime');
    escribirNueva('anime'); // «Anime» ya existe bajo Llaveros; acá va bajo Figuras
    abrirDesplegable('Categoría madre');
    fireEvent.click(screen.getByRole('option', { name: 'Figuras' }));
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post).toHaveBeenCalledWith('/store/categories', {
      name: 'anime',
      parentId: 'otra',
    });
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('sigue rechazando dos hermanas con el mismo nombre', async () => {
    await montar();
    await screen.findByText('Anime');
    escribirNueva('ANIME');
    abrirDesplegable('Categoría madre');
    fireEvent.click(screen.getByRole('option', { name: 'Llaveros' }));
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('dos categorías principales con el mismo nombre también se rechazan', async () => {
    await montar();
    await screen.findByText('Anime');
    escribirNueva('figuras');
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('al borrar una categoría con hijas, avisa cuántas y no llama al DELETE', async () => {
    await montar(CATEGORIAS, PRODUCTOS);
    await screen.findByText('Anime');
    fireEvent.click(screen.getByRole('button', { name: 'Borrar Llaveros' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(vi.mocked(notify.error).mock.calls[0][0]).toMatch(/1 subcategoría/);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it('borrar una categoría SIN hijas cuenta solo sus productos directos y borra', async () => {
    await montar([CATEGORIAS[0]], PRODUCTOS);
    fireEvent.click(await screen.findByRole('button', { name: 'Borrar Llaveros' }));
    // 1 directo; los 2 de «Anime» no cuentan porque esa hija no está en la lista.
    expect(await screen.findByText(/1 producto quedará sin categoría/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith('/store/categories/madre'));
  });

  it('mover una hija a otra madre manda parentId (acción separada del renombrado)', async () => {
    await montar();
    await screen.findByText('Anime');
    fireEvent.click(screen.getByRole('button', { name: 'Mover Anime' }));
    abrirDesplegable('Nueva madre de Anime');
    fireEvent.click(screen.getByRole('option', { name: 'Figuras' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar mover' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(mocks.patch.mock.calls[0][0]).toBe('/store/categories/hija');
    expect(cuerpoPatch()).toEqual({ parentId: 'otra' });
    // ⚠️ Mover NO manda el nombre cacheado: si cambió en otra pestaña, lo pisaría (y el enlace).
    expect('name' in cuerpoPatch()).toBe(false);
  });

  it('mover una hija a la raíz manda parentId: null', async () => {
    await montar();
    await screen.findByText('Anime');
    fireEvent.click(screen.getByRole('button', { name: 'Mover Anime' }));
    abrirDesplegable('Nueva madre de Anime');
    fireEvent.click(screen.getByRole('option', { name: 'Ninguna (categoría principal)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar mover' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(cuerpoPatch()).toEqual({ parentId: null });
    expect('name' in cuerpoPatch()).toBe(false);
  });

  it('una madre con hijas NO se puede mover bajo otra (máximo dos niveles)', async () => {
    await montar();
    await screen.findByText('Anime');
    expect(screen.getByRole('button', { name: 'Mover Llaveros' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mover Figuras' })).toBeEnabled();
  });

  it('mover rechaza un nombre que ya existe entre las hermanas de destino', async () => {
    const cats = [
      ...CATEGORIAS,
      { id: 'h2', name: 'Anime', slug: 'anime-2', position: 3, parentId: 'otra' },
    ];
    await montar(cats);
    await screen.findAllByText('Anime');
    fireEvent.click(screen.getAllByRole('button', { name: 'Mover Anime' })[0]);
    abrirDesplegable('Nueva madre de Anime');
    fireEvent.click(screen.getByRole('option', { name: 'Figuras' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar mover' }));
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('renombrar una hija NO manda parentId', async () => {
    await montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Renombrar Anime' }));
    fireEvent.change(await screen.findByLabelText('Nuevo nombre de Anime'), {
      target: { value: 'Animé' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar nombre/i }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(cuerpoPatch()).toEqual({ name: 'Animé' });
    expect('parentId' in cuerpoPatch()).toBe(false);
  });

  it('⚠️ renombrar rechaza un nombre que ya tiene una hermana (el servidor NO lo rechaza)', async () => {
    const cats = [
      ...CATEGORIAS,
      { id: 'h2', name: 'Mundial', slug: 'mundial', position: 3, parentId: 'madre' },
    ];
    await montar(cats);
    fireEvent.click(await screen.findByRole('button', { name: 'Renombrar Mundial' }));
    fireEvent.change(await screen.findByLabelText('Nuevo nombre de Mundial'), {
      target: { value: 'anime' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar nombre/i }));
    await waitFor(() => expect(notify.error).toHaveBeenCalled());
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('renombrar a un nombre que existe bajo OTRA madre sí se permite', async () => {
    await montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Renombrar Anime' }));
    fireEvent.change(await screen.findByLabelText('Nuevo nombre de Anime'), {
      target: { value: 'Figuras' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar nombre/i }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(cuerpoPatch()).toEqual({ name: 'Figuras' });
  });
});
