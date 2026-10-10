import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CERRAR UN PRÉSTAMO, DESDE LA PANTALLA (2026-10-10).
 *
 * `useUpdateLoan` existía exportado y **sin usar**: un préstamo saldado no se
 * podía cerrar desde el panel, así que su cuota seguía pesando en el nivel 2
 * del punto de equilibrio para siempre.
 *
 * ⚠️ Este archivo mide EL CABLEADO, que es lo que los tests de función pura no
 * cubren: que el botón mande de verdad el `PATCH` con la fecha, que reabrir
 * mande `null`, y que el préstamo con saldo **no tenga el botón habilitado**.
 * `equilibrio-al-cerrar.spec.ts` prueba el efecto en el equilibrio; acá se
 * prueba que alguien pueda provocarlo.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { LoansPage } = await import('@/pages/Loans');
const { ConfirmProvider } = await import('@/components/overlays');

/** Un préstamo como lo serializa la API, con su saldo ya derivado. */
const prestamo = (over: Record<string, unknown> = {}) => ({
  id: 'l1',
  name: 'Deuda impresora',
  concept: null,
  principal: 1000,
  installmentTarget: 100,
  paymentFrequency: 'MONTHLY',
  counterparty: null,
  nextDueDate: null,
  startDate: null,
  closedAt: null,
  notes: null,
  printer: null,
  payments: [],
  paid: 1000,
  balance: 0,
  progress: 1,
  status: 'PAGADO',
  estimate: { atTarget: 0, atActualPace: 0, actualPace: null, unit: 'MONTHLY' },
  ...over,
});

const overview = (loans: Record<string, unknown>[]) => ({
  loans,
  owner: {
    counterparty: { id: 'cp-owner', name: 'Propietario', kind: 'OWNER' },
    obligations: [],
    total: 0,
    applicationOrder: 'OLDEST_FIRST',
  },
  suppliers: { groups: [], total: 0, aFavor: 0 },
  totals: {
    prestamista: loans.reduce((s, l) => s + (l.balance as number), 0),
    propietario: 0,
    proveedores: 0,
    total: loans.reduce((s, l) => s + (l.balance as number), 0),
  },
});

function montar(loans: Record<string, unknown>[]) {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/loans/overview') return Promise.resolve({ data: overview(loans) });
    if (url === '/counterparties') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: null });
  });
  mocks.patch.mockResolvedValue({ data: prestamo() });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ConfirmProvider>
          <LoansPage />
        </ConfirmProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Toca un botón y confirma en el diálogo de `useConfirm`. */
async function tocarYConfirmar(etiqueta: string | RegExp) {
  fireEvent.click(await screen.findByRole('button', { name: etiqueta }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
}

describe('Deuda: cerrar un préstamo saldado', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.patch.mockReset();
  });

  it('el saldado ofrece Cerrar, y al confirmar manda el PATCH con la fecha', async () => {
    montar([prestamo()]);

    await tocarYConfirmar(/Cerrar/);

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    const [ruta, cuerpo] = mocks.patch.mock.calls[0];
    expect(ruta).toBe('/loans/l1');
    // Un día pelado AAAA-MM-DD: el servidor rechaza un ISO con hora.
    expect(cuerpo.closedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('el cerrado ofrece Reabrir, y manda `closedAt: null`', async () => {
    montar([prestamo({ closedAt: '2026-10-10T00:00:00.000Z' })]);

    await tocarYConfirmar(/Reabrir/);

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.patch.mock.calls[0][1]).toEqual({ closedAt: null });
  });

  /** Cerrar no es borrar: un préstamo cerrado sigue en la lista. */
  it('el cerrado se sigue viendo, marcado como cerrado y sin Cerrar', async () => {
    montar([prestamo({ closedAt: '2026-10-10T00:00:00.000Z' })]);

    expect(await screen.findByText('Cerrado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cerrar/ })).not.toBeInTheDocument();
  });

  /**
   * ⚠️ El que todavía se debe: el botón está a la vista pero APAGADO, con el
   * motivo. El servidor también lo rechaza (409), pero un botón que parece
   * disponible y falla al tocarlo enseña a desconfiar de la pantalla.
   */
  it('con saldo pendiente el botón Cerrar está deshabilitado y dice por qué', async () => {
    montar([prestamo({ balance: 750, paid: 250, progress: 0.25, status: 'ACTIVO' })]);

    const boton = await screen.findByRole('button', { name: /Cerrar/ });

    expect(boton).toBeDisabled();
    expect(boton).toHaveAccessibleDescription(/750/);
  });

  it('el hermano alcanzable: con saldo 0 ese mismo botón está habilitado', async () => {
    montar([prestamo()]);

    expect(await screen.findByRole('button', { name: /Cerrar/ })).toBeEnabled();
  });
});
