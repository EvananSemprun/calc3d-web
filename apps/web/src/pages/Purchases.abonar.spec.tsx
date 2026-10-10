import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';
import type { PurchaseInvoice } from '@/features/purchases/api';

/**
 * EL AVISO DEL SALDO QUE SALTA DE UNA FACTURA A LA OTRA.
 *
 * `avisoDeAbono` ya está probada caso por caso en
 * `features/purchases/aviso-de-abono.spec.ts`. Este archivo prueba **el
 * cableado**, que es otra cosa: que el diálogo la llame con los números
 * correctos —lo tomado, lo que falta de ESTA factura y lo disponible en la de
 * origen—, que dibuje lo que devuelve y que **no apague el botón**.
 *
 * ⚠️ La diferencia no es teórica en este repo: con `pasaTipo` probada rama por
 * rama, cambiar la llamada de la pantalla de Gastos a "no filtrar" no tumbaba
 * ni un test. Una función pura sin su test de cableado prueba la mitad.
 *
 * ⚠️ Y acá hay una razón más: el default del formulario propone el mínimo, así
 * que este aviso **solo aparece si el monto se sube a mano**. Es el camino que
 * no se recorre mirando la pantalla por casualidad.
 */

/**
 * Lo que jsdom no trae y Radix usa al abrir un `Select`.
 *
 * Va acá y NO en `src/test/setup-dom.ts` a propósito: ese archivo lo cargan
 * todos los specs de componente y es el único que necesita abrir un
 * desplegable. Un doble global que solo hace falta en un archivo esconde que
 * este test depende de él.
 */
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() }));

// Se mockea el cliente axios y NADA más: los hooks, los componentes de marca
// (el `Select` de Radix incluido) y `avisoDeAbono` son los de verdad.
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
  nuevoTipo: null,
  quantity: cantidad,
  unitPrice: precio,
  received: cantidad,
  porRecibir: 0,
  recepciones: [],
});

/**
 * LA FACTURA PAGADA DE MÁS: costó $85, se pagaron $100, quedan $15 a favor.
 * Es la que presta el saldo.
 */
const F_ORIGEN: PurchaseInvoice = {
  id: 'f1',
  date: '2026-10-05T00:00:00.000Z',
  expectedAt: null,
  reference: 'FAC-0001',
  notes: null,
  supplier: PROVEEDOR,
  voidedAt: null,
  voidReason: null,
  source: 'MANUAL',
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
    },
  ],
  total: 85,
  pagado: 100,
  saldo: 0,
  aFavor: 15,
  aFavorDisponible: 15,
  pedido: 5,
  recibido: 5,
  porRecibir: 0,
  status: { pago: 'PAGADA_DE_MAS', mercaderia: 'RECIBIDA' },
};

/** LA FACTURA CHICA: se deben $5. Es la que se abona con el saldo de arriba. */
const F_DESTINO: PurchaseInvoice = {
  id: 'f2',
  date: '2026-10-08T00:00:00.000Z',
  expectedAt: null,
  reference: 'FAC-0002',
  notes: null,
  supplier: PROVEEDOR,
  voidedAt: null,
  voidReason: null,
  source: 'MANUAL',
  lines: [linea('l2', 1, 5)],
  payments: [],
  total: 5,
  pagado: 0,
  saldo: 5,
  aFavor: 0,
  aFavorDisponible: 0,
  pedido: 1,
  recibido: 1,
  porRecibir: 0,
  status: { pago: 'SIN_PAGAR', mercaderia: 'RECIBIDA' },
};

/**
 * UNA FACTURA YA PAGA, del mismo proveedor. Se llega a abonarla desde su propia
 * tarjeta —el cartel del saldo a favor invita a usarlo— y ahí el formulario
 * propone lo disponible, así que el aviso aparece **sin que nadie escriba
 * nada**: el saldo tomado salta entero a esta factura.
 */
