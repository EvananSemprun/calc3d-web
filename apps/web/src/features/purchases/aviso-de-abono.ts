/**
 * QUÉ AVISAR SOBRE EL MONTO DE UN ABONO, antes de guardarlo.
 *
 * El diálogo "Abonar" tiene TRES situaciones que no son errores pero tampoco
 * son lo normal, y hasta el 2026-10-10 vivían como tres ternarios sueltos en el
 * JSX. Una combinación de las condiciones **no caía en ninguno** y pasaba en
 * silencio: tomar del saldo a favor más de lo que la factura debe. Eso es
 * exactamente lo que pasa cuando se escriben condiciones independientes al lado
 * de un `if` y nadie las mira juntas, así que acá hay UNA sola función que
 * decide qué decir, con sus casos cubiertos.
 *
 * ⚠️ **Ninguno de los avisos es una guarda que corte, menos uno:** solo
 * `SIN_SALDO` es imposible (el servidor lo rechaza igual). Los otros dos son
 * operaciones legítimas —la plata salió o ya salió— y el aviso existe para que
 * no pasen sin que el dueño las vea.
 *
 * Es pura a propósito: el JSX solo dibuja lo que devuelve.
 */

/** Al centavo: la precisión con la que el motor guarda la plata (`toCents`). */
const alCentavo = (x: number) => Math.round(x * 100) / 100;

export interface AbonoAEvaluar {
  /** Lo que se está abonando. */
  monto: number;
  /**
   * Lo que falta pagar de ESTA factura (el `saldo` de `invoiceTotals`, que
   * nunca es negativo). Puede ser 0: una factura ya paga se puede abonar.
   */
  falta: number;
  /**
   * Lo disponible en la factura de ORIGEN, o `null` cuando se paga con plata.
   *
   * ⚠️ `null` y `0` son cosas distintas: `null` es "con plata" y 0 es "elegí
   * una factura de origen que no tiene nada". Con un solo valor para las dos,
   * un origen agotado se avisaría como si fuera un pago en efectivo.
   */
  disponible: number | null;
}

export type AvisoDeAbono =
  /**
   * Toma MÁS saldo del que la factura de origen tiene. Lo único que no se
   * puede: el servidor lo rechaza (`SIN_SALDO` de `evaluarUsoDeSaldo`).
   */
  | { clase: 'SIN_SALDO'; tomado: number; disponible: number }
  /** Paga con plata más de lo que falta: la factura queda pagada de más. */
  | { clase: 'PAGA_DE_MAS'; deMas: number }
  /**
   * Toma del saldo más de lo que esta factura debe. **Se puede**: la plata no
   * se pierde ni se inventa. Lo que pasa es que el sobrante **salta** de la
   * factura que lo tenía a esta, y eso hay que verlo antes de confirmar.
   */
  | {
      clase: 'SALDO_QUE_SALTA';
      tomado: number;
      falta: number;
      /** Lo que va a quedar a favor en ESTA factura. */
      quedaAFavor: number;
      /** La factura no debía nada: el saldo tomado salta entero. */
      yaEstabaPaga: boolean;
    };

/**
 * `null` = nada que avisar.
 *
 * ⚠️ **El orden importa.** `SIN_SALDO` gana sobre `SALDO_QUE_SALTA`: si el
 * monto no existe en el origen, decirle al dueño cuánto le va a quedar a favor
 * es hablarle de una plata que no hay, y el botón está apagado igual.
 *
 * ⚠️ **Se compara AL CENTAVO.** Restar dos números que vienen de la base da
 * residuos de coma flotante (2,9 − 2,7 = 0,2000000000000002), y sin redondear
 * el cartel aparecería diciendo "quedan $0,00 a favor" en un abono exacto —el
 * peor aviso posible, el que sale siempre y entrena a no leerlos.
 */
export function avisoDeAbono({ monto, falta, disponible }: AbonoAEvaluar): AvisoDeAbono | null {
  const tomado = alCentavo(monto);
  const loQueFalta = alCentavo(falta);

  if (disponible != null) {
    const hay = alCentavo(disponible);
    if (tomado > hay) return { clase: 'SIN_SALDO', tomado, disponible: hay };

    const quedaAFavor = alCentavo(tomado - loQueFalta);
    if (quedaAFavor <= 0) return null;
    return {
      clase: 'SALDO_QUE_SALTA',
      tomado,
      falta: loQueFalta,
      quedaAFavor,
      yaEstabaPaga: loQueFalta <= 0,
    };
  }

  const deMas = alCentavo(tomado - loQueFalta);
  if (deMas <= 0) return null;
  return { clase: 'PAGA_DE_MAS', deMas };
}
