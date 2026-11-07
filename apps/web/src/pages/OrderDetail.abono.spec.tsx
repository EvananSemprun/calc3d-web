import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';

/**
 * EL ABONO COBRADO EN BOLÍVARES — el CABLEADO.
 *
 * `usdDesdeMoneda` y `saldoAFavorDelAbono` ya están probadas caso por caso en
 * `shared/calc/abono-en-moneda.spec.ts`, y el contrato en
 * `shared/schemas/abono-en-moneda.spec.ts`. Lo que se mide acá es lo que esos
 * tests no pueden ver: **qué manda el formulario**.
 *
 * ⚠️ Y en este caso es la mitad que importa de verdad: si el modal mandara el
 * `amount` junto con la moneda, el servidor devuelve 400 y el abono NO se
 * registra — con las funciones puras en verde. Es la lección de `pasaTipo` en
 * Gastos, donde cambiar la llamada de la pantalla no tumbaba ni un test.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { OrderDetailPage } = await import('@/pages/OrderDetail');

/** Encargo de $300 con $280 abonados: faltan $20. */
const ENCARGO = {
  id: 'o1',
  code: 7,
  status: 'CONFIRMED',
  deliveryDate: null,
  notes: null,
  originChannel: null,
  campaignId: null,
  printerId: null,
  reprints: null,
  currencyLabel: null,
  exchangeRates: null,
  settledAt: null,
  client: { id: 'c1', name: 'Victoria Fuenmayor', phone: null },
  lines: [{ description: 'Llaveros', quantity: 200, unit: 'u', unitPrice: 1.5 }],
  payments: [
    {
      id: 'p1',
      date: '2026-11-01T00:00:00.000Z',
      amount: 280,
      note: null,
      rate: null,
      currencyCode: null,
      currencyLabel: null,
      amountForeign: null,
    },
  ],
  total: 300,
  paid: 280,
  balance: 20,
};

const TASAS = {
  rates: [
    { label: 'BCV Euro', currencyCode: 'VES', rate: 260, source: 'AUTO', updatedAt: '2026-11-07' },
    { label: 'Binance / USDT', currencyCode: 'VES', rate: 700, source: 'MANUAL', updatedAt: '2026-11-07' },
  ],
};

