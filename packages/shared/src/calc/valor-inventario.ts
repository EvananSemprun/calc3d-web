import { D, sum, toMoney } from './money';

/**
 * CUÁNTO VALE EN DINERO EL FILAMENTO QUE QUEDA.
 *
 * Regla del dueño, y manda sobre cualquier duda: **ante la falta de un dato,
 * vale 0 y se avisa; nunca se estima.** Por eso un rollo empezado vale lo que
 * pesa en la balanza o no vale nada: la versión anterior inventaba que un rollo
 * «en uso» valía medio rollo y uno «por acabarse» un octavo, y esa fracción no
 * salía de ningún dato. Un valor inventado se lee como una medición, y es
 * peor que un hueco declarado.
 *
 * Lo que no se puede valuar NO desaparece en silencio: se cuenta aparte
 * (`rollosSinPesar`, `sinPrecio`) para que el dueño vea cuánto del inventario
 * quedó afuera del total.
 *
 * El precio de un rollo es el PROMEDIO PONDERADO de lo que se pagó
 * (`promedioPorFicha`), no el de la última compra: esto es lo que cuesta lo que
 * tienes, no lo que costaría reponerlo.
 */

export interface CompraParaPromedio {
  materialId: string;
  amount: number;
  /** Rollos comprados. `null` = la compra no dice cuántos. */
  quantity: number | null;
  date: Date;
}

/**
 * PRECIO PROMEDIO DE UN ROLLO por ficha, solo con compras ANTERIORES a `hasta`.
 *
 * Es `suma(monto) / suma(rollos)`, NO el promedio de los precios unitarios:
 * $40 por 2 rollos y $22 por 1 dan $20,67 (62 / 3), y promediar los unitarios
 * (20 y 22) daría $21,00, que ignora que de uno compraste el doble.
 *
 * Qué compra NO entra (exactamente estas dos, y ninguna regla de atípicos):
 * - `amount <= 0`: «no hay precio». Es la misma exclusión del precio por tipo
 *   (`filament-type-price.ts`, regla 1): el rollo regalado es un gasto
 *   verdadero pero no una señal de precio, y no es «sospechosamente barato»;
 *   una regla de atípicos borraría también al PLA PURE a $13, que es un dato
 *   real.
 * - `quantity` nula o `<= 0`: no se sabe a cuántos rollos corresponde ese
 *   monto, y sumarlo inflaría el costo por rollo (o dividiría por cero).
 *
 * `hasta` es un límite EXCLUSIVO (`date < hasta`): quien quiera todo un mes
 * pasa el día 1 del mes SIGUIENTE; con el último día del mes pierde las
 * compras de ese día.
 *
 * Una ficha sin ninguna compra válida NO aparece en el mapa: «no hay promedio»
 * no es «vale 0».
 */
export function promedioPorFicha(
  compras: CompraParaPromedio[],
  hasta: Date,
): Map<string, number> {
  const montos = new Map<string, ReturnType<typeof D>[]>();
  const rollos = new Map<string, ReturnType<typeof D>[]>();

  for (const c of compras) {
    if (!(c.date.getTime() < hasta.getTime())) continue;
    if (!(c.amount > 0)) continue;
    if (c.quantity === null || !(c.quantity > 0)) continue;
    montos.set(c.materialId, [...(montos.get(c.materialId) ?? []), D(c.amount)]);
    rollos.set(c.materialId, [...(rollos.get(c.materialId) ?? []), D(c.quantity)]);
  }

  const promedios = new Map<string, number>();
  for (const [materialId, lista] of montos) {
    promedios.set(materialId, toMoney(sum(lista).div(sum(rollos.get(materialId) ?? []))));
  }
  return promedios;
}

/** Un rollo abierto que SÍ se pesó: lo que marca la balanza y lo que pesa el carrete vacío. */
export interface RolloPesado {
  pesoEnBalanza: number;
  pesoDelCarrete: number;
}

export interface FichaValorizable {
  materialId: string;
  /** Rollos sellados (valen el promedio entero). */
  sealed: number;
  /** Rollos abiertos que nadie pesó: no hay dato, valen 0 y se avisan. */
  abiertosSinPesar: number;
  pesados: RolloPesado[];
  /**
   * Promedio de un rollo entero (`promedioPorFicha`). `null` = ninguna compra
   * válida: no hay precio con que valuar y sus rollos van a `sinPrecio`.
   */
  promedioDelRollo: number | null;
  /** Gramos de filamento de un rollo nuevo. */
  gramosDelRollo: number;
}

export interface ValorDelInventario {
  sellados: number;
  abiertosPesados: number;
  total: number;
  /** ROLLOS (no dinero) abiertos que valen 0 por no tener un peso utilizable. */
  rollosSinPesar: number;
  /** ROLLOS (no dinero) que no se pudieron valorar por no tener precio. */
  sinPrecio: number;
}

export function valorDelInventario(fichas: FichaValorizable[]): ValorDelInventario {
  const sellados = [];
  const abiertos = [];
  let rollosSinPesar = 0;
  let sinPrecio = 0;

  for (const f of fichas) {
    if (f.promedioDelRollo === null) {
      sinPrecio += f.sealed + f.abiertosSinPesar + f.pesados.length;
      continue;
    }
    const promedio = D(f.promedioDelRollo);
    sellados.push(promedio.times(f.sealed));
    rollosSinPesar += f.abiertosSinPesar;

    for (const r of f.pesados) {
      const neto = D(r.pesoEnBalanza).minus(r.pesoDelCarrete);
      // TRES casos, y cada uno tiene su test:
      // 1. Neto NEGATIVO (balanza por debajo del carrete) o `gramosDelRollo <= 0`:
      //    dato ROTO. No es un rollo vacío ni uno medido; se trata como SIN PESAR
      //    (vale 0 y se avisa). Recortar con un máximo lo daría por bien medido y
      //    el dueño nunca vería el aviso.
      // 2. Neto EXACTAMENTE 0: es un DATO, no una ausencia. Un carrete
      //    legítimamente vacío vale 0 y está medido; si contara como sin pesar, el
      //    aviso sonaría para siempre con todo bien y el dueño no podría limpiarlo.
      //    El riesgo (tipear el peso del carrete en la casilla de la balanza) se
      //    ataja en la pantalla, donde está quien tipea (Tarea 6), no acá.
      // 3. Neto MAYOR que `gramosDelRollo`: NO se recorta. Vale lo que pesa
      //    (recortar sería estimar, y hay rollos reales de 1,02 kg); el aviso de
      //    «peso mayor que rollo lleno + carrete» lo emite el cierre (Tarea 4).
      //    No «arreglar» el recorte aquí.
      if (neto.isNegative() || !(f.gramosDelRollo > 0)) {
        rollosSinPesar += 1;
        continue;
      }
      abiertos.push(neto.times(promedio).div(f.gramosDelRollo));
    }
  }

  const vSellados = sum(sellados);
  const vAbiertos = sum(abiertos);
  return {
    sellados: toMoney(vSellados),
    abiertosPesados: toMoney(vAbiertos),
    total: toMoney(vSellados.plus(vAbiertos)),
    rollosSinPesar,
    sinPrecio,
  };
}
