import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/overlays';
import type { ExpenseRow } from '@/features/finance/api';

/**
 * LA FILA QUE NACIÓ DE UNA FACTURA NO SE TOCA DESDE GASTOS.
 *
 * Es el PRIMER test de componente de `apps/web` (2026-10-10). Hasta hoy el
 * paquete corría vitest en entorno `node`, sin jsdom ni testing-library, así
 * que una regla que vive en el renderizado —un botón que no se dibuja, un
 * desplegable apagado— **solo se podía comprobar mirándola**. Y la regla que se
 * estaba mirando a ojo es justamente de dinero: el monto y la cantidad de esa
 * fila son el espejo de una línea de factura ya recibida, la API rechaza
 * corregirla o borrarla con un 400, y ofrecer el control de todas formas deja
 * al dueño apretando un tacho que solo sabe fallar.
 *
 * ⚠️ **Se comprueba sobre las DOS presentaciones a la vez.** La pantalla dibuja
 * la tabla (desde `md`) y las tarjetas (en el teléfono) al mismo tiempo, y en
 * jsdom no hay CSS: `hidden md:block` no esconde nada, así que cada control
 * aparece DOS veces. Lejos de ser un estorbo, es la mitad del valor de este
 * test: el riesgo real documentado en esta pantalla es arreglar una
 * presentación y olvidarse de la otra, así que los conteos son exactos (2 y 0),
 * no `toBeTruthy()`.
 */

// `vi.hoisted` y no un `const` suelto: la factoría de `vi.mock` se evalúa al
// importar el módulo mockeado, que pasa ANTES del cuerpo de este archivo.
const mocks = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), del: vi.fn(), post: vi.fn() }));

/**
 * Se mockea `@/lib/api` —el cliente axios— y NADA más: los hooks de React
 * Query, los componentes y la resolución de cada fila son los de verdad. Con
 * los hooks mockeados el test pasaría aunque `filaDeGasto` mintiera.
 */
vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, patch: mocks.patch, delete: mocks.del, post: mocks.post },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { ExpensesPage } = await import('@/pages/Expenses');

/** Un gasto cargado a mano: se corrige y se borra desde acá. */
const A_MANO: ExpenseRow = {
  id: 'g1',
  date: '2026-10-09T00:00:00.000Z',
  category: 'OTHER',
  counterparty: null,
  description: 'Cinta de embalaje',
  amount: 12.5,
  isInvestment: false,
};

/** El mismo gasto, pero nacido de una línea de factura de Compras. */
const DE_FACTURA: ExpenseRow = {
  id: 'g2',
  date: '2026-10-09T00:00:00.000Z',
  category: 'CONSUMABLE',
  counterparty: null,
  description: 'PLA Negro de la factura 0012',
  amount: 60,
  isInvestment: false,
  quantity: 3,
  purchaseInvoiceLineId: 'l1',
  // Enlazada a su ficha de filamento, como nace una línea de factura real. Sirve
  // además para distinguirla del otro gasto al probar el filtro de tipo.
  material: { id: 'm1', name: 'PLA Negro' },
};

/**
 * UNA INVERSIÓN SIN FICHA ENLAZADA: el caso exacto del gasto que aparecía en
 * DOS filtros a la vez ("General" e "Inversión") hasta el 2026-10-10.
 */
const INVERSION: ExpenseRow = {
  id: 'g3',
  date: '2026-10-09T00:00:00.000Z',
  category: 'EQUIPMENT',
  counterparty: null,
  description: 'Impresora A1 mini',
  amount: 240,
  isInvestment: true,
};

const CONTRAPARTES = [
  { id: 'c1', name: 'Propietario', kind: 'OWNER', isDefault: true, active: true, notes: null },
];

