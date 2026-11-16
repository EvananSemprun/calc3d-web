import { D, sum, toMoney } from './money';

/**
 * CUÁNTO FILAMENTO SE CONSUMIÓ CADA MES.
 *
 * No se mide: se deduce. El consumo de un mes es lo que tenías al cerrar el
 * anterior, más lo que compraste, menos lo que te queda al cerrar este.
 *
 * El problema es que un rollo empezado vale lo que pesa en la balanza, y si
 * nadie lo pesó vale 0 (ver `valorDelInventario`). Entonces el inventario final
 * cambia también por CÓMO se midió, no solo por lo que se gastó:
 * - Un rollo que pasa de «sin pesar» a «pesado» hace aparecer su valor de la
 *   nada: el inventario sube sin que entre material y el consumo saldría
 *   negativo.
 * - Un rollo que se pesó el mes pasado y este no hace DESAPARECER su valor: se
 *   leería como un pico de consumo que nunca ocurrió, justo el número alarmante
 *   y falso que no podemos ponerle al dueño delante.
 * El `ajuste` cancela exactamente esas dos apariciones y desapariciones.
 */

/** Un rollo abierto identificado por ficha + casilla: `${materialId}:inUse` o `:running`. */
export interface RolloDelMes {
  clave: string;
  valor: number;
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
  /** Rollos que pasaron de «sin pesar» a pesado en este mes: su valor APARECE en el inventario sin haberse comprado. */
  rollosPesados: number;
  /** Rollos que pasaron de pesado a «sin pesar»: su valor DESAPARECE del inventario sin haberse gastado. */
  rollosSinPesar: number;
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
  rollosPesados: number;
  rollosSinPesar: number;
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
 * - El ajuste solo mira las claves que están en LOS DOS meses: una medición que
 *   no existe en uno de ellos no se puede comparar, así que no genera ajuste.
 *   Ojo, esto NO es lo que protege de un pico de consumo al unir fichas: eso lo
 *   garantiza una pieza de FUERA, `unir` en `apps/api/src/materials/
 *   materials.service.ts`, que suma los conteos de TODOS los meses (también los
 *   pasados) y borra la ficha absorbida, así que su clave desaparece de los dos
 *   meses y el mes anterior queda reescrito. Si algún día `unir` dejara de
 *   reescribir el pasado, este razonamiento se cae y hay que mirar allá.
 */
export function consumoPorMes(meses: MesDeInventario[]): ConsumoDelMes[] {
  const ordenados = [...meses].sort((a, b) => (a.mes < b.mes ? -1 : a.mes > b.mes ? 1 : 0));
  const resultado: ConsumoDelMes[] = [];

  ordenados.forEach((actual, i) => {
    const previo = i > 0 ? ordenados[i - 1] : null;
    const finalActual = inventarioDe(actual);
    const inicial = previo ? inventarioDe(previo) : D(0);

    const delPrevio = new Map((previo?.abiertos ?? []).map((r) => [r.clave, r]));
    const aparecen = [];
    const desaparecen = [];
    for (const r of actual.abiertos) {
      const antes = delPrevio.get(r.clave);
      if (!antes) continue; // clave que no está en los dos meses: se ignora
      if (r.pesado && !antes.pesado) aparecen.push(D(r.valor));
      if (!r.pesado && antes.pesado) desaparecen.push(D(antes.valor));
    }
    const ajuste = sum(aparecen).minus(sum(desaparecen));

    resultado.push({
      mes: actual.mes,
      compras: toMoney(D(actual.compras)),
      inventarioFinal: toMoney(finalActual),
      consumo: toMoney(inicial.plus(actual.compras).minus(finalActual).plus(ajuste)),
      ajuste: toMoney(ajuste),
      rollosPesados: aparecen.length,
      rollosSinPesar: desaparecen.length,
    });
  });

  return resultado;
}
