import { describe, expect, it } from 'vitest';
import {
  TIPOS_DE_GASTO,
  TODOS,
  filaDeGasto,
  pasaTipo,
  tipoSeguro,
  totalesGastos,
} from '@/features/finance/expenses-view';
import type { ExpenseRow } from '@/features/finance/api';

/**
 * Los tres totales de la pantalla Gastos, con los números a mano.
 *
 * Es el PRIMER test de `apps/web`: hasta el 2026-10-10 este paquete no tenía
 * runner y por eso toda lógica que hiciera falta probar se mudaba a
 * `packages/shared`, aunque no tuviera nada que ver con el motor de cálculo.
 *
 * ⚠️ Nació importando estas funciones DESDE la pantalla (`pages/Expenses.tsx`),
 * lo que arrastraba React, React Query y axios para probar una suma: un import
 * roto en cualquier rincón de esa pantalla tumbaba el test de una función
 * intacta. Hoy viven en `features/finance/expenses-view.ts` y el spec se mudó
 * con ellas.
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

/**
 * EL FILTRO DE TIPO, rama por rama.
 *
 * Vivía como un closure de 9 ramas dentro del componente (`matchesType`) y por
 * eso **no tenía ningún test**: las nueve se comprobaban eligiendo cada opción
 * del desplegable a mano. Cerraba sobre `typeFilter` y nada más, así que salió
 * tal cual, sin cambiarle una línea.
 *
 * ⚠️ Lo que cuida es que un gasto no se ESCONDA: un filtro que devuelve `false`
 * de más no da error, deja la tabla sin esa fila y los tres totales de arriba
 * —que suman LO QUE SE VE— mostrando menos dinero del que salió.
 */
