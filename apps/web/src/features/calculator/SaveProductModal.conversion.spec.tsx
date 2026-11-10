import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
// ⚠️ Import ESTÁTICO, y no un `await import()` dentro del helper. Estaba adentro de
// `montar()`, así que **el primer test del archivo pagaba la transformación de
// `SaveProductModal` y todo su árbol de dependencias**. Con la máquina cargada eso cruzaba
// los 20 s de `testTimeout` y el test fallaba **por tiempo, no por su aserción**:
// intermitente, verde al correrlo solo, y bloqueando el gancho de pre-push.
// Moverlo a un `beforeAll` no sirve: ahí choca con el tope de 10 s del hook. Estático, el
// costo se paga al cargar el archivo, que no tiene tope.
// Es seguro porque **vitest eleva los `vi.mock` por encima de los imports**: los mocks de
// abajo ya están puestos cuando este módulo se carga.
import { SaveProductModal } from './SaveProductModal';

/**
 * GUARDAR UNA PIEZA COSTEADA LA PUBLICA AL PRECIO CORRECTO (2026-11-08).
 *
 * La calculadora trabaja en USDT (el dólar real) y el campo de la tienda se lee como
 * dólar BCV, que vale menos. Hasta hoy el modal copiaba el número tal cual y publicaba un
 * 12 % más barato de lo costeado, **sin un solo aviso**.
 *
 * ⚠️ La conversión vive en `shared` (`precioParaPublicar`) y ya tiene sus tests. Lo que
 * se fija ACÁ es que la PANTALLA la use: volver a `useState(suggested)` deja los 979
 * tests de función pura en verde y el modal publicando barato otra vez.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post },
  apiErrorMessage: () => 'falló',
}));

const navegar = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof import('react-router-dom')>('react-router-dom')),
  useNavigate: () => navegar,
}));

/** La calculadora entrega un precio final de 1,50 USDT. */
vi.mock('@/features/calculator/CalculatorProvider', () => ({
  useCalculator: () => ({
    quoteName: 'Identificadores',
    input: { wholesale: { tiers: [] } },
    result: { price: { final: 1.5 } },
  }),
}));

/** Las tasas del 2026-11-08: el dólar BCV vale menos que el USDT. */
const TASAS = [
  { label: 'BCV Dólar', currencyCode: 'VES', rate: 900 },
  { label: 'Binance / USDT', currencyCode: 'VES', rate: 1026 },
];

/** Configuración del dueño: redondeo hacia arriba a 0,50. */
const SETTINGS = {
  currency: 'USD',
  locale: 'en-US',
  defaultRateLabel: 'BCV Dólar',
  protectionRateLabel: 'Binance / USDT',
  roundingMode: 'UP',
  roundingIncrement: 0.5,
};

async function montar(rates: unknown[] = TASAS, settings: Record<string, unknown> = SETTINGS) {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/exchange-rates') return Promise.resolve({ data: { rates } });
    if (url === '/settings') return Promise.resolve({ data: settings });
    return Promise.resolve({ data: null });
  });
  mocks.post.mockResolvedValue({ data: { id: 'sp1' } });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <SaveProductModal onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return await screen.findByRole('spinbutton');
}

describe('el modal de guardar convierte el precio a dólares BCV', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
  });

  it('propone el precio de VITRINA, no el costeado', async () => {
    const campo = await montar();
    // 1.50 USDT → 1.71 BCV → redondeado hacia arriba a 0,50 → 2.00
    await waitFor(() => expect((campo as HTMLInputElement).value).toBe('2'));
  });

  it('muestra las dos cifras: lo que costeaste y lo que se publica', async () => {
    await montar();
    await screen.findByText('Costeaste');
    expect(screen.getByText('Se publica')).toBeTruthy();
    expect(screen.getByText('Entra')).toBeTruthy();
  });

  it('guarda el precio BCV, que es el que la tienda cobra', async () => {
    const campo = await montar();
    await waitFor(() => expect((campo as HTMLInputElement).value).toBe('2'));
    fireEvent.click(screen.getByRole('button', { name: /guardar producto/i }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    const cuerpo = mocks.post.mock.calls[0][1] as { priceUsd: number };
    expect(cuerpo.priceUsd).toBe(2);
    expect(cuerpo.priceUsd).not.toBe(1.5);
  });

  it('el precio es editable y lo escrito a mano NO se pisa', async () => {
    const campo = await montar();
    await waitFor(() => expect((campo as HTMLInputElement).value).toBe('2'));
    fireEvent.change(campo, { target: { value: '3.5' } });
    await waitFor(() => expect((campo as HTMLInputElement).value).toBe('3.5'));
  });

  it('sin las tasas NO convierte en silencio: lo dice', async () => {
    const campo = await montar([]);
    await waitFor(() => expect((campo as HTMLInputElement).value).toBe('1.5'));
    expect(screen.getByText(/sin convertir/i)).toBeTruthy();
    expect(screen.queryByText('Costeaste')).toBeNull();
  });
});
