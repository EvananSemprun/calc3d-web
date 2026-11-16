import { consumoPorMes, MesDeInventario, RolloDelMes } from './consumo-de-filamento';

/**
 * LAS DIEZ HISTORIAS DE ROLLO, CON SU CONSUMO CALCULADO A MANO.
 *
 * ⚠️ **Por qué esta tabla y no la igualdad que había antes.** El test que
 * vigilaba esto era `compras − inventario = Σconsumos − Σajustes`, y esa
 * igualdad es una **TAUTOLOGÍA ALGEBRAICA** de la fórmula del consumo:
 * de `consumo(n) = I(n−1) + C(n) − I(n) + A(n)`, sumando sobre todos los meses
 * con `I(−1) = 0`, sale `Σconsumo = ΣC − I(último) + ΣA` **para cualquier A**,
 * incluido un A rotundamente mal. Comprobado por mutación: con el ajuste
 * duplicado la igualdad seguía dando `true` en los 7 escenarios. **Por eso la
 * suite estuvo verde con el defecto adentro desde el día uno.**
 *
 * Lo que tiene dientes es esto: cada historia trae **el consumo de cada mes
 * calculado a mano desde las entradas** y **el valor HONESTO del estante final
 * escrito a mano** (`2 sellados a $10 + un rollo pesado en $3 = $23`), jamás
 * leído de la salida del motor. Leerlo de la salida es lo que vuelve
 * tautológico al test.
 *
 * Las dos aserciones juntas son las que cierran el agujero: los `consumos` a
 * mano fijan la CONDUCTA mes a mes, y `compras − Σconsumos === estante` fija que
 * el fixture no se contradiga a sí mismo. Un fixture que bendiga un residuo
 * —como el `−3` que la ronda anterior declaró correcto— falla la segunda.
 *
 * ## El escenario base
 *
 * Rollos de **$10** (1000 g), **4 comprados = $40** en el primer mes. `sellados`
 * es el valor de los que siguen sin abrir, así que abrir uno lo baja $10. El
 * «estante publicado» es `compras − Σconsumos`, que es lo que
 * `filamentoEnEstante` le resta a los gastos del negocio.
 *
 * Casi todas las historias **terminan con el rollo consumido**, para que el
 * crédito quede liberado y el acumulado tenga que cerrar exacto. La que termina
 * con crédito pendiente (`E4`) lleva su esperado escrito a mano también.
 */

const vacia = (clave: string): RolloDelMes => ({ clave, valor: 0, presente: false, pesado: false });
const sinPesar = (clave: string): RolloDelMes => ({ clave, valor: 0, presente: true, pesado: false });
const pesado = (clave: string, valor: number): RolloDelMes => ({ clave, valor, presente: true, pesado: true });
const mes = (m: string, compras: number, sellados: number, abiertos: RolloDelMes[] = []): MesDeInventario => ({
  mes: m,
  compras,
  sellados,
  abiertos,
});

const A = 'a:inUse';

interface Historia {
  /** El número de la fila en la tabla de la re-revisión. */
  n: string;
  nombre: string;
  meses: MesDeInventario[];
  /** El consumo de CADA mes, calculado a mano desde las entradas. */
  consumos: number[];
  /** El valor honesto del estante al final, escrito a mano desde el fixture. NUNCA de la salida. */
  estante: number;
}

