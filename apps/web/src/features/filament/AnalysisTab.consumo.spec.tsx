import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FilaDeConsumoPorMes, FilamentPurchase, ResultadoDeOperacion } from '@calc3d/shared';
import { TooltipProvider } from '@/components/overlays';

/**
 * LA TABLA MES A MES DE FILAMENTO → ANÁLISIS (fase «filamento como inventario»).
 *
 * ⚠️ **Es un test de CABLEADO.** La cuenta (consumo, ajuste, estante) la hace el
 * servidor y tiene sus tests allá; lo que ninguno ve es si la pantalla dibuja lo
 * que el servidor manda y NO una cuenta propia. Por eso los números de las filas
 * son los que manda el mock, y el consumo que viaja (10) es distinto del que
 * saldría de sumarle el ajuste (15): si la pantalla sumara, daría el otro.
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

const { AnalysisTab } = await import('@/features/filament/AnalysisTab');

const COMPRA = {
  id: 'c1', date: '2026-08-05T00:00:00.000Z', materialId: 'm1', materialName: 'PLA Cyan', brand: 'StratoFill',
  type: 'PLA', color: 'Cyan', quantity: 2, amount: 40, costPerRoll: 20, costPerGram: 0.02, providerName: null,
  note: null, providerId: null, counterpartyId: null, counterpartyName: null, counterpartyKind: null,
  rate: null, currencyCode: null,
} as unknown as FilamentPurchase;

const fila = (over: Partial<FilaDeConsumoPorMes> & { mes: string }): FilaDeConsumoPorMes => ({
  abierto: false, compras: 0, inventarioFinal: 0, consumo: 0, ajuste: 0,
  rollosConCreditoNuevo: 0, rollosConCreditoLiberado: 0, ...over,
});

/** Agosto y septiembre cerrados sin ajuste, octubre con un rollo que se pesó, noviembre abierto. */
const MESES: FilaDeConsumoPorMes[] = [
  fila({ mes: '2026-08', compras: 100, inventarioFinal: 30, consumo: 70 }),
  fila({ mes: '2026-09', compras: 20, inventarioFinal: 40, consumo: 10 }),
  fila({ mes: '2026-10', compras: 10, inventarioFinal: 45, consumo: 10, ajuste: 5, rollosConCreditoNuevo: 1 }),
  fila({ mes: '2026-11', abierto: true, compras: 30, inventarioFinal: 75, consumo: null, ajuste: null }),
];

const RESULTADO: ResultadoDeOperacion = {
  ingresos: 500, gastosOperativos: 100, utilidad: 400, filamentoEnEstante: 70,
  mesesCompletos: [], tramosSueltos: false, mesesSinContar: [], mesesConConsumoNegativo: [], ajustePorMedicion: 5,
};

function montar(meses: FilaDeConsumoPorMes[] = MESES) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/filament/purchases') return { data: [COMPRA] };
    if (url === '/filament/consumo') return { data: { meses } };
    if (url === '/expenses/resultado') return { data: RESULTADO };
    if (url === '/settings') return { data: { currency: 'USD', locale: 'en-US', defaultRateLabel: null } };
    return { data: null };
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <AnalysisTab />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Las celdas de una fila, en texto. */
const celdas = (testId: string) =>
  within(screen.getByTestId(testId))
    .queryAllByRole('cell')
    .map((c) => c.textContent ?? '');

beforeEach(() => {
  mocks.get.mockReset();
  localStorage.clear();
});

