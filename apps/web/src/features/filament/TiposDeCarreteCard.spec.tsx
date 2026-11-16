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
// El parámetro solo tipa las llamadas que el test inspecciona.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const apiError = vi.hoisted(() => vi.fn((_e?: unknown) => 'falló'));
const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: apiError,
  downloadFile: vi.fn(),
  getToken: () => null,
}));

vi.mock('@/components/toast', () => ({
  notify: { success: vi.fn(), error: toastError, info: vi.fn() },
  Toaster: () => null,
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
    // clearAllMocks no resetea implementaciones: se restaura para que un test no filtre su mensaje al siguiente.
    apiError.mockImplementation(() => 'falló');
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

  // El mensaje REAL del servidor (47 palabras): por esto es un cartel y no un toast. En este repo
  // ~37 palabras ya entran justas en 15 s de toast y ~50 no entran (`components/toast.tsx`).
  const RECHAZO =
    '«Carrete Bambu» lo usan 3 pesaje(s) de cierres de mes (2 como rollo en uso, 1 como rollo por acabarse). ' +
    'No se borra porque esos meses quedarían sin poder explicarse de dónde salió el peso del carrete. ' +
    'Si el nombre ya no te sirve, cámbialo desde editar.';

  async function borrarBambuRechazado() {
    mocks.del.mockRejectedValue(new Error('409'));
    apiError.mockImplementation(() => RECHAZO);
    montar();
    await screen.findByText('Carrete Bambu');
    fireEvent.click(screen.getByRole('button', { name: 'Borrar Carrete Bambu' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Borrar' }));
    return screen.findByRole('alert');
  }

  it('si el servidor rechaza el borrado, su texto queda en un cartel (role=alert) y NO en un toast', async () => {
    const cartel = await borrarBambuRechazado();

    expect(cartel.textContent).toContain(RECHAZO);
    expect(mocks.del).toHaveBeenCalledWith('/settings/carretes/t1');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('el cartel NO se va por tiempo: sigue ahí pasado un minuto', async () => {
    // Los relojes se falsean ANTES de rechazar: un temporizador nacido con el reloj real no lo movería
    // `advanceTimersByTime`, y el test pasaría aunque el cartel se cerrara solo.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
    try {
      const cartel = await borrarBambuRechazado();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(screen.getByRole('alert')).toBe(cartel);
      expect(screen.getByRole('alert').textContent).toContain(RECHAZO);
    } finally {
      vi.useRealTimers();
    }
  });

  it('se va cuando el dueño lo cierra', async () => {
    await borrarBambuRechazado();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el aviso' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // `hidden: true`: el diálogo modal esconde el resto de la página al lector de pantalla, y sin eso
  // `queryByRole` no ve el cartel aunque siga montado (verde falso medido por mutación).
  it('se va cuando el dueño abre el alta', async () => {
    await borrarBambuRechazado();
    fireEvent.click(screen.getByRole('button', { name: /Nuevo tipo de carrete/ }));
    expect(screen.queryByRole('alert', { hidden: true })).toBeNull();
  });

  it('se va cuando el dueño abre el editor', async () => {
    await borrarBambuRechazado();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Carrete Genérico' }));
    expect(screen.queryByRole('alert', { hidden: true })).toBeNull();
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
