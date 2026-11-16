import Decimal from 'decimal.js';
import { D, sum, toMoney } from './money';

/**
 * CUÁNTO FILAMENTO SE CONSUMIÓ CADA MES.
 *
 * No se mide: se deduce. El consumo de un mes es lo que tenías al cerrar el
 * anterior, más lo que compraste, menos lo que te queda al cerrar este.
 *
 * El problema es que un rollo empezado vale lo que pesa en la balanza, y si
 * nadie lo pesó vale 0 (ver `valorDelInventario`). O sea que la regla **ya dio
 * ese rollo por consumido entero** el mes que apareció sin pesar. Cuando más
 * tarde se pesa, su valor reaparece en el inventario: sin corregir nada, el
 * consumo de ese mes saldría NEGATIVO y encendería la alarma de «conteo mal
 * tipeado» por algo que no es un error.
 *
 * ## El ajuste es un CRÉDITO PENDIENTE, no una comparación mes contra mes
 *
 * Esa es la idea entera, y es lo que dos arreglos anteriores no tuvieron:
 *
 * > El ajuste es un **crédito pendiente** que nace cuando la regla «un rollo
 * > sin pesar vale 0» ya dio ese rollo por consumido entero, y se **libera a
 * > medida que el rollo se gasta de verdad**. Un rollo que **nunca pasó por sin
 * > pesar** —se abrió de un sellado y se pesó al toque— **no genera crédito**,
 * > porque su valor nunca se dio por perdido.
 *
 * Por eso cada casilla arrastra su crédito de mes en mes (`Map<clave, credito>`)
 * y el ajuste del mes es la SUMA DE LOS CAMBIOS de esos créditos. El crédito
 * solo BAJA mientras el rollo sigue pesado (`min(credito, valor)`), así que se
 * va liberando con el peso y queda en 0 cuando el rollo se termina: ahí el
 * acumulado cierra exacto.
 *
 * ⚠️ **Son TRES estados por casilla, no dos** (`presente` × `pesado`):
 * *no hay rollo* · *hay rollo y nadie lo pesó* · *hay rollo pesado*. Con dos
 * estados —leyendo la casilla vacía como «un rollo sin pesar»— cualquier regla
 * que arregle un extremo rompe el otro: un rollo abierto desde un sellado y
 * pesado en el acto se leía como «valor que aparece de la nada» y costaba un
 * gasto fantasma de un rollo entero, cada vez (medido: −$6 por ciclo, y se
 * acumulaba). Si alguien vuelve a fundir los dos estados, vuelve ese defecto.
 *
 * ⚠️ **Lo que NO sirve y se descarta a propósito: quitar el ajuste.** Sería
 * internamente consistente, pero la primera medición de cada rollo daría
 * consumo negativo y encendería `mesesConConsumoNegativo` en un caso que no es
 * un error. El ajuste existe por eso; el problema siempre fue CÓMO se libera.
 */

/** Un rollo abierto identificado por ficha + casilla: `${materialId}:inUse` o `:running`. */
export interface RolloDelMes {
  clave: string;
  valor: number;
  /**
   * ¿Hay un rollo en esa casilla este mes? `false` = la casilla está VACÍA
   * (en la API, `x.rollos > 0`).
   *
   * ⚠️ No es lo mismo que `pesado: false`, y confundirlos es el defecto que esta
   * versión vino a cerrar: una casilla vacía no tiene valor que se haya dado por
   * perdido, así que no puede generar crédito; un rollo presente y sin pesar sí.
   */
  presente: boolean;
  pesado: boolean;
}

export interface MesDeInventario {
  /** `AAAA-MM`. El texto ordena bien, así que se compara como texto. */
  mes: string;
  compras: number;
  sellados: number;
  abiertos: RolloDelMes[];
}

export interface ConsumoDelMes {
  mes: string;
  compras: number;
  inventarioFinal: number;
  consumo: number;
  ajuste: number;
  /**
   * Rollos cuyo crédito pendiente NACIÓ este mes: estaban presentes y sin pesar,
   * y este mes se pesaron. Su valor reaparece en el inventario y ya se había
   * contado como consumo, así que el ajuste es POSITIVO por ellos.
   */
  rollosConCreditoNuevo: number;
  /**
   * Rollos cuyo crédito pendiente BAJÓ este mes: se gastaron, se terminaron o
   * quedaron sin pesar. Esa caída del inventario ya se había contado como
   * consumo, así que el ajuste es NEGATIVO por ellos.
   */
  rollosConCreditoLiberado: number;
}

/**
 * Una fila de la tabla mes a mes de Filamento → Análisis
 * (`GET /filament/consumo`, shared 0.100.0).
 *
 * ⚠️ El tramo ABIERTO (lo posterior al último cierre) NO tiene consumo ni
 * ajuste conocidos: ahí `consumo` y `ajuste` viajan en `null`, no en 0. Un 0
 * diría «no se consumió nada», que es una afirmación; `null` dice «todavía no se
 * sabe», que es lo cierto. Ese tramo solo informa lo comprado y lo que sigue en
 * el estante.
 */
export interface FilaDeConsumoPorMes {
  mes: string;
  abierto: boolean;
  compras: number;
  inventarioFinal: number;
  consumo: number | null;
  ajuste: number | null;
  rollosConCreditoNuevo: number;
  rollosConCreditoLiberado: number;
}

const inventarioDe = (m: MesDeInventario) =>
  sum([D(m.sellados), ...m.abiertos.map((r) => D(r.valor))]);