describe('Filamento → Análisis: la tabla mes a mes', () => {
  it('muestra una fila por mes con compras, inventario, consumo y ajuste', async () => {
    montar();
    await screen.findByTestId('mes-2026-08');

    // Compras · Inventario al cierre · Consumo, tal cual los manda el servidor.
    expect(celdas('mes-2026-08')).toEqual(['$100.00', '$30.00', '$70.00']);
    expect(celdas('mes-2026-09')).toEqual(['$20.00', '$40.00', '$10.00']);
    expect(screen.getByTestId('mes-2026-08').textContent).toContain('Agosto 2026');
    // La fila de ajuste SOLO existe cuando el ajuste no es 0: una que siempre dice «—» se aprende a saltear.
    expect(screen.queryByTestId('ajuste-2026-08')).toBeNull();
    expect(screen.queryByTestId('ajuste-2026-09')).toBeNull();
    expect(screen.getByTestId('ajuste-2026-10')).toBeTruthy();
  });

  it('el encabezado da la fórmula COMPLETA (con el ajuste) y nombra el concepto una vez', async () => {
    montar();
    await screen.findByTestId('mes-2026-08');

    const texto = document.body.textContent ?? '';
    expect(texto).toContain('Consumo = lo que había + lo que compraste − lo que queda + el ajuste por medición');
    expect(texto).toContain('fila de «Ajuste por medición»');
  });

  it('la cuenta del encabezado cierra en octubre, celda por celda: 40 + 10 − 45 + 5 = 10', async () => {
    montar([
      fila({ mes: '2026-09', compras: 20, inventarioFinal: 40, consumo: 10 }),
      fila({ mes: '2026-10', compras: 10, inventarioFinal: 45, consumo: 10, ajuste: 5, rollosConCreditoNuevo: 1 }),
      fila({ mes: '2026-11', abierto: true, compras: 0, consumo: null, ajuste: null }),
    ]);
    await screen.findByTestId('mes-2026-10');

    const num = (t: string) => Number(t.replace(/[^0-9.\-−+]/g, '').replace('−', '-'));
    const inicial = num(celdas('mes-2026-09')[1]); // inventario al cierre de septiembre
    const [, compras, inventario, consumo] = [0, ...celdas('mes-2026-10').map(num)];
    const ajuste = num(celdas('ajuste-2026-10')[3]);
    expect(inicial + compras - inventario + ajuste).toBe(consumo);
  });

  it('el ajuste va en su PROPIA fila, nunca sumado al consumo', async () => {
    montar();
    await screen.findByTestId('mes-2026-10');

    // El consumo de octubre es el que mandó el servidor (10), no 10 + 5.
    expect(celdas('mes-2026-10')[2]).toBe('$10.00');
    expect(screen.queryByText('$15.00')).toBeNull();
    // El ajuste está en la fila de abajo, con su signo, CELDA POR CELDA: bajo la columna Consumo, no bajo Inventario.
    expect(celdas('ajuste-2026-10')).toEqual(['Ajuste por medición', '', '', '+$5.00']);
    const columnas = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(columnas.indexOf('Consumo')).toBe(3);
    // Y la fila del mes NO lo menciona.
    expect(screen.getByTestId('mes-2026-10').textContent).not.toContain('Ajuste');
  });

  it('un mes con ajuste POSITIVO dice que se pesó un rollo que estaba sin pesar, y que ya se había contado como consumo', async () => {
    montar();
    const nota = await screen.findByTestId('ajuste-explicacion-2026-10');

    expect(nota.textContent).toContain('No es plata nueva');
    expect(nota.textContent).toContain('1 rollo que estaba sin pesar se pesó');
    expect(nota.textContent).toContain('ya se había contado como consumo');
    // ⚠️ El crédito puede nacer MÁS DE UNA VEZ: «por primera vez» era falso desde el 2.º ciclo.
    expect(nota.textContent).not.toContain('por primera vez');
    expect(nota.textContent).toContain('no baja el consumo de este mes');
    expect(nota.textContent).toContain('No lo leas como una venta');
    // ⚠️ Las frases viejas afirmaban cosas que con el motor del crédito no pasan.
    expect(nota.textContent).not.toContain('cambió de medición');
    expect(nota.textContent).not.toContain('sin que se haya comprado ni gastado nada');
    // Los meses sin ajuste no llevan explicación.
    expect(screen.queryByTestId('ajuste-explicacion-2026-08')).toBeNull();
    expect(screen.queryByTestId('ajuste-explicacion-2026-09')).toBeNull();
  });

  it('con varios rollos usa el plural y separa los que estrenaron crédito de los que lo liberaron', async () => {
    montar([
      fila({
        mes: '2026-09', compras: 0, inventarioFinal: 40, consumo: 0, ajuste: 3,
        rollosConCreditoNuevo: 3, rollosConCreditoLiberado: 1,
      }),
      fila({ mes: '2026-10', abierto: true, compras: 0, consumo: null, ajuste: null }),
    ]);
    const nota = await screen.findByTestId('ajuste-explicacion-2026-09');

    // ⚠️ ASIMÉTRICO a propósito (3 y 1): con 1 y 1, invertir los dos contadores no cambia el texto.
    expect(nota.textContent).toContain('3 rollos que estaban sin pesar se pesaron');
    expect(nota.textContent).toContain('1 rollo ya pesado gastó parte de su valor');
    // ⚠️ CONCORDANCIA: el que va en singular lleva el paréntesis en singular, aunque el
    // otro pedazo de la misma frase esté en plural.
    expect(nota.textContent).toContain('(pesa menos, pasó a «por acabarse», se terminó o quedó sin pesar)');
  });

  it('el mes abierto dice cuánto se compró y que sigue en el estante, sin inventar consumo', async () => {
    montar();
    await screen.findByTestId('mes-2026-11');

    const abierto = screen.getByTestId('mes-2026-11');
    expect(abierto.textContent).toContain('Noviembre 2026');
    expect(abierto.textContent).toContain('(abierto)');
    // Compras sí; inventario y consumo, en guion: nada se inventa.
    expect(celdas('mes-2026-11')).toEqual(['$30.00', '—', '—']);
    expect(screen.getByTestId('abierto-2026-11').textContent).toContain('Se compraron $30.00 y siguen en el estante');
    expect(screen.getByTestId('abierto-2026-11').textContent).toContain('El consumo se conoce cuando se cierra el mes');
    // Y no tiene fila de ajuste: no hay medición que explicar.
    expect(screen.queryByTestId('ajuste-2026-11')).toBeNull();
  });

  it('dice cuánto de lo comprado sigue en el estante, con el dato que ya viaja en el Resultado', async () => {
    montar();
    const linea = await screen.findByTestId('en-el-estante');

    expect(linea.textContent).toContain('$70.00');
    expect(linea.textContent).toContain('sigue en el estante');
    expect(mocks.get).toHaveBeenCalledWith('/expenses/resultado', expect.anything());
  });

  it('un consumo negativo se marca: es casi seguro un conteo mal tipeado', async () => {
    montar([
      fila({ mes: '2026-09', compras: 0, inventarioFinal: 400, consumo: -340 }),
      fila({ mes: '2026-10', abierto: true, consumo: null, ajuste: null }),
    ]);
    await screen.findByTestId('mes-2026-09');

    expect(screen.getByTestId('mes-2026-09').textContent).toContain('revisar el conteo');
  });

  it('el mes más reciente va primero', async () => {
    montar();
    await screen.findByTestId('mes-2026-08');

    const orden = screen.getAllByTestId(/^mes-/).map((f) => f.getAttribute('data-testid'));
    expect(orden).toEqual(['mes-2026-11', 'mes-2026-10', 'mes-2026-09', 'mes-2026-08']);
  });

  /**
   * ⚠️ EL CASO QUE NINGÚN SPEC CUBRÍA: un mes con ajuste NEGATIVO porque un rollo
   * pesado SE TERMINÓ. Las frases viejas decían de él que «volvió a sin pesar» y que
   * «no lo leas como un consumo» — de un rollo que sí se consumió, entero.
   */
  it('la mitad NEGATIVA del ajuste: el rollo gastó lo que tenía reservado, y eso ya se contó como consumo', async () => {
    montar([
      fila({
        mes: '2026-09', compras: 0, inventarioFinal: 40, consumo: 12, ajuste: -8,
        rollosConCreditoNuevo: 0, rollosConCreditoLiberado: 1,
      }),
      fila({ mes: '2026-10', abierto: true, compras: 0, consumo: null, ajuste: null }),
    ]);
    await screen.findByTestId('mes-2026-09');

    expect(celdas('ajuste-2026-09')).toEqual(['Ajuste por medición', '', '', '−$8.00']);
    const nota = screen.getByTestId('ajuste-explicacion-2026-09').textContent ?? '';
    expect(nota).toContain('1 rollo ya pesado gastó parte de su valor');
    // ⚠️ CONCORDANCIA: en singular el paréntesis también va en singular.
    // ⚠️ «Pasó a «por acabarse»» va NOMBRADO: es el caso frecuente (todo rollo migra ahí).
    expect(nota).toContain('(pesa menos, pasó a «por acabarse», se terminó o quedó sin pesar)');
    expect(nota).not.toContain('se consumieron');
    expect(nota).toContain('ya se había contado como consumo antes');
    expect(nota).toContain('No lo cuentes dos veces');
    // Lo que el ajuste negativo NO puede decir.
    expect(nota).not.toContain('volvió a «sin pesar»');
    expect(nota).not.toContain('sin que se haya comprado ni gastado nada');
    expect(nota).not.toContain('una venta');
  });

  /**
   * El otro lado del mismo defecto: con el motor del crédito, un rollo que se abre de
   * un sellado y se pesa en el acto NO genera ajuste, así que la fila de ajuste **no
   * existe** y nadie puede decir de él que «pasó de sin pesar a pesado».
   */
  it('un rollo abierto de un sellado y pesado en el acto no deja fila de ajuste', async () => {
    montar([
      fila({ mes: '2026-09', compras: 40, inventarioFinal: 30, consumo: 10, ajuste: 0 }),
      fila({ mes: '2026-10', abierto: true, compras: 0, consumo: null, ajuste: null }),
    ]);
    await screen.findByTestId('mes-2026-09');

    expect(screen.queryByTestId('ajuste-2026-09')).toBeNull();
    expect(screen.queryByTestId('ajuste-explicacion-2026-09')).toBeNull();
  });

  it('una fila CERRADA que llegara con consumo null dice «—», no $0.00 (no sé ≠ cero)', async () => {
    montar([
      fila({ mes: '2026-09', compras: 5, inventarioFinal: 40, consumo: null, ajuste: null }),
      fila({ mes: '2026-10', abierto: true, compras: 0, consumo: null, ajuste: null }),
    ]);
    await screen.findByTestId('mes-2026-09');

    expect(celdas('mes-2026-09')).toEqual(['$5.00', '$40.00', '—']);
  });
});
