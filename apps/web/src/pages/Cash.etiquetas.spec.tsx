import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * LAS DOS LÍNEAS NUEVAS DE CAJA DICEN QUÉ SON (fase B, tarea 4).
 *
 * ⚠️ Hasta este archivo el panel **no tenía ni una aserción** sobre los textos
 * de «De dónde sale el saldo»: la única guarda era que `Record<CashCategory,
 * string>` no compila sin la etiqueta. O sea que compilaba igual con un texto
 * equivocado, y los dos que había lo estaban:
 *
 * - **«Insumos comprados»** sugería *todos* los insumos, y la fila cuenta solo
 *   los que entraron **por factura**: un insumo cargado como gasto directo cae
 *   en «Gastos generales» (el motor clasifica los gastos por
 *   `isFilament`/`isInvestment` y nada más). La asimetría con el filamento es
 *   deuda conocida de la fase (c), no diseño — se arregló el NOMBRE, no la
 *   clasificación, porque reclasificar movería plata entre dos filas.
 * - **«(pagado y sin recibir)»** describía UNA de las tres puertas. También
 *   entran la factura recibida entera y **pagada de más** y la recibida a un
 *   precio real **menor** al pedido: en los dos casos `valorRecibido < pagado`
 *   sin que falte mercadería.
 *
 * ⚠️ Lo que se mide es el TEXTO renderizado, no el objeto de etiquetas: con un
 * `expect` sobre la constante, el día que el JSX deje de usarla el test sigue
 * verde. Por eso monta la pantalla.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { CashPage } = await import('@/pages/Cash');
const { ConfirmProvider } = await import('@/components/overlays');

/**
 * El saldo del negocio como lo devuelve la API, con las DOS líneas nuevas
 * distintas de cero: la pantalla **filtra las categorías en 0**, así que con
 * ceros no se dibujaría ninguna fila y el test no mediría nada.
 */
const resumen = () => ({
  counterparty: { id: 'cp1', name: 'Propietario', kind: 'OWNER' },
  accounts: [],
  applicationOrder: 'OLDEST_FIRST',
  balance: {
    collected: 200,
    expenses: 0,
    filament: 0,
    equipment: 0,
    consumables: 21.54,
    supplierAdvances: 140,
    contributionsRefundable: 0,
    contributionsCapital: 0,
    debtRepayments: 0,
    ownerDraws: 0,
    loanPayments: 0,
    balance: 38.46,
  },
  financing: { rows: [], owedToOwner: 0, owedToLender: 0, totalOwed: 0, overWithdrawn: 0 },
  obligations: [],
  movements: [],
  reconciliations: [],
});

function montar() {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/cash') return Promise.resolve({ data: resumen() });
    if (url === '/settings') return Promise.resolve({ data: { currency: 'USD', locale: 'en-US' } });
    if (url === '/counterparties') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: null });
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ConfirmProvider>
          <CashPage />
        </ConfirmProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('Caja: las etiquetas de las dos líneas nuevas del saldo', () => {
  beforeEach(() => mocks.get.mockReset());

  it('los insumos dicen «por factura»: la fila no cuenta un gasto directo', async () => {
    montar();

    expect(await screen.findByText('Insumos comprados por factura')).toBeTruthy();
    // El texto genérico afirmaría todos los insumos, y es el que había.
    expect(screen.queryByText('Insumos comprados')).toBeNull();
  });

  it('los anticipos dicen «pagado por encima de lo recibido», no «sin recibir»', async () => {
    montar();

    expect(
      await screen.findByText('Anticipos a proveedores (pagado por encima de lo recibido)'),
    ).toBeTruthy();
    expect(screen.queryByText(/sin recibir/)).toBeNull();
  });

  /**
   * El hermano alcanzable de los dos de arriba: sin él, una pantalla que no
   * dibujara ninguna línea pasaría los dos `queryByText(...)` igual.
   */
  it('las dos filas se dibujan con su monto, con el signo de la categoría', async () => {
    montar();

    // `CASH_SIGN` las pone en −1: son plata que salió.
    expect(await screen.findByText('-$21.54')).toBeTruthy();
    expect(await screen.findByText('-$140.00')).toBeTruthy();
  });
});
