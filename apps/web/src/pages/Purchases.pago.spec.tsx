import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';
import type { PurchaseInvoice } from '@/features/purchases/api';

/**
 * EL FORMULARIO DE PAGO (fase B, tarea 6): moneda, tasa mostrada y «¿se te devuelve?».
 *
 * Es el CABLEADO del modal «Abonar»: lo que se dibuja y lo que viaja en el POST.
 *
 * ⚠️ Decisión que protege el test del contrato: **la tasa se MUESTRA, no se
 * manda**. El servidor la resuelve por el nombre de la tasa; si viajara, quien
 * tenga el token elegiría cuánto vale lo que pagó.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch, delete: mocks.del },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { PurchasesPage } = await import('@/pages/Purchases');

const PROVEEDOR = { id: 's1', name: 'StratoFill' };

const linea = (id: string, cantidad: number, precio: number) => ({
  id,
  materialId: 'm1',
  materialName: 'PLA Negro',
  printerId: null,
  printerName: null,
  nombreNuevo: null,
  componentId: null,
  componentName: null,
  nuevoTipo: null,
  nuevaMarca: null,
  nuevoTipoFilamento: null,
  nuevoColor: null,
  isRefill: null,
  quantity: cantidad,
  unitPrice: precio,
  received: cantidad,
  porRecibir: 0,
  recepciones: [],
});

const base = {
  expectedAt: null,
  notes: null,
  supplier: PROVEEDOR,
  voidedAt: null,
  voidReason: null,
  createdAt: '2026-10-05T10:00:00.000Z',
  source: 'MANUAL' as const,
  recibido: 1,
  porRecibir: 0,
};

/** Pagada de más: presta $15 de saldo a favor. */
const F_ORIGEN: PurchaseInvoice = {
  ...base,
  id: 'f1',
  code: 1,
  date: '2026-10-05T00:00:00.000Z',
  reference: 'FAC-0001',
  lines: [linea('l1', 5, 17)],
  payments: [
    {
      id: 'p1',
      date: '2026-10-05T00:00:00.000Z',
      amount: 100,
      counterpartyId: null,
      counterparty: null,
      accountId: null,
      note: null,
      tomadoDeFacturaId: null,
      voidedAt: null,
      voidReason: null,
      createdAt: '2026-10-05T10:00:00.000Z',
    },
  ],
  total: 85,
  pagado: 100,
  saldo: 0,
  aFavor: 15,
  aFavorDisponible: 15,
  pedido: 5,
  recibido: 5,
  status: { pago: 'PAGADA_DE_MAS', mercaderia: 'RECIBIDA' },
};

/** La que se abona: se deben $50. */
const F_DESTINO: PurchaseInvoice = {
  ...base,
  id: 'f2',
  code: 2,
  date: '2026-10-08T00:00:00.000Z',
  reference: 'FAC-0002',
  lines: [linea('l2', 2, 25)],
  payments: [],
  total: 50,
  pagado: 0,
  saldo: 50,
  aFavor: 0,
  aFavorDisponible: 0,
  pedido: 2,
  recibido: 2,
  status: { pago: 'SIN_PAGAR', mercaderia: 'RECIBIDA' },
};

const TASA_BCV = {
  label: 'BCV Dólar',
  currencyCode: 'VES',
  rate: 250,
  source: 'AUTO',
  updatedAt: '2026-11-12T10:00:00.000Z',
};

const CUENTA = {
  id: 'acc1',
  name: 'Banesco',
  kind: 'BANK',
  currency: 'VES',
  shared: false,
  sharedWithId: null,
  autoAttributeShortfall: false,
  isDefault: false,
  active: true,
};

const SOCIO = {
  id: 'c1',
  name: 'Evanan',
  kind: 'OWNER',
  isDefault: true,
  active: true,
  notes: null,
};

