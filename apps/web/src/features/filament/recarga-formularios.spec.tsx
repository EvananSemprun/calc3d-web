import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { FilamentPurchase } from '@calc3d/shared';
import { TooltipProvider } from '@/components/overlays';

/**
 * RECARGA O CON CARRETE: QUE LOS FORMULARIOS LO MANDEN (2026-10-20).
 *
 * ⚠️ **La función pura y la etiqueta en la tabla no ven esto.** Un desplegable
 * que se dibuje bien pero no viaje en el cuerpo del `POST`/`PATCH` deja el
 * campo en `null` para siempre, y la pantalla no tiene cómo delatarlo: `null`
 * se dibuja exactamente igual que "no lo anoté", que es lo correcto. Sin este
 * test, el campo podría estar roto y todo lo demás en verde.
 *
 * ⚠️ Y el otro caso que importa es el **valor por defecto**: el desplegable
 * arranca en "No lo anoté" y guardar sin tocarlo manda `null`. Si arrancara en
 * "Con carrete" porque es lo más común, cada compra que el dueño no mire
 * afirmaría algo que nadie decidió — el `DEFAULT 'BUSINESS'` de `paidBy`, que
 * dejó 71 gastos diciendo que los pagó el negocio, otra vez.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

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

function montar(compra = COMPRA) {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/materials') return { data: [{ id: 'm1', name: 'PLA Basic Blanco' }] };
    if (url === '/counterparties') return { data: [] };
    if (url === '/clients') return { data: [] };
    if (url === '/settings') {
      return { data: { currency: 'USD', locale: 'en-US', defaultRateLabel: null } };
    }
    return { data: [] };
  });
  mocks.patch.mockResolvedValue({ data: {} });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <EditarCompra compra={compra} onClose={() => {}} />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** El cuerpo del único PATCH que se mandó. */
const cuerpo = () => mocks.patch.mock.calls[0][1] as Record<string, unknown>;

/**
 * El desplegable de la casa es un Radix (un `button`, no un `<select>`), así
 * que se opera como en `Select.spec.tsx`: Enter para abrir y click en la
 * opción. `user-event` no está instalado en este repo y no se agrega una
 * dependencia por un test.
 */
const elegir = async (opcion: string) => {
  const trigger = await screen.findByRole('combobox', { name: '¿Recarga o con carrete?' });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(screen.getByText(opcion));
};

const guardar = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

describe('Corregir compra: recarga o con carrete', () => {
  it('marcarla como recarga la manda en `true`', async () => {
    montar();
    await elegir('Recarga (sin carrete)');
    guardar();

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(cuerpo().isRefill).toBe(true);
  });

  it('marcarla con carrete la manda en `false`, que es un dato y no la ausencia de uno', async () => {
    montar();
    await elegir('Con carrete');
    guardar();

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(cuerpo().isRefill).toBe(false);
  });

  it('sin tocarlo manda `null`: el desplegable NO arranca en "Con carrete"', async () => {
    montar();

    const trigger = await screen.findByRole('combobox', { name: '¿Recarga o con carrete?' });
    expect(trigger.textContent).toContain('No lo anoté');

    guardar();
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(cuerpo().isRefill).toBeNull();
  });

  it('una compra ya marcada abre con su valor puesto, no en blanco', async () => {
    montar({ ...COMPRA, isRefill: true });

    const trigger = await screen.findByRole('combobox', { name: '¿Recarga o con carrete?' });
    expect(trigger.textContent).toContain('Recarga (sin carrete)');
  });

  /**
   * ⚠️ Desandar una marca equivocada tiene que poder hacerse: si no, el dueño
   * queda obligado a sostener una afirmación que ya sabe falsa.
   */
  it('volver a "No lo anoté" BORRA el dato (null), no lo deja en false', async () => {
    montar({ ...COMPRA, isRefill: true });
    await elegir('No lo anoté');
    guardar();

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(cuerpo().isRefill).toBeNull();
  });
});

