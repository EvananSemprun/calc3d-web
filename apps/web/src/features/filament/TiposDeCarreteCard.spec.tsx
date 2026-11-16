import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

/**
 * Configuración → Filamento → Tipos de carrete. Se mockea `@/lib/api` y nada más.
 * El aviso es lo medido en el cierre de mes: cambiar el peso de un tipo NO mueve
 * un mes ya cerrado. No promete nada sobre el mes abierto (todavía no existe).
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));
const apiError = vi.hoisted(() => vi.fn(() => 'falló'));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: apiError,
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { TiposDeCarreteCard } = await import('@/features/filament/TiposDeCarreteCard');

const TIPOS = [
  { id: 't1', nombre: 'Carrete Bambu', gramos: 250 },
  { id: 't2', nombre: 'Carrete Genérico', gramos: 180 },
];

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TooltipProvider>
          <ConfirmProvider>
            <TiposDeCarreteCard />
          </ConfirmProvider>
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('TiposDeCarreteCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ data: TIPOS });
    mocks.post.mockResolvedValue({ data: { id: 't3', nombre: 'Nuevo', gramos: 200 } });
  });

  it('lista los tipos con su peso y deja agregar uno', async () => {
    montar();

    expect(await screen.findByText('Carrete Bambu')).toBeTruthy();
    expect(screen.getByText('250 g')).toBeTruthy();
    expect(screen.getByText('Carrete Genérico')).toBeTruthy();
    expect(screen.getByText('180 g')).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledWith('/settings/carretes');

    fireEvent.click(screen.getByRole('button', { name: /Nuevo tipo de carrete/ }));
    fireEvent.change(await screen.findByPlaceholderText('Ej. Carrete Bambu'), {
      target: { value: '  Carrete Prusa ' },
    });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith('/settings/carretes', { nombre: 'Carrete Prusa', gramos: 200 }),
    );
  });

  it('avisa que cambiar un peso no toca los meses ya cerrados', async () => {
    montar();
    await screen.findByText('Carrete Bambu');

    const aviso = screen.getByText(/no toca los meses ya cerrados/);
    // Tripwire de UNA redacción, no una guarda: caza que alguien meta literalmente «mes abierto» o
    // «mes en curso». NO garantiza que el aviso no prometa algo sobre el mes abierto con otras palabras.
    expect(aviso.textContent).not.toMatch(/mes (abierto|en curso)/i);
  });

  it('si el servidor rechaza el borrado, su texto queda en pantalla en un cartel que no se va solo', async () => {
    const RECHAZO =
      '«Carrete Bambu» lo usan 3 pesajes de cierres de mes. No se borra porque esos meses quedarían sin poder explicarse. Cámbialo desde editar.';
    mocks.del.mockRejectedValue(new Error('409'));
    apiError.mockReturnValue(RECHAZO);
    montar();
    await screen.findByText('Carrete Bambu');

    fireEvent.click(screen.getByRole('button', { name: 'Borrar Carrete Bambu' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Borrar' }));

    const cartel = await screen.findByRole('alert');
    expect(cartel.textContent).toContain(RECHAZO);
    expect(mocks.del).toHaveBeenCalledWith('/settings/carretes/t1');

    // No se va solo: sigue ahí pasado el tiempo de un toast (4 s) y se cierra a mano.
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el aviso' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('editar un tipo manda PATCH con su id', async () => {
    mocks.patch.mockResolvedValue({ data: {} });
    montar();
    await screen.findByText('Carrete Bambu');

    fireEvent.click(screen.getByRole('button', { name: 'Editar Carrete Bambu' }));
    fireEvent.change(await screen.findByRole('spinbutton'), { target: { value: '260' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(mocks.patch).toHaveBeenCalledWith('/settings/carretes/t1', { nombre: 'Carrete Bambu', gramos: 260 }),
    );
  });
});
