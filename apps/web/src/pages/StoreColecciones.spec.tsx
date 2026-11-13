import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
}));

vi.mock('@/components/toast', () => ({
  notify: { error: mocks.error, success: mocks.success },
}));

const base = {
  subtitulo: null,
  verTodoTipo: 'NONE',
  verTodoValor: null,
  visible: true,
  startsAt: null,
  endsAt: null,
  exclusiones: [] as string[],
};

const COLECCIONES = [
  {
    ...base,
    id: 'c1',
    slug: 'navidad',
    nombre: 'Navidad',
    titulo: 'Colección Navidad 2026',
    esPrincipal: true,
    items: [
      { id: 'i1', categoryId: 'cat1', productId: null, position: 0 },
      { id: 'i2', categoryId: null, productId: 'p3', position: 1 },
    ],
  },
  {
    ...base,
    id: 'c2',
    slug: 'san-valentin',
    nombre: 'San Valentín',
    titulo: 'Para San Valentín',
    esPrincipal: false,
    items: [],
  },
];

const PRODUCTOS = [
  { id: 'p1', slug: 'estrella', name: 'Estrella', visible: true, categoryId: 'cat1' },
  { id: 'p2', slug: 'bola', name: 'Bola', visible: true, categoryId: 'cat1' },
  { id: 'p3', slug: 'oso', name: 'Llavero Oso', visible: true, categoryId: 'cat2' },
  { id: 'p4', slug: 'oculto', name: 'Producto oculto', visible: false, categoryId: 'cat1' },
];

/** Lo que el SERVIDOR dice que publicaría. Adrede NO es lo que el panel armaría con sus
 *  items y el catálogo (ahí entrarían Estrella, Bola y el Oso): así un panel que calcule la
 *  lista por su cuenta se delata. */
const PREVIEW_SERVIDOR = {
  vigente: true,
  productos: [
    { id: 'p1', slug: 'estrella', name: 'Estrella' },
    { id: 'p9', slug: 'solo-servidor', name: 'Solo en el servidor' },
  ],
};

function respuestaPorUrl(url: string) {
  if (url === '/store/colecciones') return { data: COLECCIONES };
  if (url === '/store/colecciones/c1/preview') return { data: PREVIEW_SERVIDOR };
  if (url === '/store/colecciones/c2/preview')
    return { data: { vigente: false, productos: [{ id: 'p3', slug: 'oso', name: 'Llavero Oso' }] } };
  if (url === '/store/status') return { data: { storageReady: true } };
  if (url === '/store/categories')
    return {
      data: [
        { id: 'cat1', name: 'Navidad', slug: 'navidad', position: 0, parentId: null },
        { id: 'cat2', name: 'Llaveros', slug: 'llaveros', position: 1, parentId: null },
      ],
    };
  if (url === '/store/products') return { data: PRODUCTOS };
  return { data: null };
}

