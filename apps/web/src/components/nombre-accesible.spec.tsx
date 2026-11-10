import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { FilamentPurchase } from '@calc3d/shared';
import { TooltipProvider } from '@/components/overlays';
import { Field, Select } from '@/components/ui';
import { Combobox } from '@/components/Combobox';

/**
 * NOMBRE ACCESIBLE EN LOS DESPLEGABLES (2026-11-10).
 *
 * ⚠️ La causa: el `<label>` de `Field` es hermano de su control y no lleva
 * `htmlFor`, y un `Select` del repo es un `<button>` (trigger de Radix o
 * `role="combobox"` propio), que un `<label>` no puede etiquetar. Resultado:
 * ningún `Select` dentro de un `Field` tenía nombre, en ninguna pantalla.
 *
 * El arreglo está en `Field` (publica el id de su etiqueta y el control lo toma
 * como `aria-labelledby`), no en cada llamada. Por eso la mutación que valida
 * este archivo espera VERDE: un `Select` nuevo, sin `aria-label`, dentro de un
 * `Field`, tiene que pasar porque hereda el nombre. Si se pusiera rojo, se
 * habrían parchado los casos de a uno en vez de la causa.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { PurchasesTab } = await import('@/features/filament/PurchasesTab');
const { ExpenseModal } = await import('@/features/finance/ExpenseModal');
const { EditarCompra } = await import('@/features/filament/EditarCompra');

const COMPRA: FilamentPurchase = {
  id: 'c-1',
  date: '2026-10-09T00:00:00.000Z',
  materialId: 'm1',
  materialName: 'PLA Basic Blanco',
  brand: 'Bambu Lab',
  type: 'PLA Basic',
  color: 'Blanco',
  quantity: 1,
  amount: 15,
  costPerRoll: 15,
  costPerGram: 0.015,
  providerName: 'StratoFill',
  note: null,
  providerId: null,
  counterpartyId: null,
  counterpartyName: null,
  counterpartyKind: null,
  rate: null,
  currencyCode: null,
  isRefill: null,
  invoice: null,
};

function envolver(ui: React.ReactNode) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/filament/purchases') return { data: [COMPRA] };
    if (url === '/materials') return { data: [{ id: 'm1', name: 'PLA Basic Blanco' }] };
    if (url === '/settings') {
      return { data: { currency: 'USD', locale: 'en-US', defaultRateLabel: null } };
    }
    return { data: [] };
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>{ui}</TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** El nombre accesible calculado de un combobox: su `aria-label` o el texto de lo que lo nombra. */
function nombreDe(el: HTMLElement): string {
  const propio = el.getAttribute('aria-label');
  if (propio) return propio;
  return (el.getAttribute('aria-labelledby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
}

const nombresDeLaPantalla = () => screen.getAllByRole('combobox').map(nombreDe);

describe('Nombre accesible de los desplegables', () => {
  it('un Select dentro de un Field toma el nombre de su etiqueta', () => {
    render(
      <Field label="Moneda">
        <Select value="a">
          <option value="a">Dólar</option>
          <option value="b">Euro</option>
        </Select>
      </Field>,
    );
    expect(screen.getByRole('combobox', { name: 'Moneda' })).toBeTruthy();
  });

  it('un Select con aria-label propio conserva el suyo y no el del Field', () => {
    render(
      <Field label="Moneda">
        <Select aria-label="Divisa" value="a">
          <option value="a">Dólar</option>
        </Select>
      </Field>,
    );
    expect(screen.getByRole('combobox', { name: 'Divisa' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Moneda' })).toBeNull();
  });

  it('la variante con buscador (lista larga) también lo hereda', () => {
    render(
      <Field label="Material">
        <Select value="v0">
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={`v${i}`}>{`Opción ${i}`}</option>
          ))}
        </Select>
      </Field>,
    );
    expect(screen.getByRole('combobox', { name: 'Material' })).toBeTruthy();
  });

  it('dos Field distintos dan dos nombres distintos', () => {
    render(
      <>
        <Field label="Uno">
          <Select value="a">
            <option value="a">A</option>
          </Select>
        </Field>
        <Field label="Dos">
          <Select value="a">
            <option value="a">A</option>
          </Select>
        </Field>
      </>,
    );
    expect(screen.getByRole('combobox', { name: 'Uno' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Dos' })).toBeTruthy();
  });

  it('un Combobox sin placeholder dentro de un Field NO se llama «Elegir o escribir…»', () => {
    envolver(
      <Field label="Marca (opcional)">
        <Combobox kind="MATERIAL_BRAND" value="" onChange={() => {}} />
      </Field>,
    );
    expect(screen.queryByRole('combobox', { name: 'Elegir o escribir…' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Marca (opcional)' })).toBeTruthy();
  });

  it('un Combobox suelto acepta su propio aria-label', () => {
    envolver(<Combobox kind="MATERIAL_BRAND" value="" onChange={() => {}} aria-label="Marca" />);
    expect(screen.getByRole('combobox', { name: 'Marca' })).toBeTruthy();
  });

  describe('los controles de /filament/compras', () => {
    const CONTROLES = [
      ['PurchasesTab: rango de fechas', 'tab', /^Período$/],
      ['PurchasesTab: Filamento: todos', 'tab', /^Filtrar por filamento$/],
      ['PurchasesTab: Proveedor: todos', 'tab', /^Filtrar por proveedor$/],
      ['ExpenseModal: Marca', 'gasto', /^Marca/],
      ['ExpenseModal: Tipo', 'gasto', /^Tipo/],
      ['ExpenseModal: Color', 'gasto', /^Color/],
      ['ExpenseModal: Proveedor', 'gasto', /^Proveedor/],
      ['ExpenseModal: ¿Quién lo pagó?', 'gasto', /¿Quién lo pagó\?/],
      ['ExpenseModal: Elegir material', 'gasto-existente', /^Elegir /],
      ['EditarCompra: Filamento', 'editar', /^Filamento/],
      ['EditarCompra: Proveedor', 'editar', /^Proveedor/],
      ['EditarCompra: ¿Quién lo pagó?', 'editar', /¿Quién lo pagó\?/],
    ] as const;

    it.each(CONTROLES)('%s tiene nombre accesible', async (_nombre, pantalla, patron) => {
      envolver(
        pantalla === 'tab' ? (
          <PurchasesTab />
        ) : pantalla === 'editar' ? (
          <EditarCompra compra={COMPRA} onClose={() => {}} />
        ) : (
          <ExpenseModal tipoFijo="filament" onClose={() => {}} onSaved={() => {}} />
        ),
      );
      if (pantalla === 'gasto-existente') {
        fireEvent.click(screen.getByRole('button', { name: /Del catálogo/ }));
      }
      if (pantalla === 'tab') await screen.findByRole('table');

      expect(nombresDeLaPantalla().some((n) => patron.test(n))).toBe(true);
    });

    it('ningún control del alta de gasto se llama «Elegir o escribir…»', () => {
      envolver(<ExpenseModal tipoFijo="filament" onClose={() => {}} onSaved={() => {}} />);
      const nombres = nombresDeLaPantalla();
      expect(nombres.length).toBeGreaterThan(0);
      expect(nombres).not.toContain('Elegir o escribir…');
      expect(nombres.every((n) => n !== '')).toBe(true);
    });
  });
});
