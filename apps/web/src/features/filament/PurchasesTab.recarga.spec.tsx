import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { FilamentPurchase } from '@calc3d/shared';
import { TooltipProvider } from '@/components/overlays';

/**
 * RECARGA O CON CARRETE, EN LA PANTALLA (2026-10-20, shared 0.59.0).
 *
 * ⚠️ **Es un test de CABLEADO, no de función pura.** `etiquetaDeRecarga` ya
 * tiene sus tests en shared; lo que ninguno de ellos puede ver es si la
 * pantalla la **dibuja**, si la dibuja en la fila que corresponde y si le pasa
 * la compra de verdad. En este repo ya pasó: borrar una línea del JSX tumbaba 8
 * tests de pantalla y **cero** de función pura.
 *
 * ⚠️ Y el caso que importa es el TERCERO: una compra sin dato **no dice nada**.
 * Con `null` leído como "con carrete", las 95 compras históricas quedarían
 * afirmando algo que nadie decidió — la trampa del `DEFAULT 'BUSINESS'` de
 * `paidBy`, que dejó 71 gastos diciendo que los pagó el negocio.
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
  materialName: 'PLA Basic Blanco',
  brand: 'Bambu Lab',
  type: 'PLA Basic',
  color: 'Blanco',
  quantity: 1,
  amount: 17,
  costPerRoll: 17,
  costPerGram: 0.017,
  providerName: 'StratoFill',
  note: null,
  providerId: 'p1',
  counterpartyId: null,
  counterpartyName: null,
  counterpartyKind: null,
  rate: null,
  currencyCode: null,
  isRefill: null,
  invoice: null,
  ...over,
});

/**
 * Las tres filas son el **hermano alcanzable** de las otras dos: con una sola,
 * una pantalla que no dibujara nada (o que dibujara siempre lo mismo) pasaría
 * igual el test de la que falta.
 *
 * El caso es REAL: la ficha `PLA Basic Bambu Lab Blanco` tiene dos compras, la
 * del 31/08 (normal) y la del 09/10 (recarga). Es la medición que decidió que
 * el campo va en la COMPRA y no en la ficha.
 */
const COMPRAS = [
  compra({ id: 'c-recarga', materialName: 'PLA Basic Blanco', isRefill: true, amount: 15 }),
  compra({ id: 'c-carrete', materialName: 'PLA Matte Celeste', isRefill: false, amount: 22 }),
  compra({ id: 'c-vieja', materialName: 'PLA Silk Plateado', isRefill: null }),
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
 * ⚠️ Hay que acotar a la TABLA: la pantalla dibuja además las tarjetas de
 * móvil, así que en jsdom cada compra está dos veces y un `getByText` suelto se
 * rompe por ambigüedad.
 */
async function fila(filamento: string) {
  const tabla = await screen.findByRole('table');
  const celda = await within(tabla).findByText(filamento);
  const tr = celda.closest('tr');
  if (!tr) throw new Error(`La celda de ${filamento} no está en una fila`);
  return within(tr);
}

describe('Compras de filamento: recarga o con carrete', () => {
  it('una recarga lo dice en su fila', async () => {
    montar();
    const f = await fila('PLA Basic Blanco');

    expect(f.getByText('Recarga (sin carrete)')).toBeTruthy();
  });

  it('un rollo con carrete lo dice: no es la ausencia de dato', async () => {
    montar();
    const f = await fila('PLA Matte Celeste');

    expect(f.getByText('Con carrete')).toBeTruthy();
  });

  it('una compra SIN el dato no dice nada del carrete', async () => {
    montar();
    const f = await fila('PLA Silk Plateado');

    expect(f.queryByText(/carrete/i)).toBeNull();
    // Y la fila está dibujada de verdad: sin esta línea, el `queryByText` de
    // arriba pasaría por ausencia de la fila entera y no por la regla.
    expect(f.getByText('StratoFill')).toBeTruthy();
  });

  it('también lo dice en la tarjeta de móvil, que es el otro camino a lo mismo', async () => {
    montar();
    await screen.findByRole('table');

    // Dos veces cada etiqueta (tabla + tarjeta) y ninguna para la compra vieja.
    expect(screen.getAllByText('Recarga (sin carrete)')).toHaveLength(2);
    expect(screen.getAllByText('Con carrete')).toHaveLength(2);
  });
});