function montar() {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/orders/o1') return Promise.resolve({ data: ENCARGO });
    if (url === '/exchange-rates') return Promise.resolve({ data: TASAS });
    if (url === '/campaigns') return Promise.resolve({ data: [] });
    // React Query rechaza `undefined` como dato de una consulta.
    return Promise.resolve({ data: null });
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={['/orders/o1']}>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <Routes>
            <Route path="/orders/:id" element={<OrderDetailPage />} />
          </Routes>
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Abre el modal de abono. */
async function abrirAbono() {
  montar();
  fireEvent.click(await screen.findByRole('button', { name: /Abono/ }));
  return await screen.findByRole('button', { name: /Registrar abono/ });
}

const cuerpoDelAbono = () => {
  const llamada = mocks.post.mock.calls.find((c) => String(c[0]).includes('/payments'));
  if (!llamada) throw new Error('no se mandó ningún abono');
  return llamada[1] as Record<string, unknown>;
};

/**
 * El desplegable de la casa NO es un `<select>` nativo: con pocas opciones es
 * un Radix (un `button` con rol combobox). Se opera como en `Select.spec.tsx`:
 * Enter para abrir y click en la opción.
 */
const elegirMoneda = async (label: string) => {
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Cómo pagó' }), { key: 'Enter' });
  // ⚠️ `find` y no `get`: las tasas llegan por consulta, así que al abrir el
  // modal la lista todavía puede tener solo "En dólares".
  // ⚠️ Por ROL y no por texto: el trigger de Radix repite la etiqueta elegida,
  // así que un `findByText` encuentra dos y el test se cae por ambiguo.
  fireEvent.click(await screen.findByRole('option', { name: label }));
};

describe('Registrar abono', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset().mockResolvedValue({ data: {} });
  });

  it('en dólares manda el monto en USD y nada de moneda', async () => {
    const guardar = await abrirAbono();
    fireEvent.click(guardar);
    const cuerpo = cuerpoDelAbono();
    expect(cuerpo.amount).toBe(20); // propone lo que falta
    expect(cuerpo.currencyLabel).toBeUndefined();
    expect(cuerpo.rate).toBeUndefined();
    expect(cuerpo.amountForeign).toBeUndefined();
  });

  it('al elegir una moneda precarga SU tasa vigente', async () => {
    await abrirAbono();
    await elegirMoneda('BCV Euro');
    expect(screen.getByLabelText(/Tasa \(VES por USD\)/)).toHaveValue(260);
  });

  /**
   * ⚠️ EL TEST QUE IMPORTA. El monto en USD lo deriva el SERVIDOR; mandarlo es
   * un 400 del schema, así que el abono no se registraría.
   */
  it('en bolívares manda moneda, tasa y monto en Bs — y NUNCA el USD', async () => {
    const guardar = await abrirAbono();
    await elegirMoneda('BCV Euro');
    fireEvent.change(screen.getByLabelText(/Tasa \(VES por USD\)/), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('Monto (VES)'), { target: { value: '1900' } });
    fireEvent.click(guardar);

    const cuerpo = cuerpoDelAbono();
    expect(cuerpo).toMatchObject({ currencyLabel: 'BCV Euro', rate: 250, amountForeign: 1900 });
    expect('amount' in cuerpo).toBe(false);
  });

  /** La tasa que viaja es la ESCRITA, no la vigente: ese es todo el punto. */
  it('manda la tasa que se escribió, no la de la app', async () => {
    const guardar = await abrirAbono();
    await elegirMoneda('BCV Euro');
    fireEvent.change(screen.getByLabelText(/Tasa \(VES por USD\)/), { target: { value: '250' } });
    fireEvent.click(guardar);
    expect(cuerpoDelAbono().rate).toBe(250); // la vigente es 260
  });

  it('muestra en vivo a cuántos dólares equivale', async () => {
    await abrirAbono();
    await elegirMoneda('BCV Euro');
    fireEvent.change(screen.getByLabelText(/Tasa \(VES por USD\)/), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('Monto (VES)'), { target: { value: '1900' } });
    expect(screen.getByText(/Se registra como/)).toHaveTextContent('7.60');
  });

  /**
   * ⚠️ AVISA Y DEJA GUARDAR. Pasarse por diferencia cambiaria es el caso real;
   * bloquear ahí sería bloquear justo lo que este cambio vino a permitir.
   */
  it('avisa del saldo a favor sin apagar el botón', async () => {
    const guardar = await abrirAbono();
    await elegirMoneda('BCV Euro');
    fireEvent.change(screen.getByLabelText(/Tasa \(VES por USD\)/), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('Monto (VES)'), { target: { value: '6000' } }); // $24
    expect(screen.getByText(/a favor del cliente/)).toBeInTheDocument();
    expect(guardar).not.toBeDisabled();
  });

  it('con el abono justo NO aparece el aviso', async () => {
    await abrirAbono();
    await elegirMoneda('BCV Euro');
    fireEvent.change(screen.getByLabelText(/Tasa \(VES por USD\)/), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('Monto (VES)'), { target: { value: '5000' } }); // $20
    expect(screen.queryByText(/a favor del cliente/)).not.toBeInTheDocument();
  });

  /** Sin tasa no se puede dividir: el botón se apaga en vez de mandar basura. */
  it('sin tasa no deja guardar', async () => {
    const guardar = await abrirAbono();
    await elegirMoneda('BCV Euro');
    fireEvent.change(screen.getByLabelText(/Tasa \(VES por USD\)/), { target: { value: '0' } });
    expect(guardar).toBeDisabled();
  });
});
