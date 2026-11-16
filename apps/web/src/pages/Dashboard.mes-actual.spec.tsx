import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';

/**
 * «INGRESOS POR MES»: EL MES EN CURSO SE RESALTA (2026-11-16, pedido del dueño).
 *
 * La tarjeta se puede ordenar por monto, así que el mes en curso cae en
 * cualquier posición de la tabla: sin marca hay que buscarlo leyendo los doce.
 *
 * ⚠️ **Es un test de CABLEADO, y la regla que cuida es la del AÑO.** Resaltar
 * «Noviembre» es fácil; lo fácil de romper es resaltarlo **también cuando el
 * dueño está mirando 2025**, donde no existe un «este mes» — ahí la marca
 * afirmaría que estás parado en un mes que ya pasó.
 *
 * ⚠️ **El glow de la BARRA no se mide acá**: Recharts no dibuja dentro de un
 * `ResponsiveContainer` de tamaño 0, que es lo que da jsdom. La barra y la
 * fila usan **la misma** función `esMesActual`, así que romperla pone en rojo
 * estos tests; lo que queda sin red es solo el `filter` del `<Cell>`, que se
 * verificó en el navegador.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { DashboardPage } = await import('@/pages/Dashboard');

/** Dos ventas de mostrador: uña en octubre y otra en el mes en curso. */
const VENTAS = [
  { id: 'v1', date: '2026-10-05T00:00:00.000Z', amount: 50, kind: 'COUNTER', note: null, clientId: null },
  { id: 'v2', date: '2026-11-05T00:00:00.000Z', amount: 100, kind: 'COUNTER', note: null, clientId: null },
];

function montar() {
  let abrir = () => {};
  const puerta = new Promise<void>((r) => {
    abrir = r;
  });

  mocks.get.mockImplementation(async (url: string) => {
    await puerta;
    if (url === '/sales') return { data: VENTAS };
    if (url === '/settings') {
      return { data: { currency: 'USD', locale: 'en-US', defaultRateLabel: null } };
    }
    if (['/expenses', '/orders/payments', '/loans', '/counterparties'].includes(url)) {
      return { data: [] };
    }
    if (url === '/store/products' || url === '/campaigns' || url === '/purchase-invoices') {
      return { data: [] };
    }
    return { data: null };
  });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const vista = render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <DashboardPage />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  // Se espera un monto de la tabla, que solo existe con las ventas ya cargadas:
  // el título se dibuja con las consultas todavía en vuelo.
  const cargar = async () => {
    abrir();
    await screen.findByText('$100.00');
    await act(async () => {});
  };
  return { ...vista, cargar };
}

beforeEach(() => {
  mocks.get.mockReset();
  localStorage.clear();
  // 16 de noviembre de 2026, en hora LOCAL: es la clase de fecha correcta para
  // «qué mes es hoy». Sin fijarlo, el test diría cosas distintas cada mes.
  vi.setSystemTime(new Date(2026, 10, 16, 10, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('Ingresos por mes — el mes en curso', () => {
  it('marca el mes en curso en la tabla', async () => {
    const vista = montar();
    await vista.cargar();

    const marca = screen.getByText('(este mes)');
    expect(marca).toBeTruthy();
    // Y está en la fila de noviembre, no en cualquiera.
    expect(marca.closest('tr')?.textContent).toContain('Noviembre');
  });

  it('solo marca UNO: los otros once meses quedan sin marca', async () => {
    const vista = montar();
    await vista.cargar();

    expect(screen.getAllByText('(este mes)')).toHaveLength(1);
  });

  /**
   * ⚠️ EL TEST QUE IMPORTA. Con 2025 elegido no hay «este mes» que marcar:
   * noviembre de 2025 ya pasó entero. El año se recuerda en localStorage
   * (`dashboard:anio`), así que se siembra como lo haría el dueño que dejó la
   * tarjeta en otro año la última vez.
   */
  it('con OTRO año elegido no marca ningún mes', async () => {
    localStorage.setItem('dashboard:anio', JSON.stringify(2025));
    const vista = montar();
    await vista.cargar();

    expect(screen.queryByText('(este mes)')).toBeNull();
  });

  /**
   * El «(no llegó)» de los meses futuros ya existía y se apoya en el mismo par
   * año/mes: si alguien toca uno, este test dice cuál de los dos se rompió.
   */
  it('diciembre sigue diciendo «(no llegó)» y no se confunde con el mes en curso', async () => {
    const vista = montar();
    await vista.cargar();

    const diciembre = screen.getByText('Diciembre').closest('tr');
    expect(diciembre?.textContent).toContain('(no llegó)');
    expect(diciembre?.textContent).not.toContain('(este mes)');
  });
});
