import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('si el servidor rechaza por historial, el aviso muestra SU mensaje (con la salida)', async () => {
    const rechazo = 'No se puede borrar «Argollas»: tiene 1 compra. Un insumo no se descontinúa. Si es un duplicado de otro, ábrelo con «Unir con otro insumo».';
    mocks.del.mockRejectedValue(new Error(rechazo));
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Argollas' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.error.mock.calls[0][1]).toBe(rechazo);
    expect(mocks.del).toHaveBeenCalledWith('/components/i1');
  });
});
