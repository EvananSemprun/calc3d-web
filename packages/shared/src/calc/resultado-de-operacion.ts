/**
 * EL «RESULTADO DE LA OPERACIÓN» COMO CONTRATO (shared 0.99.0).
 *
 * Es lo que contesta `GET /expenses/resultado?from&to` y lo que el Dashboard
 * DIBUJA. El panel no calcula nada de esto: hasta la fase «filamento como
 * inventario» restaba `ingresos − gastos` con las filas crudas, o sea el
 * filamento el día que se compra, mientras el servidor ya lo restaba cuando se
 * consume. Dos ganancias distintas en la misma app es justo lo que esa fase
 * vino a cerrar.
 */
export interface ResultadoDeOperacion {
  /** Ventas + abonos cobrados en el rango. */
  ingresos: number;
  /**
   * Gastos que no son inversión en equipos, MENOS el filamento que sigue en el
   * estante. Es el mismo criterio que `/printers/recovery`.
   */
  gastosOperativos: number;
  /** `ingresos − gastosOperativos`. */
  utilidad: number;
  /** Lo comprado en el rango que todavía no se consumió: ya está restado de `gastosOperativos`. */
  filamentoEnEstante: number;
  /** Meses cerrados que caen ENTEROS dentro del rango (AAAA-MM): los únicos cuyo consumo se conoce. */
  mesesCompletos: string[];
  /**
   * `true` si parte del rango NO está cubierta por un mes cerrado entero. Ese
   * tramo no prorratea: cuenta 0 de filamento (ni las compras como gasto ni
   * consumo), porque prorratear sería estimar.
   */
  tramosSueltos: boolean;
  /** Los meses (AAAA-MM) del rango cuyo filamento no entró en el número. Para decir QUÉ quedó afuera. */
  mesesSinContar: string[];
  /**
   * ⚠️ Meses cuyo consumo dio NEGATIVO: casi seguro un conteo mal tipeado que
   * fabrica ganancia. Vacío = todo bien.
   */
  mesesConConsumoNegativo: { mes: string; consumo: number }[];
  /**
   * Valor de rollos que recién se pesaron dentro de los meses contados: sube el
   * inventario pero NO es plata nueva. 0 mientras no se haya pesado ningún rollo.
   */
  ajustePorMedicion: number;
}