function montar() {
  mocks.get.mockImplementation((url: string) => {
    if (url === '/expenses') return Promise.resolve({ data: [A_MANO, DE_FACTURA, INVERSION] });
    if (url === '/counterparties') return Promise.resolve({ data: CONTRAPARTES });
    // El resto de lo que consulta la pantalla (ajustes, tasas) no cambia nada
    // de lo que se mide acá: sin ajustes, `useMoney` cae a USD/en-US. Va `null`
    // y no `undefined` porque React Query rechaza `undefined` como dato de una
    // consulta y lo grita por stderr en cada test.
    return Promise.resolve({ data: null });
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      {/* El mismo provider que monta `AppLayout`: los tachos son icon-only y su
          nombre accesible sale del `Tooltip`. */}
      <TooltipProvider>
        <ExpensesPage />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

/** Espera a que la lista esté dibujada (las dos filas, en sus dos formas). */
async function esperarLaLista() {
  await screen.findAllByText('Cinta de embalaje');
}

describe('Gastos: la fila de factura', () => {
  beforeEach(() => {
    // Los dos filtros de la pantalla se PERSISTEN: sin limpiar, un tipo elegido
    // en un test anterior dejaría la lista vacía en el siguiente y los
    // `queryAllBy...` darían 0 por el motivo equivocado.
    localStorage.clear();
    mocks.get.mockReset();
  });

  it('NO lleva botón de borrar, y la cargada a mano sí', async () => {
    montar();
    await esperarLaLista();

    // Dos, una por presentación: si alguna vez se quita el tacho de la tabla y
    // se olvida la tarjeta (o al revés), este número baja a 1 y el test cae.
    expect(screen.getAllByLabelText('Eliminar el gasto: Cinta de embalaje')).toHaveLength(2);
    expect(
      screen.queryAllByLabelText('Eliminar el gasto: PLA Negro de la factura 0012'),
    ).toHaveLength(0);
  });

  it('lleva el selector de "quién pagó" DESHABILITADO, y la cargada a mano habilitado', async () => {
    montar();
    await esperarLaLista();

    const deFactura = screen.getAllByLabelText('Quién pagó: PLA Negro de la factura 0012');
    expect(deFactura).toHaveLength(2);
    for (const control of deFactura) expect(control).toBeDisabled();

    const aMano = screen.getAllByLabelText('Quién pagó: Cinta de embalaje');
    expect(aMano).toHaveLength(2);
    for (const control of aMano) expect(control).toBeEnabled();
  });

  it('se marca "de factura" para que se entienda por qué no se puede tocar', async () => {
    montar();
    await esperarLaLista();

    // Sin esta marca, una fila sin tacho y con el pagador apagado se lee como
    // un error de la pantalla en vez de como una regla.
    expect(screen.getAllByText('de factura')).toHaveLength(2);
  });

  it('dibuja las dos filas con su monto, así el conteo de arriba no sale de una lista vacía', async () => {
    montar();
    await esperarLaLista();

    expect(screen.getAllByText('$12.50')).toHaveLength(2);
    expect(screen.getAllByText('$60.00')).toHaveLength(2);
  });
});

/**
 * EL FILTRO DE TIPO GUARDADO SE APLICA.
 *
 * ⚠️ Este test existe porque una mutación lo pidió: con `pasaTipo` ya testeada
 * rama por rama, cambiar la llamada de la pantalla a `pasaTipo(TODOS, e)` —o
 * sea, dejar de filtrar— **no tumbaba ni un test**. Las nueve ramas probadas no
 * dicen nada si nadie las llama con el valor correcto, y un filtro que no
 * filtra se nota mirando la pantalla, que es justo lo que se quería dejar de
 * hacer.
 */
describe('Gastos: el filtro de tipo', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.get.mockReset();
  });

  it('con "Filamentos" guardado deja solo el gasto del filamento', async () => {
    // El filtro se PERSISTE, así que al montar la pantalla ya viene puesto: es
    // el caso real de volver a Gastos con un filtro de la visita anterior.
    localStorage.setItem('expenses:tipo', JSON.stringify('material'));

    montar();
    await screen.findAllByText('PLA Negro de la factura 0012');

    expect(screen.queryAllByText('Cinta de embalaje')).toHaveLength(0);
    // Y se dice qué quedó afuera: los totales de arriba suman LO QUE SE VE.
    expect(screen.getByText(/Se ven 1 de 3 gasto\(s\) del periodo/)).toBeInTheDocument();
  });

  /**
   * ⚠️ **"General" ya no incluye la inversión** (2026-10-10, decisión del
   * dueño): es *lo que no es filamento, ni impresora, ni inversión*.
   *
   * Va acá y no solo en el spec de `pasaTipo` por la misma razón que el test de
   * arriba: nueve ramas testeadas no prueban que la pantalla las llame bien. Y
   * lo que el dueño va a mirar no es una función, es que la impresora deje de
   * salir en dos filtros — con el total de "lo que se ve" acompañando.
   */
  it('con "General" guardado esconde la inversión y deja el gasto suelto', async () => {
    localStorage.setItem('expenses:tipo', JSON.stringify('general'));

    montar();
    await screen.findAllByText('Cinta de embalaje');

    expect(screen.queryAllByText('Impresora A1 mini')).toHaveLength(0);
    expect(screen.queryAllByText('PLA Negro de la factura 0012')).toHaveLength(0);
    expect(screen.getByText(/Se ven 1 de 3 gasto\(s\) del periodo/)).toBeInTheDocument();
  });

  it('con "Inversión" guardado deja SOLO la inversión: el gasto suelto no se cuela', async () => {
    localStorage.setItem('expenses:tipo', JSON.stringify('investment'));

    montar();
    await screen.findAllByText('Impresora A1 mini');

    expect(screen.queryAllByText('Cinta de embalaje')).toHaveLength(0);
    expect(screen.getByText(/Se ven 1 de 3 gasto\(s\) del periodo/)).toBeInTheDocument();
  });
});
