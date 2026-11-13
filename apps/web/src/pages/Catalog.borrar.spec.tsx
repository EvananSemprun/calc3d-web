import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

/**
 * Tabla de Insumos (13/11): los botones de cada fila llevan nombre accesible que dice
 * QUÉ hacen y SOBRE QUÉ (no «botón»: en una tabla con tres filas, tres «Editar» iguales no
 * dicen cuál es cuál), y borrar con historial muestra el rechazo del servidor, que trae la salida.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn(), error: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: mocks.del },
  apiErrorMessage: (e: unknown) => (e as Error).message,
  downloadFile: vi.fn(),
  getToken: () => null,
}));
vi.mock('@/components/toast', () => ({
  notify: { success: vi.fn(), error: mocks.error, info: vi.fn() },
  Toaster: () => null,
}));

const { CatalogPage } = await import('@/pages/Catalog');

const INSUMOS = [
  { id: 'i1', name: 'Argollas', packagePrice: 7.27, unitsPerPackage: 25, scope: 'PER_PIECE' },
  { id: 'i2', name: 'Cadenas', packagePrice: 4, unitsPerPackage: 10, scope: 'PER_PIECE' },
];

function montar() {
  mocks.get.mockImplementation(async (url: string) => ({ data: url === '/components' ? INSUMOS : [] }));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/catalogs/components']}>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <ConfirmProvider>
            <Routes>
              <Route path="/catalogs/:resource" element={<CatalogPage />} />
            </Routes>
          </ConfirmProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.del.mockReset();
  mocks.error.mockReset();
});

describe('Insumos — botones de cada fila', () => {
  it('editar, unir y eliminar nombran la acción Y el insumo, fila por fila', async () => {
    montar();

    for (const nombre of ['Argollas', 'Cadenas']) {
      expect(await screen.findByRole('button', { name: `Editar ${nombre}` })).toBeTruthy();
      expect(screen.getByRole('button', { name: `Unir ${nombre} con otro insumo` })).toBeTruthy();
      expect(screen.getByRole('button', { name: `Eliminar ${nombre}` })).toBeTruthy();
    }
  });

  it('ningún botón de la tabla queda sin nombre', async () => {
    montar();
    await screen.findByRole('button', { name: 'Editar Argollas' });

    const filas = screen.getAllByRole('row').slice(1);
    const sinNombre = filas.flatMap((f) =>
      Array.from(f.querySelectorAll('button')).filter((b) => !(b.getAttribute('aria-label') || b.textContent?.trim())),
    );
    expect(sinNombre).toHaveLength(0);
  });
});

describe('Insumos — eliminar', () => {
  it('la confirmación nombra el insumo', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Argollas' }));

    expect(await screen.findByText('¿Eliminar «Argollas»?')).toBeTruthy();
  });

  const RECHAZO =
    'No se puede borrar «Argollas»: tiene 1 compra. Un insumo no se descontinúa. Si es un duplicado de otro, ábrelo con «Unir con otro insumo».';

  async function borrarArgollasRechazado() {
    mocks.del.mockRejectedValue(new Error(RECHAZO));
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Argollas' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    return screen.findByRole('alert');
  }

  it('si el servidor rechaza por historial, un CARTEL (role=alert) muestra SU mensaje con la salida, y no un toast', async () => {
    const aviso = await borrarArgollasRechazado();

    expect(aviso.textContent).toContain(RECHAZO);
    expect(aviso.className).toContain('destructive');
    expect(mocks.del).toHaveBeenCalledWith('/components/i1');
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it('el cartel NO se va por tiempo: sigue ahí pasado un minuto', async () => {
    // Los relojes se falsean ANTES de rechazar: un temporizador nacido con el reloj real no
    // lo movería `advanceTimersByTime`, y el test pasaría aunque el cartel se cerrara solo.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    try {
      const aviso = await borrarArgollasRechazado();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(screen.getByRole('alert')).toBe(aviso);
      expect(screen.getByRole('alert').textContent).toContain(RECHAZO);
    } finally {
      vi.useRealTimers();
    }
  });

  it('se va cuando el dueño lo cierra', async () => {
    await borrarArgollasRechazado();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el aviso' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('se va cuando el dueño hace otra cosa (abrir el editor de otro insumo)', async () => {
    await borrarArgollasRechazado();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Cadenas' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
