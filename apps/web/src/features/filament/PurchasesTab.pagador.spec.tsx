import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { FilamentPurchase } from '@calc3d/shared';
import { TooltipProvider } from '@/components/overlays';

/**
 * QUIÉN PUSO LA PLATA, EN LA PANTALLA (2026-10-11, shared 0.49.0).
 *
 * ⚠️ **Esto es un test de CABLEADO, no de función pura.** `notaDePagador` ya
 * tiene sus 10 tests en shared; lo que ninguno de ellos puede ver es si la
 * pantalla **dibuja** la línea, si la dibuja en la fila que corresponde y si le
 * pasa la compra de verdad. En este repo ya pasó que una mutación dejara una
 * pantalla sin filtrar con las nueve ramas de la función en verde: la función
 * andaba y nadie la llamaba.
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

const { PurchasesTab } = await import('@/features/filament/PurchasesTab');

const compra = (over: Partial<FilamentPurchase> & { id: string }): FilamentPurchase => ({
  date: '2026-10-10T00:00:00.000Z',
  materialId: 'm1',
  materialName: 'PLA Cyan',
  brand: 'StratoFill',
  type: 'PLA',
  color: 'Cyan',
  quantity: 1,
  amount: 25,
  costPerRoll: 25,
  costPerGram: 0.025,
  providerName: 'StratoFill',
  note: null,
  providerId: 'p1',
  counterpartyId: null,
  counterpartyName: null,
  counterpartyKind: null,
  rate: null,
  currencyCode: null,
  // `null` = no se registro si era recarga o venia con carrete.
  isRefill: null,
  invoice: null,
  ...over,
});

const factura = (
  over: Partial<NonNullable<FilamentPurchase['invoice']>> = {},
): NonNullable<FilamentPurchase['invoice']> => {
  const base = { id: 'f1', saldo: 10, total: 25, lineas: 1, ...over };
  return {
    ...base,
    // Por defecto **lo abonado salió todo de la caja**: el caso normal, y lo
    // que la app suponía de TODAS las facturas hasta shared 0.50.0.
    abonado: over.abonado ?? {
      total: Math.max(base.total - base.saldo, 0),
      bolsillo: 0,
      saldoAFavor: 0,
      prestamista: 0,
    },
    bolsillos: over.bolsillos ?? [],
  };
};

/**
 * Las cinco filas del caso real de octubre de 2026, y cada una es el hermano
 * alcanzable de las otras: con una sola, un texto clavado pasaría igual.
 */
const COMPRAS = [
  // 1. La pagó la caja y está todo pagado: NO tiene que decir nada.
  compra({ id: 'c-caja', materialName: 'PLA Negro' }),
  // 2. La puso el dueño de su bolsillo.
  compra({
    id: 'c-evanan',
    materialName: 'PLA Pure Milky Pink',
    counterpartyId: 'cp1',
    counterpartyName: 'Evanan',
  }),
  // 3. Factura de una línea, abonada a medias: $25 con $15 abonados.
  compra({ id: 'c-cyan', materialName: 'PLA Cyan', invoice: factura({ saldo: 10 }) }),
  // 4. Factura SALDADA: no puede decir que falta plata.
  compra({
    id: 'c-saldada',
    materialName: 'PLA Blanco',
    invoice: factura({ id: 'f2', saldo: 0 }),
  }),
  // 5. Factura de CUATRO líneas: el saldo es de la factura entera.
  compra({
    id: 'c-cuatro',
    materialName: 'PETG Azul',
    invoice: factura({ id: 'f3', saldo: 40, lineas: 4 }),
  }),
];

function montar(compras = COMPRAS) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/filament/purchases') return { data: compras };
    if (url === '/settings') {
      return { data: { currency: 'USD', locale: 'en-US', defaultRateLabel: null } };
    }
    return { data: null };
  });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <PurchasesTab />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/**
 * La fila de la TABLA de escritorio con ese filamento.
 *
 * ⚠️ Hay que acotar a la tabla: la pantalla dibuja además las tarjetas de
 * móvil, así que en jsdom **cada compra está dos veces en el documento** y un
 * `getByText` suelto se rompería por ambigüedad.
 */
async function fila(filamento: string) {
  const tabla = await screen.findByRole('table');
  const celda = await within(tabla).findByText(filamento);
  const tr = celda.closest('tr');
  if (!tr) throw new Error(`La celda de ${filamento} no está en una fila`);
  return within(tr);
}

/** Las tarjetas de móvil, que son el otro camino a lo mismo. */
const tarjetas = () => screen.getByRole('table').closest('div')?.parentElement;