function montar() {
  mocks.post.mockResolvedValue({ data: {} });
  mocks.get.mockImplementation((url: string) => {
    if (url === '/purchase-invoices') return Promise.resolve({ data: [F_DESTINO, F_ORIGEN] });
    if (url === '/exchange-rates') return Promise.resolve({ data: { rates: [TASA_BCV] } });
    if (url === '/cash-accounts') return Promise.resolve({ data: [CUENTA] });
    if (url === '/counterparties') return Promise.resolve({ data: [SOCIO] });
    if (url === '/clients' || url === '/materials' || url === '/printers')
      return Promise.resolve({ data: [] });
    return Promise.resolve({ data: null });
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <PurchasesPage />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function abrirAbonar() {
  montar();
  const referencia = await screen.findByText(/FAC-0002/);
  const tarjeta = referencia.closest('li');
  if (!tarjeta) throw new Error('la tarjeta de la factura no se dibujó');
  fireEvent.click(within(tarjeta).getByRole('button', { name: 'Abonar' }));
  await screen.findByText('Abonar a la factura');
}

/** Se abre con el TECLADO: con el puntero Radix espera un `pointerup` que jsdom no sintetiza. */
async function elegir(etiqueta: string, opcion: string | RegExp) {
  const selector = await screen.findByLabelText(etiqueta);
  fireEvent.keyDown(selector, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByText(opcion));
}

const elegirMoneda = () => elegir('Moneda', /BCV Dólar/);
const tomarDelSaldo = () => elegir('¿Con qué lo pagas?', /^Del saldo a favor de la factura del/);
const cuerpoDelPost = () => mocks.post.mock.calls[0][1] as Record<string, unknown>;
const guardar = () => fireEvent.click(screen.getByRole('button', { name: /Usar el saldo|Abonar$/ }));

describe('Abonar: la moneda del pago', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
  });

  it('con moneda elegida aparece la tasa y el USD sale DERIVADO y no editable', async () => {
    await abrirAbonar();
    await elegirMoneda();

    expect(screen.getByText(/250/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Monto pagado (VES)'), { target: { value: '1900' } });

    // Bs 1.900 ÷ 250 = $7,60 — el caso de la captura del dueño.
    const usd = screen.getByLabelText('Equivalente en USD');
    expect(usd).toHaveValue('7.6');
    expect(usd).toHaveAttribute('readonly');
    // …y el «Monto (USD)» editable ya no está: dos montos editables se pisarían.
    expect(screen.queryByLabelText('Monto (USD)')).not.toBeInTheDocument();
  });

  it('DICE que es una estimación: manda la tasa del servidor al guardar', async () => {
    await abrirAbonar();
    await elegirMoneda();
    expect(screen.getByText(/estimaci[oó]n/i)).toBeInTheDocument();
  });

  it('…y su hermano: sin moneda no hay tasa ni estimación, y el monto en USD es editable', async () => {
    await abrirAbonar();
    await screen.findByLabelText('Moneda');
    expect(screen.queryByText(/estimaci[oó]n/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Equivalente en USD')).not.toBeInTheDocument();
    const monto = screen.getByLabelText('Monto (USD)');
    expect(monto).not.toHaveAttribute('readonly');
    fireEvent.change(monto, { target: { value: '12' } });
    expect(monto).toHaveValue(12);
  });

  it('volver a «Dólares» restaura el monto editable', async () => {
    await abrirAbonar();
    await elegirMoneda();
    await elegir('Moneda', /^Dólares/);
    expect(screen.getByLabelText('Monto (USD)')).not.toHaveAttribute('readonly');
    expect(screen.queryByLabelText('Equivalente en USD')).not.toBeInTheDocument();
  });
});

describe('Abonar: el contrato no cambia', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
  });

  it('con moneda viaja currencyLabel + amountForeign, y NUNCA rate ni un amount inventado', async () => {
    await abrirAbonar();
    await elegirMoneda();
    fireEvent.change(screen.getByLabelText('Monto pagado (VES)'), { target: { value: '1900' } });
    guardar();

    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(mocks.post.mock.calls[0][0]).toBe('/purchase-invoices/f2/payments');
    const cuerpo = cuerpoDelPost();
    expect(cuerpo.currencyLabel).toBe('BCV Dólar');
    expect(cuerpo.amountForeign).toBe(1900);
    expect(cuerpo).not.toHaveProperty('rate');
    expect(cuerpo).not.toHaveProperty('amount');
  });

  it('…y su hermano: en USD viaja amount y ninguna clave de moneda', async () => {
    await abrirAbonar();
    await screen.findByLabelText('Moneda');
    guardar();

    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    const cuerpo = cuerpoDelPost();
    expect(cuerpo.amount).toBe(50);
    expect(cuerpo).not.toHaveProperty('currencyLabel');
    expect(cuerpo).not.toHaveProperty('amountForeign');
    expect(cuerpo).not.toHaveProperty('rate');
  });

  it('con moneda elegida y DESPUÉS «del saldo a favor», la moneda no viaja', async () => {
    await abrirAbonar();
    await elegirMoneda();
    fireEvent.change(screen.getByLabelText('Monto pagado (VES)'), { target: { value: '1900' } });
    await tomarDelSaldo();
    guardar();

    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    const cuerpo = cuerpoDelPost();
    expect(cuerpo.tomadoDeFacturaId).toBe('f1');
    expect(cuerpo).not.toHaveProperty('currencyLabel');
    expect(cuerpo).not.toHaveProperty('amountForeign');
    expect(typeof cuerpo.amount).toBe('number');
  });
});

describe('Abonar: ida y vuelta por el saldo a favor', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
  });

  it('moneda → saldo a favor → «Con plata»: no reaparece la moneda y el monto vuelve al saldo de la factura', async () => {
    await abrirAbonar();
    await elegirMoneda();
    fireEvent.change(screen.getByLabelText('Monto pagado (VES)'), { target: { value: '1900' } });
    await tomarDelSaldo();
    await elegir('¿Con qué lo pagas?', 'Con plata');

    // La moneda vieja no volvió: se ve el monto en USD editable, no el par foráneo.
    expect(screen.queryByLabelText('Monto pagado (VES)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Equivalente en USD')).not.toBeInTheDocument();
    // …y vuelve a lo que falta de la factura ($50), no a cero.
    expect(screen.getByLabelText('Monto (USD)')).toHaveValue(50);
  });
});

