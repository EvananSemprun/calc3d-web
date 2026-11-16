import type { ResultadoDeOperacion } from '@calc3d/shared';

/**
 * LA BRECHA ENTRE EL KPI «GASTOS» Y EL «RESULTADO DE LA OPERACIÓN».
 *
 * Son dos definiciones a propósito: «Gastos» es lo que SE PAGÓ (el filamento el
 * día que se compró) y el resultado resta el filamento cuando se CONSUME. La
 * diferencia es exactamente `filamentoEnEstante`, y **tiene que decirse**: sin
 * esa línea, la resta que el pie nombra no da lo que las dos tarjetas pegadas
 * dejan ver (el dueño leyó «GASTOS $202» y se creyó $202 más pobre).
 *
 * ⚠️ **El pie se dibujaba SOLO con `filamentoEnEstante > 0`, y la brecha existe
 * en las DOS direcciones.** `filamentoEnEstante = comprado(rango) −
 * consumo(meses cerrados enteros del rango)`:
 *
 * - **Positivo**: compraste más de lo que consumiste en el rango. El servidor
 *   resta MENOS que «Gastos», y esa plata sigue en el estante.
 * - **NEGATIVO**: un rango con más consumo que compras (un mes cerrado del
 *   pasado en el que imprimiste lo que habías comprado antes). El servidor resta
 *   **MÁS** que «Gastos», así que el resultado queda por DEBAJO de lo que las dos
 *   tarjetas dejan calcular — y hasta el 16/11 el pie **desaparecía** y nada lo
 *   explicaba. El signo negativo no tenía un solo test.
 * - **0**: no hay brecha y no se dice nada. El silencio es el caso normal.
 *
 * ⚠️ **Y en un rango PARCIAL el texto no puede afirmar «sigue en el estante».**
 * Si hay meses sin contar, X son **todas** las compras de ese tramo porque no hay
 * consumo deducible, no porque el material esté sin usar: pudo haberse impreso
 * entero. La nota de `mesesSinContar` (en `NotasDelResultado`) dice la verdad dos
 * renglones abajo, así que acá el texto honesto es «que todavía no se puede
 * descontar».
 *
 * ⚠️ **Lo que este texto NO cubre, sabido:** con un mes de consumo negativo
 * (conteo mal tipeado) X puede ser mayor que lo comprado en el rango, así que el
 * monto es tan poco confiable como el conteo del que sale. Eso ya lo grita la
 * alerta roja de `NotasDelResultado`, que dice que el resultado está inflado;
 * repetirlo acá sería un segundo cartel sobre la misma plata.
 */
export function textoDeLaBrecha(resultado: ResultadoDeOperacion, money: (n: number) => string): string | null {
  const estante = resultado.filamentoEnEstante;
  if (estante === 0) return null;

  if (estante < 0) {
    return (
      `el resultado resta ${money(-estante)} MÁS que «Gastos»: es filamento que se consumió en este ` +
      'tramo y se había comprado antes, así que no está en lo pagado del tramo'
    );
  }

  // Un tramo sin contar no permite afirmar que el material esté sin usar.
  if (resultado.mesesSinContar.length > 0) {
    return (
      `«Gastos» incluye ${money(estante)} de filamento que todavía no se puede descontar: ` +
      'de ese tramo no hay conteo cerrado, así que su consumo no se conoce'
    );
  }

  return `«Gastos» incluye ${money(estante)} de filamento que sigue en el estante: acá no se resta hasta que se consuma`;
}