const HISTORIAS: Historia[] = [
  {
    n: '1',
    nombre: 'sin pesar → pesado $5 → terminado',
    // I = 30, 35, 30. Créditos: 0, 5 (nace: venía presente y sin pesar), 0 (se terminó).
    // Ajustes: 0, +5, −5. C = 40−30 | 30−35+5 | 35−30−5.
    meses: [
      mes('2026-08', 40, 30, [sinPesar(A)]),
      mes('2026-09', 0, 30, [pesado(A, 5)]),
      mes('2026-10', 0, 30, [vacia(A)]),
    ],
    consumos: [10, 0, 0],
    estante: 30, // 3 sellados a $10; el rollo abierto se consumió entero
  },
  {
    n: '2',
    nombre: 'pesado → sin pesar (sigue en uso) → terminado',
    // Nunca pasó por «sin pesar» antes de pesarse: NO genera crédito.
    // I = 38, 30, 30. Ajustes: 0, 0, 0. C = 40−38 | 38−30 | 30−30.
    meses: [
      mes('2026-08', 40, 30, [pesado(A, 8)]),
      mes('2026-09', 0, 30, [sinPesar(A)]),
      mes('2026-10', 0, 30, [vacia(A)]),
    ],
    consumos: [2, 8, 0],
    estante: 30,
  },
  {
    n: '3',
    nombre: 'alterna pesado / sin pesar 3 veces y termina',
    // Créditos: 0, 8, 0, 5, 0, 3, 0 → ajustes 0, +8, −8, +5, −5, +3, −3.
    // I = 30, 38, 30, 35, 30, 33, 30.
    meses: [
      mes('2026-07', 40, 30, [sinPesar(A)]),
      mes('2026-08', 0, 30, [pesado(A, 8)]),
      mes('2026-09', 0, 30, [sinPesar(A)]),
      mes('2026-10', 0, 30, [pesado(A, 5)]),
      mes('2026-11', 0, 30, [sinPesar(A)]),
      mes('2026-12', 0, 30, [pesado(A, 3)]),
      mes('2027-01', 0, 30, [vacia(A)]),
    ],
    consumos: [10, 0, 0, 0, 0, 0, 0],
    estante: 30,
  },
  {
    n: '4a',
    nombre: 'mes REABIERTO: el del medio sale de la cadena y el ciclo sigue cerrando',
    // Reabrir un mes lo saca de la cadena (`excluirMes`): el ciclo queda
    // sin pesar → terminado. I = 30, 30. Ajustes 0, 0.
    meses: [mes('2026-08', 40, 30, [sinPesar(A)]), mes('2026-10', 0, 30, [vacia(A)])],
    consumos: [10, 0],
    estante: 30,
  },
  {
    n: '4b',
    nombre: 'mes REABIERTO: el PRIMERO sale de la cadena (sus compras ruedan al cierre siguiente)',
    // El rollo aparece ya pesado en el primer cierre que queda: no genera crédito.
    // I = 35, 30. Ajustes 0, 0. C = 40−35 | 35−30.
    meses: [mes('2026-09', 40, 30, [pesado(A, 5)]), mes('2026-10', 0, 30, [vacia(A)])],
    consumos: [5, 5],
    estante: 30,
  },
  {
    n: '5',
    nombre: 'ficha con 0 rollos en todos los meses (casillas vacías puras)',
    meses: [
      mes('2026-08', 40, 40, [vacia(A)]),
      mes('2026-09', 0, 40, [vacia(A)]),
      mes('2026-10', 0, 40, [vacia(A)]),
    ],
    consumos: [0, 0, 0],
    estante: 40, // los 4 rollos siguen sellados
  },
  {
    n: '6',
    nombre: 'sin pesar → pesado $5 → RE-pesado $3 → terminado',
    // El crédito BAJA con el peso: 0, 5, min(5,3)=3, 0 → ajustes 0, +5, −2, −3.
    // Es el caso que la ronda anterior dejaba con un residuo de −2: el crédito
    // que se liberaba era el ÚLTIMO peso y no el que se había acreditado.
    // I = 30, 35, 33, 30.
    meses: [
      mes('2026-08', 40, 30, [sinPesar(A)]),
      mes('2026-09', 0, 30, [pesado(A, 5)]),
      mes('2026-10', 0, 30, [pesado(A, 3)]),
      mes('2026-11', 0, 30, [vacia(A)]),
    ],
    consumos: [10, 0, 0, 0],
    estante: 30,
  },
  {
    n: '7',
    nombre: 'SIEMPRE pesa: casilla vacía → pesado $10 → $4 → terminado',
    // El rollo se abrió de un sellado y se pesó en el acto: su valor nunca se dio
    // por perdido, así que NO hay crédito y el ajuste es 0 en los cuatro meses.
    // Era el caso que costaba −6 por ciclo, y acumulaba.
    // I = 40, 40, 34, 30.
    meses: [
      mes('2026-08', 40, 40, [vacia(A)]),
      mes('2026-09', 0, 30, [pesado(A, 10)]),
      mes('2026-10', 0, 30, [pesado(A, 4)]),
      mes('2026-11', 0, 30, [vacia(A)]),
    ],
    consumos: [0, 0, 6, 4],
    estante: 30,
  },
  {
    n: '8',
    nombre: 'el 7 repetido DOS ciclos (el residuo se acumulaba)',
    meses: [
      mes('2026-08', 40, 40, [vacia(A)]),
      mes('2026-09', 0, 30, [pesado(A, 10)]),
      mes('2026-10', 0, 30, [pesado(A, 4)]),
      mes('2026-11', 0, 30, [vacia(A)]),
      mes('2026-12', 0, 20, [pesado(A, 10)]),
      mes('2027-01', 0, 20, [pesado(A, 4)]),
      mes('2027-02', 0, 20, [vacia(A)]),
    ],
    consumos: [0, 0, 6, 4, 0, 6, 4],
    estante: 20, // 2 sellados: los otros dos rollos se consumieron
  },
  {
    n: '9',
    nombre: 'terminado y VUELVE A APARECER pesado (otro rollo en la misma casilla)',
    // Al reaparecer, el mes anterior tenía la casilla VACÍA (no «presente y sin
    // pesar»), así que el rollo nuevo no genera crédito.
    // I = 30, 35, 30, 30, 20. Ajustes 0, +5, −5, 0, 0.
    meses: [
      mes('2026-08', 40, 30, [sinPesar(A)]),
      mes('2026-09', 0, 30, [pesado(A, 5)]),
      mes('2026-10', 0, 30, [vacia(A)]),
      mes('2026-11', 0, 20, [pesado(A, 10)]),
      mes('2026-12', 0, 20, [vacia(A)]),
    ],
    consumos: [10, 0, 0, 0, 10],
    estante: 20,
  },
  {
    n: '10',
    nombre: 'ficha NUEVA pesada en su primer mes contado → se termina',
    // Su primera aparición ya es pesada: no hay valor dado por perdido, no hay
    // crédito, y al terminarse no se libera nada. Era el caso que INVENTABA
    // ganancia (+10): la app dejaba de reconocer un gasto que sí ocurrió.
    // I = 40, 30. Ajustes 0, 0.
    meses: [mes('2026-08', 40, 30, [pesado(A, 10)]), mes('2026-09', 0, 30, [vacia(A)])],
    consumos: [0, 10],
    estante: 30,
  },
  {
    n: '9b',
    nombre: 'reaparece pesado y en el mes del medio la ficha NO tuvo fila de conteo',
    // La clave desaparece de la lista: cuenta como vacía y su crédito cae a 0.
    // Sin eso el crédito quedaría colgado y Σajustes no telescoparía.
    // I = 30, 35, 30, 30, 20. Ajustes 0, +5, −5, 0, 0.
    meses: [
      mes('2026-08', 40, 30, [sinPesar(A)]),
      mes('2026-09', 0, 30, [pesado(A, 5)]),
      mes('2026-10', 0, 30, []),
      mes('2026-11', 0, 20, [pesado(A, 10)]),
      mes('2026-12', 0, 20, [vacia(A)]),
    ],
    consumos: [10, 0, 0, 0, 10],
    estante: 20,
  },
  {
    n: 'E2',
    nombre: 'el peso SUBE porque se abrió otro rollo (lo sellado baja): sin alarma',
    // I = 30, 35, 27, 20. Créditos 0, 5, min(5,7)=5, 0 → ajustes 0, +5, 0, −5.
    meses: [
      mes('2026-08', 40, 30, [sinPesar(A)]),
      mes('2026-09', 0, 30, [pesado(A, 5)]),
      mes('2026-10', 0, 20, [pesado(A, 7)]),
      mes('2026-11', 0, 20, [vacia(A)]),
    ],
    consumos: [10, 0, 8, 2],
    estante: 20,
  },
  {
    n: 'E3',
    nombre: 'DOS rollos en la misma casilla, el segundo detrás de un mes sin pesar',
    // ⚠️ El crédito del primero se le atribuye al SEGUNDO (la clave es la casilla,
    // no el rollo físico). El acumulado igual cierra en 0; lo que se corre es en
    // qué mes cae el consumo. I = 30, 35, 30, 29, 20.
    // Ajustes 0, +5, −5, +9, −9.
    meses: [
      mes('2026-08', 40, 30, [sinPesar(A)]),
      mes('2026-09', 0, 30, [pesado(A, 5)]),
      mes('2026-10', 0, 30, [sinPesar(A)]),
      mes('2026-11', 0, 20, [pesado(A, 9)]),
      mes('2026-12', 0, 20, [vacia(A)]),
    ],
    consumos: [10, 0, 0, 10, 0],
    estante: 20,
  },
];