const F_PAGA: PurchaseInvoice = {
  id: 'f3',
  date: '2026-10-09T00:00:00.000Z',
  expectedAt: null,
  reference: 'FAC-0003',
  notes: null,
  supplier: PROVEEDOR,
  voidedAt: null,
  voidReason: null,
  source: 'MANUAL',
  lines: [linea('l3', 1, 10)],
  payments: [
    {
      id: 'p3',
      date: '2026-10-09T00:00:00.000Z',
      amount: 10,
      counterpartyId: null,
      counterparty: null,
      accountId: null,
      note: null,
      tomadoDeFacturaId: null,
      voidedAt: null,
      voidReason: null,
    },
  ],
  total: 10,
  pagado: 10,
  saldo: 0,
  aFavor: 0,
  aFavorDisponible: 0,
  pedido: 1,
  recibido: 1,
  porRecibir: 0,
  status: { pago: 'PAGADA', mercaderia: 'RECIBIDA' },
};

function montar() {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/purchase-invoices')
      return Promise.resolve({ data: [F_DESTINO, F_ORIGEN, F_PAGA] });
    // Listas que la pantalla recorre: tienen que ser arrays, no `null`.
    if (url === '/counterparties' || url === '/clients') return Promise.resolve({ data: [] });
    if (url === '/materials' || url === '/printers') return Promise.resolve({ data: [] });
    // El resto (ajustes, tasas) no cambia nada de lo que se mide: sin ajustes
    // `useMoney` cae a USD/en-US. `null` y no `undefined`, que React Query
    // rechaza como dato de una consulta.
    return Promise.resolve({ data: null });
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    // La pantalla lee el estado de la navegación (por ahí le llega la
    // propuesta de "Armar pedido con lo que falta") y navega para limpiarlo,
    // así que sin Router no monta.
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <PurchasesPage />
        </TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

/** Abre el diálogo "Abonar" de la factura que diga esa referencia. */
async function abrirAbonar(ref = 'FAC-0002') {
  montar();
  const referencia = await screen.findByText(new RegExp(ref));
  const tarjeta = referencia.closest('li');
  if (!tarjeta) throw new Error('la tarjeta de la factura no se dibujó');
  // Las dos facturas tienen un botón "Abonar" y el nombre no las distingue:
  // se busca DENTRO de la tarjeta de la que interesa.
  fireEvent.click(within(tarjeta).getByRole('button', { name: 'Abonar' }));
  return screen.getByText('Abonar a la factura');
}

/**
 * Elige "del saldo a favor" en el desplegable.
 *
 * Se abre con el TECLADO (`ArrowDown` es una de las teclas de apertura de
 * Radix) y no con el puntero: por el camino del puntero, Radix guarda que el
 * tipo fue "mouse" y entonces el ítem se elige con `pointerup`, que jsdom no
 * sintetiza desde un `click`. Con el teclado, el `click` del ítem alcanza.
 */
function tomarDelSaldo() {
  fireEvent.keyDown(screen.getByLabelText('¿Con qué lo pagás?'), { key: 'ArrowDown' });
  fireEvent.click(screen.getByText(/^Del saldo a favor de la factura del/));
}

const monto = () => screen.getByLabelText('Monto (USD)');
const botonGuardar = () => screen.getByRole('button', { name: /Usar el saldo|Abonar$|Guardando/ });
/** El texto del cartel, con los espacios de JSX normalizados. */
const cartel = (re: RegExp) => screen.getByText(re).textContent?.replace(/\s+/g, ' ');

describe('Abonar: tomar del saldo a favor más de lo que la factura debe', () => {
  beforeEach(() => mocks.get.mockReset());

  it('el default no avisa nada: propone lo que falta, que es menos que el saldo', async () => {
    await abrirAbonar();
    tomarDelSaldo();

    // $5 de los $15 disponibles: el camino normal, y tiene que ser silencioso.
    // Un aviso que sale siempre entrena a no leerlos.
    expect(monto()).toHaveValue(5);
    expect(screen.queryByText(/quedan a favor en ESTA factura/)).not.toBeInTheDocument();
  });

  it('⚠️ subir el monto a mano DICE cuánto va a quedar a favor en esta factura', async () => {
    await abrirAbonar();
    tomarDelSaldo();
    fireEvent.change(monto(), { target: { value: '15' } });

    expect(cartel(/quedan a favor en ESTA factura/)).toBe(
      'Estás tomando $15.00 y a esta factura le faltan $5.00: los $10.00 de diferencia quedan a ' +
        'favor en ESTA factura. Se registra igual —no se pierde nada, el saldo pasa de una ' +
        'factura a la otra— pero vas a tener que volver a usarlo desde acá. Bajá el monto si no ' +
        'era eso lo que querías.',
    );
  });

  it('⚠️ NO es una guarda que corte: el botón sigue habilitado', async () => {
    // La operación es legítima —la plata ya salió cuando se pagó de más— y la
    // decisión del dueño fue "se puede seguir, pero con aviso". Apagar el botón
    // acá sería cambiarle la decisión.
    await abrirAbonar();
    tomarDelSaldo();
    fireEvent.change(monto(), { target: { value: '15' } });

    expect(screen.getByText(/quedan a favor en ESTA factura/)).toBeInTheDocument();
    expect(botonGuardar()).toBeEnabled();
  });

  it('pasarse de lo DISPONIBLE sí bloquea, y reemplaza al otro aviso', async () => {
    // $20 sobre $15 disponibles no existe: el servidor lo rechaza. Y gana sobre
    // el aviso del saldo que salta, porque hablar de lo que va a quedar a favor
    // sería hablar de una plata que no hay.
    await abrirAbonar();
    tomarDelSaldo();
    fireEvent.change(monto(), { target: { value: '20' } });

    expect(cartel(/de saldo a favor y estás usando/)).toBe(
      'Esa factura tiene $15.00 de saldo a favor y estás usando $20.00. Bajá el monto o abonalo ' +
        'con plata.',
    );
    expect(screen.queryByText(/quedan a favor en ESTA factura/)).not.toBeInTheDocument();
    expect(botonGuardar()).toBeDisabled();
  });

  it('en una factura YA PAGA el aviso sale SOLO, sin tocar el monto', async () => {
    // El formulario no tiene "lo que falta" para proponer, así que propone lo
    // disponible: el saldo entero salta a esta factura. Es el único camino en
    // el que el aviso aparece sin que nadie suba el monto a mano, y por eso
    // tiene su propia frase: "le faltan $0,00" se lee como un error.
    await abrirAbonar('FAC-0003');
    tomarDelSaldo();

    expect(monto()).toHaveValue(15);
    expect(cartel(/ya está paga/)).toBe(
      'Esta factura ya está paga, así que los $15.00 que tomes quedan enteros a favor en ELLA. ' +
        'Se registra igual —no se pierde nada, el saldo pasa de una factura a la otra— pero vas ' +
        'a tener que volver a usarlo desde acá. Bajá el monto si no era eso lo que querías.',
    );
    expect(botonGuardar()).toBeEnabled();
  });

  it('con plata, pasarse sigue avisando lo de siempre: queda pagada de más', async () => {
    // El tercer caso, sin tocar el desplegable. Está acá para que los tres
    // avisos se vean en un solo lugar: eran tres condiciones sueltas y una
    // combinación no caía en ninguna.
    await abrirAbonar();
    fireEvent.change(monto(), { target: { value: '9' } });

    expect(cartel(/más de lo que falta/)).toBe(
      'Estás abonando $4.00 más de lo que falta. Se registra igual —la plata salió— y queda ' +
        'marcado como pagado de más.',
    );
    expect(botonGuardar()).toBeEnabled();
  });
});