/**
 * `consumo = inventarioFinal(N−1) + compras(N) − inventarioFinal(N) + ajuste(N)`
 *
 * - El primer mes arranca con inventario inicial 0.
 * - Los meses se ORDENAN por `mes` antes de trabajar: el mes N−1 es la base de
 *   toda la cuenta, y si llegaran al revés el resultado sería basura sin error.
 * - Los huecos del calendario NO se rellenan con ceros: si falta un mes (no se
 *   hizo conteo), el «anterior» es el último cierre que existe. Inventar un mes
 *   en 0 daría un consumo gigante seguido de uno negativo.
 *
 * ## El crédito, regla por regla
 *
 * Para cada casilla (`clave`), con `v` = su valor de este mes:
 *
 * 1. `credito = 0` si la casilla está **vacía** (`!presente`) o el rollo **no
 *    está pesado**. Un rollo sin pesar vale 0 y ya se dio por consumido: no hay
 *    nada reservado.
 * 2. `credito = v` **solo** cuando el mes anterior tenía el rollo **presente y
 *    sin pesar** y este mes está pesado. Ahí NACE el crédito: ese valor ya se
 *    contó como consumo y hay que reconocerlo de vuelta.
 * 3. Mientras siga pesado, `credito = min(credito_anterior, v)`: baja con el
 *    peso y **nunca sube**. Un rollo que se abrió de un sellado y se pesó en el
 *    acto entra por acá con `credito_anterior = 0`, así que su crédito es 0 — y
 *    por eso NO fabrica un gasto fantasma.
 * 4. `ajuste(mes) = Σ_claves (credito_mes − credito_mes_anterior)`.
 *
 * Una clave que este mes **no viene en la lista** (la ficha no tiene fila de
 * conteo) se trata como vacía: su crédito cae a 0 y aporta su delta negativo.
 * ⚠️ Eso es necesario, no cosmético: si un crédito quedara colgado en el mapa
 * para siempre, `Σ ajustes` dejaría de telescopar contra el inventario final y
 * el acumulado no cerraría nunca.
 *
 * ⚠️ **Granularidad de CASILLA, no de rollo físico.** Si en la misma casilla se
 * termina un rollo y se abre otro, el crédito del primero se le atribuye al
 * segundo. El acumulado igual cierra en 0 cuando el segundo se termina (medido);
 * lo que se desplaza es en qué mes cae el consumo. Para arreglarlo haría falta
 * una tabla de rollos individuales, que el spec descartó a propósito.
 *
 * ⚠️ `unir` fichas sigue sin generar ajuste, y por la razón de siempre:
 * `materials.service.ts` suma los conteos de TODOS los meses y borra la ficha
 * absorbida, así que su clave desaparece de la cadena entera y nunca hay un mes
 * donde comparar. Si algún día `unir` dejara de reescribir el pasado, hay que
 * mirar allá.
 */
export function consumoPorMes(meses: MesDeInventario[]): ConsumoDelMes[] {
  const ordenados = [...meses].sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
  const resultado: ConsumoDelMes[] = [];

  /** Crédito pendiente por casilla al cierre del mes anterior. Solo guarda los > 0. */
  let creditos = new Map<string, Decimal>();
  let previo: MesDeInventario | null = null;

  for (const actual of ordenados) {
    const finalActual = inventarioDe(actual);
    const inicial = previo ? inventarioDe(previo) : D(0);
    const delPrevio = new Map((previo?.abiertos ?? []).map((r) => [r.clave, r]));

    const siguientes = new Map<string, Decimal>();
    let nuevos = 0;
    let liberados = 0;

    for (const r of actual.abiertos) {
      const antes = delPrevio.get(r.clave);
      const creditoAntes = creditos.get(r.clave) ?? D(0);
      let credito: Decimal;
      if (!r.presente || !r.pesado) {
        // (1) Vacía o sin pesar: nada reservado.
        // ⚠️ El `!r.presente` de ACÁ es defensivo y NO es el que sostiene los tres
        // estados: su único productor (`valuarConteo`) emite `presente: false`
        // siempre con `pesado: false`, así que `!r.pesado` ya lo cubre. Verificado
        // por mutación: borrarlo tumba **0** tests, y no es un test que falte — es
        // un estado que el contrato no produce (lo fija el `toEqual` de
        // `consumo.service.spec.ts` sobre `abiertos`). Se queda para que un dato
        // contradictorio («casilla vacía que igual reporta valor») degrade por el
        // lado seguro. **El guardián de los tres estados es el `antes.presente` de
        // la regla (2)**, y ese sí: mutarlo tumba 4.
        credito = D(0);
      } else if (antes && antes.presente && !antes.pesado) {
        credito = D(r.valor); // (2) venía presente y sin pesar: NACE el crédito
      } else {
        credito = Decimal.min(creditoAntes, D(r.valor)); // (3) sigue pesado: baja con el peso
      }
      if (credito.gt(0)) siguientes.set(r.clave, credito);
      if (credito.gt(creditoAntes)) nuevos += 1;
      else if (credito.lt(creditoAntes)) liberados += 1;
    }

    // Una clave que este mes no viene en la lista cuenta como vacía: su crédito cae a 0.
    const enElMes = new Set(actual.abiertos.map((r) => r.clave));
    for (const [clave, c] of creditos) if (!enElMes.has(clave) && c.gt(0)) liberados += 1;

    const ajuste = sum([...siguientes.values()]).minus(sum([...creditos.values()]));

    resultado.push({
      mes: actual.mes,
      compras: toMoney(D(actual.compras)),
      inventarioFinal: toMoney(finalActual),
      consumo: toMoney(inicial.plus(actual.compras).minus(finalActual).plus(ajuste)),
      ajuste: toMoney(ajuste),
      rollosConCreditoNuevo: nuevos,
      rollosConCreditoLiberado: liberados,
    });

    creditos = siguientes;
    previo = actual;
  }

  return resultado;
}