describe('consumoPorMes — las historias de rollo, con los consumos a mano', () => {
  it.each(HISTORIAS.map((h) => [`#${h.n} ${h.nombre}`, h] as const))('%s', (_titulo, h) => {
    const r = consumoPorMes(h.meses);

    // 1) La CONDUCTA: el consumo de cada mes, calculado a mano desde las entradas.
    expect(r.map((x) => x.consumo)).toEqual(h.consumos);

    // 2) LA PLATA: el estante que la app publica tiene que ser el honesto, escrito
    // a mano. Si esta falla y la de arriba pasa, el fixture se contradice a sí mismo.
    const compras = h.meses.reduce((s, m) => s + m.compras, 0);
    const publicado = compras - h.consumos.reduce((s, c) => s + c, 0);
    expect(publicado).toBe(h.estante);
  });

  it('un rollo que nunca pasó por «sin pesar» NO genera ajuste en ningún mes (los caminos 7, 8 y 10)', () => {
    for (const n of ['7', '8', '10']) {
      const h = HISTORIAS.find((x) => x.n === n)!;
      expect(consumoPorMes(h.meses).map((x) => x.ajuste)).toEqual(h.meses.map(() => 0));
    }
  });

  it('el crédito BAJA con el peso y nunca sube: re-pesar libera la diferencia (camino 6)', () => {
    const h = HISTORIAS.find((x) => x.n === '6')!;
    // 0 → 5 (nace) → 3 (min(5, 3)) → 0 (se terminó): +5, −2, −3 suman 0.
    expect(consumoPorMes(h.meses).map((x) => x.ajuste)).toEqual([0, 5, -2, -3]);
  });
});