describe('Abonar: el saldo a favor apaga lo que el contrato prohíbe', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
  });

  it('con plata se ven moneda, quién pagó y cuenta…', async () => {
    await abrirAbonar();
    expect(await screen.findByLabelText('Moneda')).toBeInTheDocument();
    expect(screen.getByLabelText('¿Quién lo pagó?')).toBeInTheDocument();
    expect(screen.getByLabelText('¿De qué cuenta salió?')).toBeInTheDocument();
  });

  it('…y al elegir «del saldo a favor» desaparecen las tres', async () => {
    await abrirAbonar();
    await tomarDelSaldo();
    expect(screen.queryByLabelText('Moneda')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('¿Quién lo pagó?')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('¿De qué cuenta salió?')).not.toBeInTheDocument();
  });
});

describe('Abonar: «¿se te devuelve?»', () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
  });

  it('no se pregunta si pagó la caja', async () => {
    await abrirAbonar();
    await screen.findByLabelText('¿Quién lo pagó?');
    expect(screen.queryByRole('checkbox', { name: /devuelve/i })).not.toBeInTheDocument();
  });

  it('…y aparece, marcado, cuando lo pagó una contraparte', async () => {
    await abrirAbonar();
    await elegir('¿Quién lo pagó?', /Evanan, de su bolsillo/);
    expect(screen.getByRole('checkbox', { name: /devuelve/i })).toBeChecked();
  });

  it('lo que el dueño decide viaja en el POST', async () => {
    await abrirAbonar();
    await elegir('¿Quién lo pagó?', /Evanan, de su bolsillo/);
    fireEvent.click(screen.getByRole('checkbox', { name: /devuelve/i }));
    guardar();

    await waitFor(() => expect(mocks.post).toHaveBeenCalled());
    expect(cuerpoDelPost().counterpartyId).toBe('c1');
    expect(cuerpoDelPost().refundable).toBe(false);
  });
});
