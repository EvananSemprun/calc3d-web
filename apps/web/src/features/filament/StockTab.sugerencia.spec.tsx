import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StockCountRow } from '@calc3d/shared';
import { TooltipProvider } from '@/components/overlays';

/**
 * LA RECEPCIÓN SUGIERE EL CONTEO (Fase 6, 2026-10-10).
 *
 * ⚠️ **Lo que se prueba acá es que SUGIERE y NO ESCRIBE.** `received` viene del
 * servidor y `rollosRecibidosPorFicha` ya está probada en shared; lo que
 * ninguna de las dos puede ver es si la pantalla deja la casilla rellenada —que
 * es exactamente lo que el dueño descartó: con el conteo precargado se termina
 * **confirmando un número en vez de mirando el estante**—, ni si una ficha sin
 * recepciones termina ofreciendo un 0.
 *
 * Se mockea `@/lib/api` y nada más.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { StockTab } = await import('@/features/filament/StockTab');

const fila = (over: Partial<StockCountRow> & { materialId: string; name: string }): StockCountRow => ({
  type: 'PLA',
  brand: 'Creality',
  color: 'Amarillo',
  status: 'ACTIVE',
  sealed: 0,
  inUse: 0,
  running: 0,
  total: 0,
  needsBrandCheck: false,
  counted: false,
  canDelete: false,
  exhausted: false,
  previous: null,
  lastRollPrice: 20,
  received: null,
  ...over,
});

/**
 * Dos fichas: una que RECIBIÓ 2 rollos este mes y otra que no recibió nada.
 * La segunda es el hermano alcanzable de cada afirmación sobre la primera.
 */
const FILAS = [
  fila({ materialId: 'm1', name: 'PLA Amarillo', color: 'Amarillo', received: 2 }),
  fila({ materialId: 'm2', name: 'PLA Blanco', color: 'Blanco', brand: 'Bambu', received: null }),
];

function montar(filas = FILAS, cerrado = false) {
  let abrir = () => {};
  const puerta = new Promise<void>((r) => {
    abrir = r;
  });
  mocks.get.mockImplementation(async (url: string) => {
    await puerta;
    if (url === '/filament/stock') return { data: filas };
    if (url === '/filament/stock/status') {
      return {
        data: {
          month: '2026-10',
          closed: cerrado,
          closedAt: cerrado ? '2026-10-31T12:00:00.000Z' : null,
          reopenedAt: null,
          canClose: true,
          closableFrom: '2026-10-31',
        },
      };
    }
    if (url === '/filament/summary') {
      return {
        data: {
          month: '2026-10',
          totalRolls: 0,
          running: 0,
          consumption: null,
          purchased: 2,
          restock: [],
          pendingBrandCheck: 0,
          countedColors: 0,
          totalColors: 2,
          averagePurchased: 1,
          complete: false,
        },
      };
    }
    return { data: null };
  });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const vista = render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <StockTab />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  const cargar = async () => {
    abrir();
    await screen.findByLabelText('PLA Amarillo Creality');
    await act(async () => {});
  };
  return { ...vista, cargar };
}

/** La tarjeta de una ficha, por su `aria-label`. */
const tarjeta = (ficha: string) => screen.getByLabelText(ficha);

beforeEach(() => {
  mocks.get.mockReset();
  localStorage.clear();
});

describe('El conteo ofrece lo que entró en el mes', () => {
  it('dice cuántos rollos entraron y DE DÓNDE sale el número', async () => {
    const { cargar } = montar();
    await cargar();

    const m1 = tarjeta('PLA Amarillo Creality');
    expect(within(m1).getByText(/Entraron 2 rollos/)).toBeInTheDocument();
    // "De dónde sale": las compras recibidas de ESE mes, no un cierre anterior.
    expect(within(m1).getByText(/compras recibidas en octubre/)).toBeInTheDocument();
  });

  it('⚠️ SUGIERE, NO ESCRIBE: la casilla sigue vacía', async () => {
    const { cargar } = montar();
    await cargar();

    const m1 = tarjeta('PLA Amarillo Creality');
    // Precargada, una ficha que nadie miró se cerraría con el número de la app
    // como si se hubiera contado. El conteo tiene que arrancar en cero.
    // `null` = el campo está LITERALMENTE en blanco (`NumberInput` arranca
    // vacío en 0 y muestra "0" de placeholder): nadie escribió nada.
    expect(within(m1).getByLabelText('Sin abrir · PLA Amarillo Creality')).toHaveValue(null);
  });

  it('al tocar la sugerencia, el número pasa a la casilla "Sin abrir"', async () => {
    const { cargar } = montar();
    await cargar();

    const m1 = tarjeta('PLA Amarillo Creality');
    fireEvent.click(within(m1).getByRole('button', { name: /Usar 2 sin abrir/ }));

    expect(within(m1).getByLabelText('Sin abrir · PLA Amarillo Creality')).toHaveValue(2);
  });

  it('una ficha SIN recepciones no ofrece nada — y no ofrece 0', async () => {
    const { cargar } = montar();
    await cargar();

    const m2 = tarjeta('PLA Blanco Bambu');
    expect(within(m2).queryByText(/Entraron/)).not.toBeInTheDocument();
    expect(within(m2).queryByText(/Entraron 0/)).not.toBeInTheDocument();
    // ⚠️ El nombre va con el número: los − / + de la casilla se llaman
    // "Restar uno · Sin abrir · …" y un `/sin abrir/i` los contaría también.
    expect(within(m2).queryByRole('button', { name: /Usar \d+ sin abrir/ })).not.toBeInTheDocument();
  });

  it('con el mes CERRADO el dato se ve, pero ya no se puede usar', async () => {
    const { cargar } = montar(FILAS, true);
    await cargar();

    const m1 = tarjeta('PLA Amarillo Creality');
    // El número sigue siendo información útil de ese mes; lo que no tiene
    // sentido es ofrecer escribirlo en un conteo que ya está cerrado.
    expect(within(m1).getByText(/Entraron 2 rollos/)).toBeInTheDocument();
    expect(within(m1).queryByRole('button', { name: /Usar 2 sin abrir/ })).not.toBeInTheDocument();
  });
});