// ---------------------------------------------------------------------------

const { ExpenseModal } = await import('@/features/finance/ExpenseModal');

/**
 * ⚠️ **El modal de REGISTRAR es la otra puerta, y es la que más usa el dueño.**
 * `EditarCompra` corrige lo que ya existe; esta carga lo nuevo. Son dos cuerpos
 * distintos —`POST /expenses/with-definition` para una ficha nueva y
 * `POST /expenses` para el resto—, así que un test del corrector no dice nada
 * sobre esta.
 */
function montarAlta() {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/settings') {
      return { data: { currency: 'USD', locale: 'en-US', defaultRateLabel: null } };
    }
    return { data: [] };
  });
  mocks.post.mockResolvedValue({ data: {} });

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <ExpenseModal tipoFijo="filament" onClose={() => {}} onSaved={() => {}} />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/**
 * El input de un campo por su etiqueta VISIBLE.
 *
 * ⚠️ Hace falta porque `Field` **no asocia** su `<label>` con el control (no
 * hay `htmlFor`/`id`), así que `getByLabelText` no lo encuentra. Es una
 * carencia de accesibilidad real del primitivo, anterior a este cambio: por eso
 * los desplegables de recarga llevan `aria-label` explícito.
 */
const campo = (etiqueta: string) => {
  const label = screen.getByTitle(etiqueta);
  const wrapper = label.parentElement?.parentElement;
  if (!wrapper) throw new Error(`El campo "${etiqueta}" no tiene contenedor`);
  return wrapper.querySelector('input') as HTMLInputElement;
};

/** Lo mínimo que el formulario exige para dejar guardar. */
const llenarLoObligatorio = () => {
  fireEvent.change(campo('Monto pagado (USD)'), { target: { value: '19' } });
  fireEvent.change(campo('Nombre'), { target: { value: 'PLA Basic Blanco' } });
};

/** El cuerpo del único POST que se mandó, ya sea a `/expenses` o a su gemela. */
const cuerpoAlta = () => mocks.post.mock.calls[0][1] as Record<string, unknown>;

describe('Registrar compra: recarga o con carrete', () => {
  it('el control está en el formulario de alta, no solo en el de corregir', async () => {
    montarAlta();

    expect(
      await screen.findByRole('combobox', { name: '¿Recarga o con carrete?' }),
    ).toBeTruthy();
  });

  it('marcarla como recarga la manda en `true`', async () => {
    montarAlta();
    llenarLoObligatorio();
    await elegir('Recarga (sin carrete)');
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const cuerpo = cuerpoAlta();
    // La ficha nueva viaja dentro de `expense`; una del catálogo, plana.
    const gasto = (cuerpo.expense ?? cuerpo) as Record<string, unknown>;
    expect(gasto.isRefill).toBe(true);
  });

  it('marcarla con carrete la manda en `false`, no en null', async () => {
    montarAlta();
    llenarLoObligatorio();
    await elegir('Con carrete');
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const gasto = (cuerpoAlta().expense ?? cuerpoAlta()) as Record<string, unknown>;
    expect(gasto.isRefill).toBe(false);
  });

  /**
   * ⚠️ El caso que protege la lección: **el desplegable arranca en "No lo
   * anoté"**. Preseleccionar "Con carrete" porque es lo más común haría que
   * cada compra que el dueño no mire afirme algo que nadie decidió.
   */
  it('sin tocarlo manda `null`: no hay default que afirme un carrete', async () => {
    montarAlta();

    const trigger = await screen.findByRole('combobox', { name: '¿Recarga o con carrete?' });
    expect(trigger.textContent).toContain('No lo anoté');

    llenarLoObligatorio();
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    const gasto = (cuerpoAlta().expense ?? cuerpoAlta()) as Record<string, unknown>;
    expect(gasto.isRefill).toBeNull();
  });
});