describe('consumoPorMes — el crédito pendiente que NO se liberó', () => {
  /**
   * El único caso en que el estante publicado NO es el honesto, y es a propósito:
   * el rollo se pesó después de un mes sin pesar y la cadena se corta ahí. Los $5
   * ya se habían dado por consumidos y el crédito sigue pendiente, así que la app
   * publica $5 MENOS de estante. Se libera cuando el rollo se gasta de verdad.
   * El esperado va escrito a mano, no leído de la salida.
   */
  it('mientras el crédito sigue pendiente, el estante publicado queda por debajo del honesto, por exactamente el crédito', () => {
    const meses = [mes('2026-08', 40, 30, [sinPesar(A)]), mes('2026-09', 0, 30, [pesado(A, 5)])];
    const r = consumoPorMes(meses);

    expect(r.map((x) => x.consumo)).toEqual([10, 0]);
    expect(r.map((x) => x.ajuste)).toEqual([0, 5]);
    const publicado = 40 - 10 - 0;
    expect(publicado).toBe(30);
    // El honesto, a mano: 3 sellados a $10 + el rollo pesado en $5.
    const honesto = 35;
    expect(publicado - honesto).toBe(-5); // = −crédito pendiente
  });

  it('en cuanto el rollo se consume, ese crédito se libera y el estante vuelve a ser el honesto', () => {
    const meses = [
      mes('2026-08', 40, 30, [sinPesar(A)]),
      mes('2026-09', 0, 30, [pesado(A, 5)]),
      mes('2026-10', 0, 30, [vacia(A)]),
    ];
    const r = consumoPorMes(meses);
    expect(40 - r.reduce((s, x) => s + x.consumo, 0)).toBe(30);
  });
});

