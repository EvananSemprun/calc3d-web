import type { InvoiceLine } from './api';

/**
 * EL PRECIO QUE TE COBRARON, contra el que pediste.
 *
 * ⚠️ **Un precio distinto cambia el TOTAL de la factura**: pediste 10 a $7 y te
 * facturaron $7,50, y la factura pasa de $70 a $73. Un número de plata que se
 * mueve sin que la pantalla diga por qué miente de la peor manera, la que no se
 * nota — así que acá no se decide si avisar, se decide **qué** decir.
 *
 * Son funciones puras a propósito: la pantalla solo dibuja lo que devuelven.
 */

/** Al centésimo de centavo, la misma precisión con la que redondea el motor. */
const CENTESIMO_DE_CENTAVO = 10000;
const alCentesimo = (x: number) => Math.round(x * CENTESIMO_DE_CENTAVO) / CENTESIMO_DE_CENTAVO;

export interface AvisoDePrecio {
  /** Te cobraron MÁS de lo que pediste. */
  masCaro: boolean;
  /** La diferencia por unidad, con signo (positiva = más caro). */
  porUnidad: number;
  /** Lo que esa diferencia suma (o resta) en ESTA entrega. */
  enEstaEntrega: number;
}

/**
 * Qué avisar ANTES de guardar la recepción. `null` = nada que avisar.
 *
 * ⚠️ **Se compara redondeando a 4 decimales.** Un precio que vuelve de la base
 * como 7,4999999 es el mismo 7,50 que se informó: sin redondear, el cartel
 * aparecería siempre y dejaría de significar algo.
 *
 * ⚠️ `informado == null` es "no informó nada" y se usa el de la línea; **0 no
 * lo es** —un rollo regalado es un dato verdadero— y SÍ se avisa.
 */
export function avisoDePrecio(
  pedido: number,
  informado: number | null | undefined,
  cantidad: number,
): AvisoDePrecio | null {
  if (informado == null) return null;

  const diferencia = alCentesimo(informado - pedido);
  if (diferencia === 0) return null;

  return {
    masCaro: diferencia > 0,
    porUnidad: diferencia,
    enEstaEntrega: alCentesimo(diferencia * cantidad),
  };
}

/** Un precio real que la lista muestra, con cuántas unidades entraron a ese precio. */
export interface PrecioRealDeEntrega {
  quantity: number;
  unitPrice: number;
}

/**
 * Los precios con los que la línea recibió mercadería y **no coinciden con el
 * pedido**, agrupados por precio y en el orden en que llegaron.
 *
 * ⚠️ **Las que llegaron al precio pactado no se muestran**: son el caso normal
 * y repetir el mismo número al lado del pedido es ruido que entrena a no leer.
 * Y una entrega de 0 unidades tampoco: no dice a cuánto salió la unidad.
 */
export function preciosRealesDeLaLinea(l: InvoiceLine): PrecioRealDeEntrega[] {
  const pedido = alCentesimo(l.unitPrice);
  const porPrecio = new Map<number, PrecioRealDeEntrega>();

  for (const r of l.recepciones) {
    if (r.quantity <= 0) continue;
    const precio = alCentesimo(r.unitPrice);
    if (precio === pedido) continue;

    const ya = porPrecio.get(precio);
    if (ya) ya.quantity += r.quantity;
    else porPrecio.set(precio, { quantity: r.quantity, unitPrice: precio });
  }

  return [...porPrecio.values()];
}