describe('pasaTipo', () => {
  const base: ExpenseRow = {
    id: 'g1',
    date: '2026-10-09T00:00:00.000Z',
    category: 'OTHER',
    counterparty: null,
    description: 'Cinta de embalaje',
    amount: 12.5,
    isInvestment: false,
  };

  it('"todos" deja pasar cualquier gasto', () => {
    expect(pasaTipo(TODOS, base)).toBe(true);
    expect(pasaTipo(TODOS, { ...base, isInvestment: true })).toBe(true);
  });

  it('los tres tipos de recurso miran el recurso ENLAZADO, no la categoría', () => {
    const conMaterial = { ...base, material: { id: 'm1', name: 'PLA Negro' } };
    const conImpresora = { ...base, printer: { id: 'p1', name: 'Ender 3' } };
    const conInsumo = { ...base, component: { id: 'i1', name: 'Imán' } };

    expect(pasaTipo('material', conMaterial)).toBe(true);
    expect(pasaTipo('material', conImpresora)).toBe(false);
    expect(pasaTipo('printer', conImpresora)).toBe(true);
    expect(pasaTipo('printer', conMaterial)).toBe(false);
    expect(pasaTipo('component', conInsumo)).toBe(true);
    expect(pasaTipo('component', conMaterial)).toBe(false);
    // Un gasto suelto no es de ninguno de los tres.
    expect(pasaTipo('material', base)).toBe(false);
    expect(pasaTipo('printer', base)).toBe(false);
    expect(pasaTipo('component', base)).toBe(false);
  });

  it('los tres tipos de categoría miran la categoría', () => {
    expect(pasaTipo('maintenance', { ...base, category: 'MAINTENANCE' })).toBe(true);
    expect(pasaTipo('advertising', { ...base, category: 'ADVERTISING' })).toBe(true);
    expect(pasaTipo('design', { ...base, category: 'DESIGN' })).toBe(true);
    // Y no se confunden entre ellos.
    expect(pasaTipo('maintenance', { ...base, category: 'ADVERTISING' })).toBe(false);
    expect(pasaTipo('advertising', { ...base, category: 'DESIGN' })).toBe(false);
    expect(pasaTipo('design', { ...base, category: 'MAINTENANCE' })).toBe(false);
  });

  it('"los puso una persona" es tener contraparte, que es lo que genera deuda', () => {
    const puestoPorAlguien = {
      ...base,
      counterparty: { id: 'c1', name: 'Propietario', kind: 'OWNER' as const },
    };
    expect(pasaTipo('owner', puestoPorAlguien)).toBe(true);
    // `counterparty: null` = lo pagó la caja del negocio y no se le debe a nadie.
    expect(pasaTipo('owner', base)).toBe(false);
  });

  it('"inversión" es la marca del gasto, no su categoría', () => {
    expect(pasaTipo('investment', { ...base, isInvestment: true })).toBe(true);
    // Categoría de equipo SIN marcar como inversión: no entra. Son dos campos
    // distintos y el que manda en los totales es `isInvestment`.
    expect(pasaTipo('investment', { ...base, category: 'EQUIPMENT' })).toBe(false);
  });

  it('"general" es el resto: ni recurso enlazado ni una de las tres categorías', () => {
    expect(pasaTipo('general', base)).toBe(true);
    expect(pasaTipo('general', { ...base, category: 'SHIPPING' })).toBe(true);
    expect(pasaTipo('general', { ...base, category: 'CONSUMABLE' })).toBe(true);
    expect(pasaTipo('general', { ...base, material: { id: 'm1', name: 'PLA' } })).toBe(false);
    expect(pasaTipo('general', { ...base, printer: { id: 'p1', name: 'Ender' } })).toBe(false);
    expect(pasaTipo('general', { ...base, component: { id: 'i1', name: 'Imán' } })).toBe(false);
    expect(pasaTipo('general', { ...base, category: 'MAINTENANCE' })).toBe(false);
    expect(pasaTipo('general', { ...base, category: 'ADVERTISING' })).toBe(false);
    expect(pasaTipo('general', { ...base, category: 'DESIGN' })).toBe(false);
  });

  it('⚠️ "general" NO excluye inversión, y eso es a propósito', () => {
    // Un equipo marcado como inversión y sin impresora enlazada sale también en
    // "General". Se deja tal cual porque es el comportamiento que hay hoy: la
    // mudanza no cambia lo que la pantalla hace. Queda escrito acá para que, si
    // algún día se decide que no, se vea que se está cambiando una regla.
    expect(pasaTipo('general', { ...base, category: 'EQUIPMENT', isInvestment: true })).toBe(true);
  });

  it('un tipo que no existe deja pasar todo, nunca esconde la lista', () => {
    // Por la pantalla no llega acá (el valor pasa antes por `tipoSeguro`), pero
    // el respaldo es "mostrar", no "ocultar": una lista vacía sin explicación es
    // el peor resultado posible de un filtro.
    expect(pasaTipo('packaging', base)).toBe(true);
    expect(pasaTipo('', base)).toBe(true);
  });

  it('cubre TODA la lista: cada tipo del desplegable tiene su rama', () => {
    // Si alguien agrega una opción al desplegable y se olvida de `pasaTipo`,
    // ese tipo caería en el respaldo y el filtro no filtraría nada. Se detecta
    // pidiendo que exista AL MENOS un gasto que la rama rechace.
    const candidatos: ExpenseRow[] = [
      base,
      { ...base, material: { id: 'm1', name: 'PLA' } },
      { ...base, printer: { id: 'p1', name: 'Ender' } },
      { ...base, component: { id: 'i1', name: 'Imán' } },
      { ...base, category: 'MAINTENANCE' },
      { ...base, category: 'ADVERTISING' },
      { ...base, category: 'DESIGN' },
      { ...base, isInvestment: true },
      { ...base, counterparty: { id: 'c1', name: 'Propietario', kind: 'OWNER' as const } },
    ];
    for (const t of TIPOS_DE_GASTO) {
      expect(candidatos.some((e) => !pasaTipo(t.value, e))).toBe(true);
    }
  });
});
