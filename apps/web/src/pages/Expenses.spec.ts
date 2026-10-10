import { describe, expect, it } from 'vitest';
import { TIPOS_DE_GASTO, filaDeGasto, tipoSeguro, totalesGastos } from '@/pages/Expenses';
import type { ExpenseRow } from '@/features/finance/api';

/**
 * Los tres totales de la pantalla Gastos, con los números a mano.
 *
 * Es el PRIMER test de `apps/web`: hasta el 2026-10-10 este paquete no tenía
 * runner y por eso toda lógica que hiciera falta probar se mudaba a
 * `packages/shared`, aunque no tuviera nada que ver con el motor de cálculo.
 */
describe('totalesGastos', () => {
  it('suma todo y separa la inversión, que está DENTRO del total', () => {
    const t = totalesGastos([
      { amount: 100, isInvestment: false },
      { amount: 250.5, isInvestment: true },
      { amount: 20.25, isInvestment: false },
    ]);
    expect(t.total).toBeCloseTo(370.75, 10);
    expect(t.inversion).toBeCloseTo(250.5, 10);
    // Operativo = total − inversión. No es "el total de los no-inversión"
    // calculado aparte: si lo fuera, los tres números podrían no cerrar.
    expect(t.operativo).toBeCloseTo(120.25, 10);
    expect(t.inversion + t.operativo).toBeCloseTo(t.total, 10);
  });

  it('sin filas da tres ceros, no NaN', () => {
    expect(totalesGastos([])).toEqual({ total: 0, inversion: 0, operativo: 0 });
  });

  it('todo de inversión deja el operativo en 0', () => {
    const t = totalesGastos([
      { amount: 400, isInvestment: true },
      { amount: 1132, isInvestment: true },
    ]);
    expect(t.total).toBe(1532);
    expect(t.inversion).toBe(1532);
    expect(t.operativo).toBe(0);
  });

  it('nada de inversión deja el operativo igual al total', () => {
    const t = totalesGastos([
      { amount: 7.3, isInvestment: false },
      { amount: 12.7, isInvestment: false },
    ]);
    expect(t.total).toBeCloseTo(20, 10);
    expect(t.inversion).toBe(0);
    expect(t.operativo).toBeCloseTo(20, 10);
  });
});

/**
 * El valor "seguro" del filtro de tipo.
 *
 * ⚠️ Nace junto con la persistencia del filtro y no antes por una razón: hasta
 * el 2026-10-10 el tipo vivía en `useState` y arrancaba siempre en `'ALL'`, así
 * que un valor imposible no podía existir. **Persistido sí puede**: un
 * `localStorage` de una versión anterior (o editado a mano) deja guardado un
 * tipo que ya no está en la lista, y sin esta función la tabla se abre VACÍA
 * con el desplegable en blanco y nada que explique por qué.
 */
describe('tipoSeguro', () => {
  it('deja pasar un tipo que existe', () => {
    expect(tipoSeguro('material')).toBe('material');
    expect(tipoSeguro('owner')).toBe('owner');
    expect(tipoSeguro('general')).toBe('general');
  });

  it('deja pasar "ALL", que es el centinela de "todos"', () => {
    // No está en TIPOS_DE_GASTO (es la opción fija del desplegable), así que
    // una comprobación que solo mirara la lista lo tiraría a "todos" igual…
    // pero por el camino equivocado. Acá se fija que vale por derecho propio.
    expect(tipoSeguro('ALL')).toBe('ALL');
  });

  it('un tipo que ya no existe cae a "todos"', () => {
    // El caso real: una opción renombrada o retirada que quedó en localStorage.
    expect(tipoSeguro('packaging')).toBe('ALL');
    expect(tipoSeguro('filamento')).toBe('ALL');
  });

  it('basura y vacío caen a "todos"', () => {
    expect(tipoSeguro('')).toBe('ALL');
    expect(tipoSeguro('{}')).toBe('ALL');
    expect(tipoSeguro('MATERIAL')).toBe('ALL'); // distingue mayúsculas a propósito
  });

  it('cubre TODA la lista: ningún tipo del desplegable queda afuera', () => {
    // Si alguien agrega una opción al desplegable y se olvida de la función,
    // este test la caza: elegir ese tipo dejaría la tabla vacía.
    for (const t of TIPOS_DE_GASTO) expect(tipoSeguro(t.value)).toBe(t.value);
  });
});

