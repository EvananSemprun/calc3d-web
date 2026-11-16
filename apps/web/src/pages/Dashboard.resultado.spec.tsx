import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResultadoDeOperacion } from '@calc3d/shared';
import { TooltipProvider } from '@/components/overlays';
import type { ExpenseRow, SaleRow } from '@/features/finance/api';

/**
 * EL DASHBOARD DEJA DE CALCULAR EL RESULTADO (fase «filamento como inventario»).
 *
 * Antes restaba `ingresos − gastos` con las filas crudas: el filamento el día
 * que se compra, mientras el servidor ya lo restaba cuando se consume. Dos
 * ganancias distintas en la misma app.
 *
 * ⚠️ **Es un test de CABLEADO.** La cuenta tiene sus tests en la API; lo que
 * ninguno ve es si la pantalla dibuja lo que manda el servidor o su propia
 * cuenta. Por eso los números del servidor son DISTINTOS a propósito de los que
 * saldrían de las filas: si la pantalla calculara, daría el otro.
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

const venta: SaleRow = { id: 'v1', date: '2026-10-08T00:00:00.000Z', amount: 500, kind: 'COUNTER' };

const gasto = (id: string, amount: number): ExpenseRow => ({
  id,
  date: '2026-10-08T00:00:00.000Z',
  category: 'CONSUMABLE',
  counterparty: null,
  description: 'compra',
  amount,
  isInvestment: false,
  invoice: null,
});

/** Con estas filas, la cuenta VIEJA da 500 − 200 = $300.00. */
const FILAS_DE_GASTO = [gasto('g1', 200)];

const RESULTADO_BASE: ResultadoDeOperacion = {
  ingresos: 500,
  gastosOperativos: 179,
  utilidad: 321, // ≠ 300: lo que da la cuenta vieja con las filas de arriba
  filamentoEnEstante: 21,
  mesesCompletos: ['2026-09', '2026-10'],
  tramosSueltos: false,
  mesesSinContar: [],
  mesesConConsumoNegativo: [],
  ajustePorMedicion: 0,
};

function montar(resultado: ResultadoDeOperacion | null) {
  let abrir = () => {};
  const puerta = new Promise<void>((r) => {
    abrir = r;
  });

  mocks.get.mockImplementation(async (url: string) => {
    await puerta;
    if (url === '/expenses/resultado') return { data: resultado };
    if (url === '/expenses') return { data: FILAS_DE_GASTO };
    if (url === '/sales') return { data: [venta] };
    if (url === '/settings') return { data: { currency: 'USD', locale: 'en-US', defaultRateLabel: null } };
    if (['/orders/payments', '/loans', '/counterparties'].includes(url)) return { data: [] };
    if (url === '/store/products' || url === '/campaigns' || url === '/purchase-invoices') return { data: [] };
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
  /** Espera un texto que SOLO existe con los datos ya cargados (el rótulo se dibuja antes). */
  const cargar = async (ancla: RegExp | string) => {
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

describe('«Resultado de la operación» del Dashboard', () => {
  it('muestra lo que manda el servidor, no una cuenta propia', async () => {
    const vista = montar(RESULTADO_BASE);
    await vista.cargar('$321.00');

    expect(screen.getByText('$321.00')).toBeTruthy();
    // La cuenta vieja (ingresos − gastos de las filas) daría esto: no tiene que aparecer.
    expect(screen.queryByText('$300.00')).toBeNull();
  });

  it('sin tramos sueltos ni alarmas no dice nada de más', async () => {
    const vista = montar(RESULTADO_BASE);
    await vista.cargar('$321.00');

    expect(screen.queryByText(/no entra en este número/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/recién se pesó/)).toBeNull();
  });

  it('con tramos sueltos aparece la línea que explica QUÉ no se contó', async () => {
    const vista = montar({
      ...RESULTADO_BASE,
      tramosSueltos: true,
      mesesCompletos: [],
      mesesSinContar: ['2026-10'],
    });
    await vista.cargar(/no entra en este número/);

    const nota = screen.getByText(/no entra en este número/);
    // Nombra el tramo y dice que ese filamento queda afuera: no un «hay tramos sueltos» genérico.
    expect(nota.textContent).toContain('octubre de 2026');
    expect(nota.textContent).toContain('no se resta');
  });

  it('cuando una parte sí se contó, dice cuál', async () => {
    const vista = montar({
      ...RESULTADO_BASE,
      tramosSueltos: true,
      mesesCompletos: ['2026-09'],
      mesesSinContar: ['2026-10'],
    });
    await vista.cargar(/no entra en este número/);

    const nota = screen.getByText(/no entra en este número/);
    expect(nota.textContent).toContain('Se restó el consumo de filamento de septiembre de 2026');
    expect(nota.textContent).toContain('El filamento de octubre de 2026 no entra');
  });

  it('un conteo con consumo negativo se dice en alerta: fabrica ganancia', async () => {
    const vista = montar({
      ...RESULTADO_BASE,
      mesesConConsumoNegativo: [{ mes: '2026-10', consumo: -350 }],
    });
    await vista.cargar(/consumo negativo/);

    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('octubre de 2026');
    expect(alerta.textContent).toContain('-$350.00');
    expect(alerta.textContent).toContain('inflado');
  });

  it('el ajuste por medición se dice SOLO cuando no es 0', async () => {
    const con = montar({ ...RESULTADO_BASE, ajustePorMedicion: 5 });
    await con.cargar(/recién se pesó/);
    expect(screen.getByText(/\$5\.00 es un rollo que recién se pesó, no plata nueva/)).toBeTruthy();
    con.unmount();

    mocks.get.mockReset();
    const sin = montar(RESULTADO_BASE);
    await sin.cargar('$321.00');
    expect(screen.queryByText(/recién se pesó/)).toBeNull();
  });
});