describe('consumoPorMes — la alarma de conteo mal tipeado sigue encendiéndose', () => {
  /**
   * El ajuste existe para que la PRIMERA medición de un rollo no dé consumo
   * negativo. Lo que no puede hacer es apagar la alarma cuando el dato es
   * imposible: un peso que SUBE sin que baje lo sellado no tiene explicación
   * física, y ahí el consumo negativo es el hallazgo.
   */
  it('un peso que sube sin que baje lo sellado deja el consumo NEGATIVO (y el acumulado igual cierra)', () => {
    const meses = [
      mes('2026-08', 40, 30, [sinPesar(A)]),
      mes('2026-09', 0, 30, [pesado(A, 5)]),
      mes('2026-10', 0, 30, [pesado(A, 7)]), // +2 de la nada
      mes('2026-11', 0, 30, [vacia(A)]),
    ];
    const r = consumoPorMes(meses);
    expect(r.map((x) => x.consumo)).toEqual([10, 0, -2, 2]);
    expect(40 - r.reduce((s, x) => s + x.consumo, 0)).toBe(30);
  });

  it('la primera medición de un rollo que venía sin pesar NO da consumo negativo (por eso el ajuste existe)', () => {
    // Sin ajuste: 100 − 102 = −2. Con el crédito: +12 → 10.
    const r = consumoPorMes([
      mes('2026-10', 0, 100, [sinPesar(A)]),
      mes('2026-11', 0, 90, [pesado(A, 12)]),
    ]);
    expect(r[1].ajuste).toBe(12);
    expect(r[1].consumo).toBe(10);
  });
});

describe('consumoPorMes — los contadores que la pantalla usa para explicar el ajuste', () => {
  it('cuenta los rollos cuyo crédito NACIÓ y los que lo LIBERARON, por separado', () => {
    const r = consumoPorMes([
      mes('2026-08', 0, 100, [sinPesar('a:inUse'), sinPesar('b:inUse'), sinPesar('c:running')]),
      mes('2026-09', 0, 100, [pesado('a:inUse', 8), pesado('b:inUse', 6), sinPesar('c:running')]),
      // a baja de 8 a 3 (libera 5), b se termina (libera 6), c recién se pesa (nace 5).
      // ⚠️ ASIMÉTRICO a propósito (1 y 2): con 1 y 1, invertir los contadores no cambia nada.
      mes('2026-10', 0, 100, [pesado('a:inUse', 3), vacia('b:inUse'), pesado('c:running', 5)]),
    ]);

    expect([r[0].rollosConCreditoNuevo, r[0].rollosConCreditoLiberado]).toEqual([0, 0]);
    expect([r[1].rollosConCreditoNuevo, r[1].rollosConCreditoLiberado]).toEqual([2, 0]);
    expect([r[2].rollosConCreditoNuevo, r[2].rollosConCreditoLiberado]).toEqual([1, 2]);
    expect(r.map((x) => x.ajuste)).toEqual([0, 14, -6]); // 14 = 8+6; −6 = (3+5) − 14
  });

  it('un rollo que sigue pesado con el MISMO peso no mueve ningún contador', () => {
    const r = consumoPorMes([
      mes('2026-08', 0, 100, [pesado(A, 7)]),
      mes('2026-09', 0, 100, [pesado(A, 7)]),
    ]);
    expect([r[1].rollosConCreditoNuevo, r[1].rollosConCreditoLiberado]).toEqual([0, 0]);
    expect(r[1].ajuste).toBe(0);
  });
});