/**
 * La fila resuelta que leen LAS DOS presentaciones (tabla desde `md`, tarjetas
 * en el teléfono).
 *
 * ⚠️ Lo que estos tests protegen no es el markup: es que haya **una sola**
 * resolución. Con dos árboles escritos a mano, el día que cambie una columna se
 * arregla una y se olvida la otra — y acá lo que se olvidaría es justo lo que
 * cuida la plata: la fila que nació de una factura no se borra ni se le cambia
 * el pagador.
 */
describe('filaDeGasto', () => {
  const money = (n: number) => `$${n.toFixed(2)}`;
  const base: ExpenseRow = {
    id: 'g1',
    // Fecha de negocio: se guarda a medianoche UTC y YA es el día que el dueño
    // eligió, así que se corta el texto. Pasarla por una conversión local la
    // correría un día para atrás.
    date: '2026-10-09T00:00:00.000Z',
    category: 'OTHER',
    counterparty: null,
    description: 'Cinta de embalaje',
    amount: 12.5,
    isInvestment: false,
  };

  it('resuelve una fila suelta: categoría, guion en cantidad y proveedor vacío', () => {
    const f = filaDeGasto(base, money);
    expect(f.id).toBe('g1');
    expect(f.dia).toBe('2026-10-09');
    expect(f.etiqueta).toBe('Otro');
    expect(f.recurso).toBeNull();
    expect(f.destacada).toBe(false);
    expect(f.cantidad).toBeNull();
    expect(f.proveedor).toBeNull();
    expect(f.monto).toBe('$12.50');
    expect(f.duracion).toBeNull();
    expect(f.deFactura).toBe(false);
    expect(f.pagadorId).toBe('');
  });

  it('el recurso enlazado gana sobre la categoría y destaca la fila', () => {
    const f = filaDeGasto(
      {
        ...base,
        category: 'CONSUMABLE',
        material: { id: 'm1', name: 'PLA Negro' },
        quantity: 2,
        provider: { id: 'p1', name: 'Filaven' },
      },
      money,
    );
    expect(f.etiqueta).toBe('Filamento');
    expect(f.recurso).toBe('PLA Negro');
    expect(f.destacada).toBe(true);
    expect(f.cantidad).toBe('2');
    expect(f.proveedor).toBe('Filaven');
  });

  it('un gasto de inversión sin recurso se etiqueta "Inversión", no por su categoría', () => {
    const f = filaDeGasto({ ...base, category: 'EQUIPMENT', isInvestment: true }, money);
    expect(f.etiqueta).toBe('Inversión');
    expect(f.destacada).toBe(true);
  });

  it('una cantidad de 0 es un DATO, no una ausencia', () => {
    // `quantity != null` está bien; `quantity ||` convertiría el 0 en ausencia y
    // una compra de 0 rollos dejaría de verse (en la tabla saldría un guion, y
    // en la tarjeta ni la línea).
    expect(filaDeGasto({ ...base, quantity: 0 }, money).cantidad).toBe('0');
  });

  it('la duración sale armada solo cuando hay fin de período válido', () => {
    expect(filaDeGasto({ ...base, endDate: '2026-10-11T00:00:00.000Z' }, money).duracion).toBe(
      '· duró 3 días',
    );
    // Un fin ANTERIOR al inicio no es una duración: no se dibuja nada.
    expect(filaDeGasto({ ...base, endDate: '2026-10-01T00:00:00.000Z' }, money).duracion).toBeNull();
  });

  it('la fila de factura se marca, y el pagador viaja con su id', () => {
    const f = filaDeGasto(
      {
        ...base,
        purchaseInvoiceLineId: 'l1',
        counterparty: { id: 'c1', name: 'Propietario', kind: 'OWNER' },
      },
      money,
    );
    expect(f.deFactura).toBe(true);
    expect(f.pagadorId).toBe('c1');
  });
});