describe('Compras de filamento: quién puso la plata', () => {
  it('la pagó la caja y está saldada: la fila no dice nada de pagadores', async () => {
    montar();
    const f = await fila('PLA Negro');

    expect(f.queryByText(/Lo puso/)).toBeNull();
    expect(f.queryByText(/faltan/)).toBeNull();
    // Y la celda del proveedor —donde iría la nota— está dibujada: sin esto,
    // los dos `queryByText` de arriba pasarían por ausencia de la fila entera.
    expect(f.getByText('StratoFill')).toBeTruthy();
  });

  it('dice quién la puso de su bolsillo, debajo del proveedor', async () => {
    montar();
    const f = await fila('PLA Pure Milky Pink');

    expect(f.getByText('Lo puso Evanan · el negocio se lo debe')).toBeTruthy();
  });

  it('una factura abonada a medias dice lo que FALTA pagar', async () => {
    montar();
    const f = await fila('PLA Cyan');

    expect(f.getByText('Faltan $10.00 de esta factura')).toBeTruthy();
  });

  it('una factura SALDADA no dice que falta plata', async () => {
    montar();
    const f = await fila('PLA Blanco');

    expect(f.queryByText(/faltan/)).toBeNull();
  });

  /**
   * ⚠️ EL PUNTO DELICADO. Los $40 son de la factura, no de este rollo: la fila
   * lo tiene que decir así, o alguien los va a usar para cuadrar la caja.
   */
  it('una factura de varias líneas dice que el saldo es de la factura entera', async () => {
    montar();
    const f = await fila('PETG Azul');

    expect(
      f.getByText('Faltan $40.00 de la factura entera (4 líneas)'),
    ).toBeTruthy();
  });

  /** El móvil no es una vista de segunda: ahí se mira la caja desde el taller. */
  it('las tarjetas de móvil dicen lo mismo', async () => {
    montar();
    await screen.findByRole('table');
    const movil = tarjetas();
    if (!movil) throw new Error('No se encontró el contenedor de las tarjetas');

    expect(within(movil).getAllByText('Lo puso Evanan · el negocio se lo debe').length).toBe(2);
    expect(
      within(movil).getAllByText('Faltan $10.00 de esta factura').length,
    ).toBe(2);
  });
});

/**
 * DE DÓNDE SALIÓ LA PLATA DE LOS ABONOS, EN LA PANTALLA (shared 0.51.0).
 *
 * El motor ya decide el texto y tiene sus propios tests; lo que se protege acá
 * es el CABLEADO. Una mutación que hacía que una pantalla dejara de filtrar no
 * tumbó ni un test de este proyecto con las nueve ramas de la función
 * probadas: borrar la línea del JSX tiene que ponerse rojo acá.
 */
describe('PurchasesTab · de dónde salió la plata de los abonos', () => {
  /**
   * ⚠️ El caso que destapó el hueco: la factura está SALDADA, así que la
   * pantalla no tenía nada que decir y se callaba — justo cuando lo que tenía
   * para contar era que esa plata no la puso el negocio.
   */
  it('una factura saldada de bolsillo dice quién la puso', async () => {
    montar([
      compra({
        id: 'c-bolsillo',
        materialName: 'PLA Violeta',
        invoice: factura({
          id: 'f7',
          saldo: 0,
          total: 25,
          abonado: { total: 25, bolsillo: 25, saldoAFavor: 0, prestamista: 0 },
          bolsillos: ['Evanan'],
        }),
      }),
    ]);
    const f = await fila('PLA Violeta');

    expect(f.getByText('$25.00 lo puso Evanan')).toBeTruthy();
  });

  it('con saldo Y bolsillo dice las dos cosas en la misma línea', async () => {
    montar([
      compra({
        id: 'c-mixta',
        materialName: 'PLA Verde',
        invoice: factura({
          id: 'f8',
          saldo: 10,
          total: 25,
          abonado: { total: 15, bolsillo: 15, saldoAFavor: 0, prestamista: 0 },
          bolsillos: ['Evanan'],
        }),
      }),
    ]);
    const f = await fila('PLA Verde');

    expect(f.getByText('Faltan $10.00 de esta factura · $15.00 lo puso Evanan')).toBeTruthy();
  });

  it('lo tomado del saldo a favor se dice como tal', async () => {
    montar([
      compra({
        id: 'c-credito',
        materialName: 'PLA Gris',
        invoice: factura({
          id: 'f10',
          saldo: 0,
          total: 25,
          abonado: { total: 25, bolsillo: 0, saldoAFavor: 25, prestamista: 0 },
        }),
      }),
    ]);
    const f = await fila('PLA Gris');

    expect(f.getByText('$25.00 con saldo a favor')).toBeTruthy();
  });

  /** Con varios orígenes la celda diría tres renglones: se dice el total. */
  it('con varios orígenes dice el total y no el detalle', async () => {
    montar([
      compra({
        id: 'c-varios',
        materialName: 'PLA Marrón',
        invoice: factura({
          id: 'f11',
          saldo: 0,
          total: 30,
          abonado: { total: 30, bolsillo: 18, saldoAFavor: 12, prestamista: 0 },
          bolsillos: ['Evanan'],
        }),
      }),
    ]);
    const f = await fila('PLA Marrón');

    expect(f.getByText('$30.00 no salió de la caja')).toBeTruthy();
    expect(f.queryByText(/con saldo a favor/)).toBeNull();
  });

  /**
   * ⚠️ El prestamista no genera la deuda que sí genera un bolsillo: esa deuda
   * ya vive en el saldo del préstamo.
   */
  it('un gasto directo del prestamista no promete una devolución', async () => {
    montar([
      compra({
        id: 'c-prestamista',
        materialName: 'PLA Dorado',
        counterpartyId: 'cp9',
        counterpartyName: 'Prestamista',
        counterpartyKind: 'EXTERNAL_LENDER',
      }),
    ]);
    const f = await fila('PLA Dorado');

    expect(f.getByText('Lo puso el prestamista')).toBeTruthy();
    expect(f.queryByText(/se lo debe/)).toBeNull();
  });

  /** El silencio sigue siendo el caso normal: lo de la caja no dice nada. */
  it('una factura saldada por la caja sigue sin decir nada', async () => {
    montar([
      compra({ id: 'c-nada', materialName: 'PLA Beige', invoice: factura({ id: 'f12', saldo: 0 }) }),
    ]);
    const f = await fila('PLA Beige');

    expect(f.queryByText(/lo puso|saldo a favor|no salió de la caja|faltan/i)).toBeNull();
  });
});