describe('consumoPorMes — la cadena de meses', () => {
  it('el primer mes arranca con inventario inicial 0', () => {
    const r = consumoPorMes([mes('2026-10', 200, 150, [pesado(A, 20)])]);
    expect(r[0].ajuste).toBe(0);
    expect(r[0].consumo).toBe(200 - 170);
  });

  it('con un mes sin conteo en el medio, el siguiente parte del último cierre anterior, no de 0', () => {
    const r = consumoPorMes([mes('2026-09', 0, 100), mes('2026-11', 30, 110)]);
    expect(r.map((x) => x.mes)).toEqual(['2026-09', '2026-11']);
    expect(r[1].consumo).toBe(100 + 30 - 110);
  });

  it('ordena los meses por su clave aunque lleguen al revés', () => {
    const r = consumoPorMes([mes('2026-11', 30, 110), mes('2026-09', 0, 100)]);
    expect(r.map((x) => x.mes)).toEqual(['2026-09', '2026-11']);
    expect(r[1].consumo).toBe(20);
  });

  /**
   * `unir` fichas (apps/api/src/materials/materials.service.ts) suma los conteos de
   * TODOS los meses y borra la ficha absorbida, así que su clave desaparece de la
   * cadena entera. Una clave que solo existe en un mes no genera crédito ni ajuste.
   * Si algún día `unir` dejara de reescribir el pasado, hay que mirar allá.
   */
  it('una clave que solo existe en un mes de la cadena no genera ajuste', () => {
    const r = consumoPorMes([
      mes('2026-10', 0, 100, [pesado(A, 12), pesado('b:inUse', 5)]),
      mes('2026-11', 0, 90, [pesado('b:inUse', 5)]),
    ]);
    expect(r[1].ajuste).toBe(0);
    expect(r[1].consumo).toBe(117 - 95);
  });
});

describe('consumoPorMes — el telescopado (un chequeo, NO una prueba de la regla)', () => {
  /**
   * ⚠️ **ESTO NO PRUEBA NADA DEL AJUSTE.** `Σconsumos = ΣC − I(último) + Σajustes`
   * es una identidad algebraica de la fórmula y se cumple para CUALQUIER ajuste,
   * incluido uno roto: con el ajuste duplicado sigue dando `true`. Vive acá —en su
   * propio `describe`, lejos de las historias— para que su verde no se confunda con
   * una prueba de la conducta. Lo único que caza es que la suma deje de telescopar
   * (un mes que se pierda, un inventario inicial que no sea el final del anterior).
   * Quien tiene dientes es la tabla de arriba.
   */
  it('la suma telescopa: Σconsumos = compras − inventario final + Σajustes', () => {
    const meses = [
      mes('2026-08', 40, 60, [sinPesar('a:inUse'), pesado('b:running', 9)]),
      mes('2026-09', 25, 70, [pesado('a:inUse', 7), sinPesar('b:running')]),
      mes('2026-10', 0, 55, [sinPesar('a:inUse'), pesado('b:running', 4), pesado('c:inUse', 3)]),
      mes('2026-11', 80, 100, [pesado('a:inUse', 6), vacia('b:running'), vacia('c:inUse')]),
    ];
    const r = consumoPorMes(meses);
    const consumos = r.reduce((s, x) => s + x.consumo, 0);
    const compras = meses.reduce((s, x) => s + x.compras, 0);
    const ajustes = r.reduce((s, x) => s + x.ajuste, 0);
    expect(consumos).toBeCloseTo(compras - r[r.length - 1].inventarioFinal + ajustes, 6);
  });
});