async function montar() {
  mocks.get.mockImplementation((url: string) => Promise.resolve(respuestaPorUrl(url)));
  mocks.patch.mockResolvedValue({ data: COLECCIONES[0] });
  mocks.post.mockResolvedValue({ data: COLECCIONES });
  const { StoreColeccionesPage } = await import('@/pages/StoreColecciones');
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TooltipProvider>
          <ConfirmProvider>
            <StoreColeccionesPage />
          </ConfirmProvider>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** El `Select` de la casa es Radix: se abre con Enter y se clickea la opción (ver StoreBanners.spec). */
async function elegirEnSelect(nombre: string, textoDeLaOpcion: string) {
  const trigger = await screen.findByRole('combobox', { name: nombre });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const opciones = await screen.findAllByRole('option');
  const op = opciones.find((o) => o.textContent === textoDeLaOpcion);
  if (!op) throw new Error(`no encontré la opción ${textoDeLaOpcion} en ${nombre}`);
  fireEvent.click(op);
}

/** Abre «Editar» de la colección que está en la posición `n` de la lista. */
async function editar(n: number) {
  await screen.findByText('Colección Navidad 2026');
  fireEvent.click(screen.getAllByRole('button', { name: /^editar/i })[n]);
  await screen.findByRole('button', { name: 'Guardar' });
}

const cuerpoGuardado = () => mocks.patch.mock.calls[0][1];

describe('StoreColeccionesPage — pantalla', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
  });

  it('lista las colecciones y marca cuál es la principal', async () => {
    await montar();
    expect(await screen.findByText('Navidad')).toBeInTheDocument();
    expect(screen.getByText('San Valentín')).toBeInTheDocument();
    expect(screen.getByText('Principal')).toBeInTheDocument();
  });

  it('elegir una categoría la agrega a la colección', async () => {
    await montar();
    await editar(1); // San Valentín, vacía
    await elegirEnSelect('Agregar categoría', 'Llaveros');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(mocks.patch.mock.calls[0][0]).toBe('/store/colecciones/c2');
    expect(cuerpoGuardado().items).toEqual([{ categoryId: 'cat2', position: 0 }]);
  });

  it('el buscador agrega un producto suelto (y no ofrece los ocultos)', async () => {
    await montar();
    await editar(1);
    const buscador = screen.getByRole('textbox', { name: 'Buscar producto para agregar' });
    fireEvent.change(buscador, { target: { value: 'o' } });
    expect(screen.queryByRole('button', { name: 'Agregar Producto oculto' })).toBeNull();
    fireEvent.change(buscador, { target: { value: 'oso' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar Llavero Oso' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(cuerpoGuardado().items).toEqual([{ productId: 'p3', position: 0 }]);
  });

  it('se puede excluir un producto que entró por su categoría', async () => {
    await montar();
    await editar(0); // Navidad: trae la categoría cat1
    fireEvent.change(screen.getByRole('textbox', { name: 'Excluir un producto' }), {
      target: { value: 'bola' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Bola' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(cuerpoGuardado().exclusiones).toEqual(['p2']);
    // Los items existentes conservan su id: el servidor hace diff por id.
    expect(cuerpoGuardado().items.map((i: { id: string }) => i.id)).toEqual(['i1', 'i2']);
  });

  it('reordenar cambia el `position` que se manda', async () => {
    await montar();
    await editar(0);
    fireEvent.click(await screen.findByRole('button', { name: 'Mover Navidad una posición después' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(cuerpoGuardado().items).toEqual([
      { id: 'i2', productId: 'p3', position: 0 },
      { id: 'i1', categoryId: 'cat1', position: 1 },
    ]);
  });

  it('«hacer principal» manda el id correcto', async () => {
    await montar();
    await screen.findByText('Para San Valentín');
    // La principal ya no ofrece el botón: solo queda el de San Valentín.
    const botones = screen.getAllByRole('button', { name: /hacer principal/i });
    expect(botones).toHaveLength(1);
    fireEvent.click(botones[0]);
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post.mock.calls[0][0]).toBe('/store/colecciones/c2/principal');
  });

  it('guardar manda las fechas tal cual, en AAAA-MM-DD', async () => {
    await montar();
    await editar(0);
    fireEvent.change(screen.getByLabelText('Empieza'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('Termina'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(cuerpoGuardado().startsAt).toBe('2026-12-01');
    expect(cuerpoGuardado().endsAt).toBe('2026-12-31');
  });

  it('guardar NUNCA manda esPrincipal: se cambia solo con su endpoint', async () => {
    await montar();
    await editar(0); // Navidad ES la principal
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
    expect(cuerpoGuardado()).not.toHaveProperty('esPrincipal');
  });
});

describe('StoreColeccionesPage — vista previa', () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
  });

  it('la vista previa muestra EXACTAMENTE los productos que el servidor dice que publicaría', async () => {
    await montar();
    await screen.findByText('Colección Navidad 2026');
    fireEvent.click(screen.getAllByRole('button', { name: /^vista previa/i })[0]);
    const dialogo = await screen.findByRole('dialog');
    await within(dialogo).findByText('Solo en el servidor');
    expect(mocks.get).toHaveBeenCalledWith('/store/colecciones/c1/preview');
    // Ni uno más: la Bola y el Oso entrarían si el panel armara la lista con sus items.
    expect(within(dialogo).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Estrella',
      'Solo en el servidor',
    ]);
  });

  it('la vista previa de una colección no vigente igual se puede ver, y avisa que hoy no se publica', async () => {
    await montar();
    await screen.findByText('Para San Valentín');
    fireEvent.click(screen.getAllByRole('button', { name: /^vista previa/i })[1]);
    const dialogo = await screen.findByRole('dialog');
    expect(await within(dialogo).findByText('Llavero Oso')).toBeInTheDocument();
    expect(within(dialogo).getByText(/hoy no se publica/i)).toBeInTheDocument();
  });
});
