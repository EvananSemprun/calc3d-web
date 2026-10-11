import { describe, expect, it } from 'vitest';
import {
  CASILLAS,
  TIPOS_DE_GASTO,
  TODOS,
  etiquetasDeFiltro,
  filaDeGasto,
  pasaCasillas,
  pasaTipo,
  tipoSeguro,
  totalesGastos,
  type Casillas,
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
    expect(tipoSeguro('printer')).toBe('printer');
    expect(tipoSeguro('general')).toBe('general');
  });

  /**
   * ⚠️ **EL CASO REAL DE HOY**, y no una hipótesis: hasta esta misma mañana
   * `'investment'` y `'owner'` eran opciones del desplegable, así que hay
   * `localStorage` con esos dos valores guardados. Al salir de la lista (pasaron
   * a ser casillas) un panel sin esta función abriría la tabla **vacía, con el
   * desplegable en blanco y sin nada que explique por qué** — justo el bug que
   * `tipoSeguro` existe para evitar. No alcanza con suponerlo: se fija acá y en
   * la pantalla (`Expenses.pantalla.spec.tsx`), porque lo que importa es que el
   * CABLEADO caiga a "todos", no que la función sepa hacerlo.
   */
  it('los DOS ejes que salieron de la lista caen a "todos"', () => {
    expect(tipoSeguro('investment')).toBe('ALL');
    expect(tipoSeguro('owner')).toBe('ALL');
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

  it('⚠️ "general" INCLUYE la inversión que no es ni equipo ni filamento ni insumo', () => {
    // ⚠️ **Este test afirmó las DOS cosas, y las dos veces a propósito. La
    // tercera versión es esta, y el porqué de cada vuelta importa más que el
    // valor esperado:**
    //
    // 1. **Hasta el 2026-10-10** decía que una inversión también salía en
    //    "General". Fijaba el comportamiento de entonces para que la mudanza de
    //    `matchesType` a este archivo no cambiara nada sin que se viera.
    // 2. **Esa mañana** pasó a EXCLUIRLA, por decisión del dueño: con
    //    `investment` como una de las nueve opciones del desplegable, una
    //    impresora marcada como inversión y sin ficha enlazada salía en
    //    "General" **y** en "Inversión" a la vez, las partes sumaban más que el
    //    total y ninguna etiqueta significaba lo que decía.
    // 3. **Esa tarde** —hoy— `investment` y `owner` SALIERON de la lista: el
    //    desplegable mezclaba tres ejes (qué compraste / de qué clase es / cómo
    //    se cuenta y quién pagó) y ahora los dos transversales son casillas
    //    combinables. Con siete tipos mutuamente excluyentes, la exclusión de
    //    la vuelta 2 dejaría un **agujero**: una inversión que no es impresora,
    //    ni filamento, ni insumo —una herramienta, un mueble— no caería en
    //    NINGÚN tipo, y las partes volverían a no sumar el total, ahora por el
    //    otro lado. La decisión anterior era correcta para nueve opciones; en
    //    siete, estorba.
    //
    // La superposición que motivó la vuelta 2 ya no existe por construcción:
    // "Solo inversión" no es un tipo, es un recorte que se aplica ADEMÁS del
    // tipo (ver `pasaCasillas`).
    expect(pasaTipo('general', { ...base, category: 'EQUIPMENT', isInvestment: true })).toBe(true);
    expect(pasaTipo('general', { ...base, isInvestment: true })).toBe(true);
    // Y lo que SÍ sigue sacando de "General" es el recurso enlazado: una
    // inversión con su ficha de impresora es "Impresoras", no "General".
    expect(
      pasaTipo('general', { ...base, isInvestment: true, printer: { id: 'p1', name: 'Ender' } }),
    ).toBe(false);
  });

  it('un tipo que no existe deja pasar todo, nunca esconde la lista', () => {
    // Por la pantalla no llega acá (el valor pasa antes por `tipoSeguro`), pero
    // el respaldo es "mostrar", no "ocultar": una lista vacía sin explicación es
    // el peor resultado posible de un filtro.
    expect(pasaTipo('packaging', base)).toBe(true);
    expect(pasaTipo('', base)).toBe(true);
    // Los dos que salieron de la lista hoy entran por acá: ya no son tipos, son
    // casillas. Un guardado viejo cae antes en `tipoSeguro`, que lo manda a
    // `TODOS`; si igual llegara, el respaldo muestra todo en vez de vaciar.
    expect(pasaTipo('investment', base)).toBe(true);
    expect(pasaTipo('owner', base)).toBe(true);
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

/**
 * LAS DOS CASILLAS TRANSVERSALES.
 *
 * ⚠️ **No son tipos y por eso no están en el desplegable** (decisión del dueño,
 * 2026-10-11). `investment` es *cómo se cuenta* el gasto (lo que el negocio
 * devuelve) y `owner` es *quién lo pagó*: los dos cruzan con los siete tipos,
 * así que mezclados en la misma lista una impresora que puso el dueño salía en
 * tres filtros a la vez y las partes no sumaban el total — y el total es un
 * número de plata.
 *
 * Como son RECORTES y no tipos, se combinan entre sí y con el tipo (es un Y, no
 * un O): "filamentos que puso Evanan" era imposible con un solo desplegable.
 */
describe('pasaCasillas', () => {
  const base: ExpenseRow = {
    id: 'g1',
    date: '2026-10-09T00:00:00.000Z',
    category: 'OTHER',
    counterparty: null,
    description: 'Cinta de embalaje',
    amount: 12.5,
    isInvestment: false,
  };
  const DUENO = { id: 'c1', name: 'Propietario', kind: 'OWNER' as const };
  const inversion = { ...base, isInvestment: true };
  const puestoPorAlguien = { ...base, counterparty: DUENO };
  const inversionDeAlguien = { ...base, isInvestment: true, counterparty: DUENO };
  const NINGUNA = { soloInversion: false, soloPersona: false };

  it('sin ninguna marcada no esconde NADA: el gasto suelto también pasa', () => {
    // ⚠️ La razón de ser del caso: desmarcadas, las casillas no son un filtro.
    // Si este caso devolviera `false` para algo, la pantalla abriría con filas
    // escondidas sin que nadie haya filtrado — y los tres totales de arriba,
    // que suman LO QUE SE VE, dirían menos dinero del que salió.
    expect(pasaCasillas(NINGUNA, base)).toBe(true);
    expect(pasaCasillas(NINGUNA, inversion)).toBe(true);
    expect(pasaCasillas(NINGUNA, puestoPorAlguien)).toBe(true);
  });

  it('"Solo inversión" mira la MARCA del gasto, no su categoría', () => {
    const soloInv = { soloInversion: true, soloPersona: false };
    expect(pasaCasillas(soloInv, inversion)).toBe(true);
    expect(pasaCasillas(soloInv, base)).toBe(false);
    // Categoría de equipo SIN marcar como inversión: no entra. Son dos campos
    // distintos y el que manda en los totales es `isInvestment`.
    expect(pasaCasillas(soloInv, { ...base, category: 'EQUIPMENT' })).toBe(false);
  });

  it('"Solo lo que puso una persona" es tener contraparte, que es lo que genera deuda', () => {
    const soloPers = { soloInversion: false, soloPersona: true };
    expect(pasaCasillas(soloPers, puestoPorAlguien)).toBe(true);
    // `counterparty: null` = lo pagó la caja del negocio y no se le debe a nadie.
    expect(pasaCasillas(soloPers, base)).toBe(false);
    expect(pasaCasillas(soloPers, inversion)).toBe(false);
  });

  it('⚠️ LAS DOS SE COMBINAN, y es un Y: la inversión que puso una persona', () => {
    // Es la pregunta que no se podía hacer con un solo desplegable de nueve
    // opciones. Con un O, los tres primeros casos pasarían y la respuesta sería
    // "todo lo que es inversión O lo puso alguien", que no es lo que se pidió.
    const ambas = { soloInversion: true, soloPersona: true };
    expect(pasaCasillas(ambas, inversionDeAlguien)).toBe(true);
    expect(pasaCasillas(ambas, inversion)).toBe(false);
    expect(pasaCasillas(ambas, puestoPorAlguien)).toBe(false);
    expect(pasaCasillas(ambas, base)).toBe(false);
  });
});

/**
 * EL RENGLÓN DE "QUÉ FILTROS ESTÁN PUESTOS".
 *
 * ⚠️ Existe porque los tres KPIs suman **lo que se ve**: con un filtro puesto,
 * "Total de lo que se ve" cambia de número y sin este renglón hay que ir a
 * revisar los controles para saber qué quedó afuera. Un filtro que recorta el
 * número y no se nombra es un número que cambió solo.
 *
 * Los textos salen de `TIPOS_DE_GASTO` y `CASILLAS`, las MISMAS listas que
 * dibujan los controles: con el texto escrito dos veces, renombrar una opción
 * deja al renglón diciendo el nombre viejo.
 */
describe('etiquetasDeFiltro', () => {
  const NINGUNA = { soloInversion: false, soloPersona: false };

  it('sin filtros no hay nada que nombrar', () => {
    expect(etiquetasDeFiltro(TODOS, NINGUNA, null)).toEqual([]);
  });

  it('nombra el tipo con el MISMO texto del desplegable, y el proveedor', () => {
    expect(etiquetasDeFiltro('material', NINGUNA, null)).toEqual(['Filamentos']);
    expect(etiquetasDeFiltro(TODOS, NINGUNA, 'Filaven')).toEqual(['Filaven']);
    expect(etiquetasDeFiltro('printer', NINGUNA, 'Filaven')).toEqual(['Impresoras', 'Filaven']);
    // El texto no se escribe acá: sale de la lista que alimenta el `Select`.
    expect(etiquetasDeFiltro('design', NINGUNA, null)).toEqual([
      TIPOS_DE_GASTO.find((t) => t.value === 'design')!.label,
    ]);
  });

  it('⚠️ NOMBRA LAS CASILLAS: una marcada que no se nombra cambia el total sin decirlo', () => {
    expect(etiquetasDeFiltro(TODOS, { soloInversion: true, soloPersona: false }, null)).toEqual([
      CASILLAS.soloInversion,
    ]);
    expect(etiquetasDeFiltro(TODOS, { soloInversion: false, soloPersona: true }, null)).toEqual([
      CASILLAS.soloPersona,
    ]);
    expect(etiquetasDeFiltro(TODOS, { soloInversion: true, soloPersona: true }, null)).toEqual([
      CASILLAS.soloInversion,
      CASILLAS.soloPersona,
    ]);
  });

  it('los cuatro controles juntos, en el orden en que están en la barra', () => {
    expect(
      etiquetasDeFiltro('material', { soloInversion: true, soloPersona: true }, 'Filaven'),
    ).toEqual(['Filamentos', 'Filaven', CASILLAS.soloInversion, CASILLAS.soloPersona]);
  });
});

/**
 * EL INVENTARIO DE `CASILLAS`: ninguna clave puede quedar sin su efecto.
 *
 * ⚠️ **Es el hermano del "cubre TODA la lista" de `pasaTipo`, que no existía
 * para las casillas** (2026-10-11). Una tercera clave en `CASILLAS` sin su rama
 * en `pasaCasillas` **no rompe nada**: la casilla se dibuja, se marca, y la
 * lista no se mueve. Un filtro que no filtra es peor que no tenerlo — el dueño
 * cree que está viendo un recorte y está viendo todo.
 *
 * ⚠️ **Y se prueba por COMPORTAMIENTO, no por forma.** Comprobar que existe una
 * propiedad con ese nombre en el objeto `Casillas` no prueba nada: con la rama
 * vacía la propiedad está igual. Lo que se mide es que, con la casilla marcada,
 * el resultado **CAMBIE** — que haya algún gasto que pasa y alguno que no.
 *
 * El precio de esta red: una casilla nueva necesita, además de su rama, un
 * `candidato` que la rama rechace. Si falta, el test se pone rojo pidiéndolo, y
 * eso es lo correcto: sin un gasto que quede afuera no hay manera de saber si
 * la rama recorta o es un `return true` disfrazado.
 */
describe('inventario de CASILLAS', () => {
  const base: ExpenseRow = {
    id: 'g1',
    date: '2026-10-09T00:00:00.000Z',
    category: 'OTHER',
    counterparty: null,
    description: 'Cinta de embalaje',
    amount: 12.5,
    isInvestment: false,
  };
  const DUENO = { id: 'c1', name: 'Propietario', kind: 'OWNER' as const };
  /** Las cuatro combinaciones de los dos ejes transversales. */
  const candidatos: ExpenseRow[] = [
    base,
    { ...base, isInvestment: true },
    { ...base, counterparty: DUENO },
    { ...base, isInvestment: true, counterparty: DUENO },
  ];
  const DESMARCADAS: Casillas = { soloInversion: false, soloPersona: false };
  const claves = Object.keys(CASILLAS) as (keyof typeof CASILLAS)[];
  /** Solo esa casilla marcada, las demás apagadas. */
  const soloEsta = (clave: keyof typeof CASILLAS) =>
    ({ ...DESMARCADAS, [clave]: true }) as Casillas;

  it('⚠️ cada casilla RECORTA de verdad: marcada, algún gasto pasa y alguno NO', () => {
    for (const clave of claves) {
      const marcada = soloEsta(clave);
      // Que no esconda todo: una casilla que no deja pasar nada vacía la tabla.
      expect(
        candidatos.some((e) => pasaCasillas(marcada, e)),
        `«${CASILLAS[clave]}» no deja pasar ningún gasto: vacía la tabla`,
      ).toBe(true);
      // Y que recorte ALGO: acá es donde cae una clave sin su rama en
      // `pasaCasillas`, porque el respaldo de la función es dejar pasar.
      expect(
        candidatos.some((e) => !pasaCasillas(marcada, e)),
        `«${CASILLAS[clave]}» no recorta nada: o le falta su rama en pasaCasillas, o falta un candidato que la rama rechace`,
      ).toBe(true);
    }
  });

  it('⚠️ cada casilla marcada SE NOMBRA en el renglón de filtros puestos', () => {
    // Los tres KPIs suman lo que se ve: una casilla que recorta sin nombrarse
    // cambia el número de arriba sin que nada lo explique.
    for (const clave of claves) {
      expect(
        etiquetasDeFiltro(TODOS, soloEsta(clave), null),
        `«${CASILLAS[clave]}» recorta la lista y el renglón no la nombra`,
      ).toContain(CASILLAS[clave]);
    }
    // Y los textos tienen que ser DISTINTOS entre sí: con dos casillas que
    // comparten etiqueta, el `toContain` de arriba pasaría sin que la segunda
    // esté en el renglón.
    expect(new Set(Object.values(CASILLAS)).size).toBe(claves.length);
  });
});
