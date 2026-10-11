import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';
import type { ExpenseRow } from '@/features/finance/api';

/**
 * EL PIE DEL KPI DE GASTOS: DE DÓNDE SALIÓ LA PLATA (2026-10-11).
 *
 * El dueño leyó «GASTOS $202.00» en el Dashboard y creyó que la caja había
 * soltado $202. Soltó $142: $50 los puso él de su bolsillo y $10 todavía no se
 * pagaron.
 *
 * ⚠️ **Es un test de CABLEADO.** `repartoDePagadores` y `textoDeReparto` ya
 * tienen sus 20 tests en shared; lo que ninguno puede ver es si el Dashboard
 * le pasa las filas que suma el KPI, si dibuja el pie, y —lo más fácil de
 * romper— si el pie **gana el renglón solo cuando tiene algo que decir**. En
 * este repo ya pasó que una mutación dejara una pantalla sin filtrar con las
 * nueve ramas de su función puras y en verde.
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

const { DashboardPage } = await import('@/pages/Dashboard');

const gasto = (id: string, amount: number, over: Partial<ExpenseRow> = {}): ExpenseRow => ({
  id,
  date: '2026-10-08T00:00:00.000Z',
  category: 'CONSUMABLE',
  counterparty: null,
  description: 'compra',
  amount,
  isInvestment: false,
  invoice: null,
  ...over,
});

const EVANAN = { id: 'cp1', name: 'Evanan', kind: 'OWNER' as const };

/**
 * Octubre de 2026 en producción: $142 los puso la caja, $50 Evanan de su
 * bolsillo y $10 son del Cyan, que entró por una factura de $25 con $15
 * abonados. Los tres suman los $202 que el dueño leyó mal… más los $15 que la
 * caja SÍ abonó de esa factura: el KPI cuenta la mercadería recibida.
 */
const OCTUBRE: ExpenseRow[] = [
  gasto('g-caja', 142),
  gasto('g-refill', 25, { counterparty: EVANAN }),
  gasto('g-pink', 25, { counterparty: EVANAN }),
  gasto('g-cyan', 25, { invoice: { id: 'f1', saldo: 10, total: 25, lineas: 1 } }),
];

function montar(gastos: ExpenseRow[]) {
  let abrir = () => {};
  const puerta = new Promise<void>((r) => {
    abrir = r;
  });

  mocks.get.mockImplementation(async (url: string) => {
    await puerta;
    if (url === '/expenses') return { data: gastos };
    if (url === '/settings') {
      return { data: { currency: 'USD', locale: 'en-US', defaultRateLabel: null } };
    }
    if (['/sales', '/orders/payments', '/loans', '/counterparties'].includes(url)) {
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
  /**
   * ⚠️ **Espera el PIE, no el rótulo "Gastos".** El rótulo se dibuja mientras
   * las consultas siguen en vuelo, así que esperarlo medía el render vacío: los
   * tests pasaban o fallaban según qué tan rápido resolviera el mock. Se espera
   * un texto que SOLO existe con los gastos ya cargados.
   */
  const cargar = async (ancla: RegExp) => {
    abrir();
    await screen.findByText(ancla);
    await act(async () => {});
  };
  return { ...vista, cargar };
}

beforeEach(() => {
  mocks.get.mockReset();
  localStorage.clear();
});

afterEach(() => localStorage.clear());

describe('Pie del KPI de Gastos', () => {
  /**
   * ⚠️ **LOS TRES NÚMEROS, Y QUE SE VEA QUE SUMAN.** $157 + $50 + $10 = $217,
   * el total del periodo. Esa propiedad es la que hace que el dueño le crea al
   * pie; sin ella, parado al lado del total, un desglose destruye la confianza
   * en los dos números.
   */
  it('dice cuánto puso la caja, cuánto el bolsillo y cuánto falta pagar', async () => {
    const vista = montar(OCTUBRE);
    await vista.cargar(/de la caja/);

    expect(
      screen.getByText('$157.00 de la caja · $50.00 lo puso Evanan · $10.00 sin pagar'),
    ).toBeTruthy();
    expect(157 + 50 + 10).toBe(217);
  });

  /**
   * ⚠️ EL CASO NORMAL ES EL SILENCIO. Con el pie en todas las tarjetas no se
   * lee en ninguna, así que cuando la caja pagó todo el renglón se queda
   * EXACTAMENTE como estaba. Este es el test que se cae si alguien deja el pie
   * ganando siempre.
   */
  it('si la caja pagó todo, el renglón queda como estaba', async () => {
    const vista = montar([gasto('g1', 142), gasto('g2', 20)]);
    // El ancla es el pie VIEJO: cuando aparece, los gastos ya están cargados y
    // la ausencia del pie nuevo significa algo.
    await vista.cargar(/filamento \+ generales/);

    expect(screen.queryByText(/de la caja/)).toBeNull();
    expect(screen.queryByText(/sin pagar/)).toBeNull();
    expect(screen.getByText('filamento + generales')).toBeTruthy();
  });

  /** Y desplaza a los pies viejos cuando sí tiene algo que decir. */
  it('gana el renglón: desplaza al pie de la inversión en equipos', async () => {
    const vista = montar([
      ...OCTUBRE,
      gasto('g-impresora', 600, { category: 'EQUIPMENT', isInvestment: true }),
    ]);
    await vista.cargar(/de la caja/);

    expect(screen.queryByText(/de inversión en equipos/)).toBeNull();
    // ⚠️ Y la impresora NO entra en el reparto: el KPI tampoco la cuenta
    // (`gastosOperativos`), así que meterla dejaría las partes sin cerrar.
    expect(
      screen.getByText('$157.00 de la caja · $50.00 lo puso Evanan · $10.00 sin pagar'),
    ).toBeTruthy();
  });

  /**
   * ⚠️ Una factura de cuatro líneas son CUATRO gastos con el mismo saldo. Fila
   * por fila, el pie diría $160 sin pagar de un total de $100.
   */
  it('una factura de varias líneas no cuenta su saldo una vez por línea', async () => {
    const f = { id: 'f9', saldo: 40, total: 100, lineas: 4 };
    const vista = montar([
      gasto('l1', 25, { invoice: f }),
      gasto('l2', 25, { invoice: f }),
      gasto('l3', 25, { invoice: f }),
      gasto('l4', 25, { invoice: f }),
    ]);
    await vista.cargar(/de la caja/);

    expect(screen.getByText('$60.00 de la caja · $40.00 sin pagar')).toBeTruthy();
  });
});
