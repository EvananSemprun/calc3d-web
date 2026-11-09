/**
 * ¿La moneda por defecto apunta a una tasa que ya no existe?
 *
 * `Settings.defaultRateLabel` guarda un NOMBRE, no una referencia: si la tasa se
 * renombra o se borra, la configuración queda colgando y **nada falla**. El panel se ve
 * bien, la API devuelve `rate: null` y la tienda publica sin equivalente en bolívares.
 *
 * ⚠️ Pasó de verdad: quedó en «Bolívar (BCV)» mientras las tasas se llamaban «BCV
 * Dólar», y la tienda estuvo meses sin mostrar bolívares sin que nadie lo notara.
 *
 * ⚠️ Con la lista de tasas VACÍA no avisa: ahí el mensaje correcto es «agrega una», que
 * la pantalla ya muestra, y dos carteles a la vez no ayudan a nadie. Tampoco avisa si
 * no hay moneda por defecto: trabajar solo en dólares es una decisión válida.
 */
export function monedaPorDefectoFantasma(
  defaultRateLabel: string | null | undefined,
  rates: readonly { label: string }[],
): boolean {
  if (!defaultRateLabel) return false;
  if (rates.length === 0) return false;
  return !rates.some((r) => r.label === defaultRateLabel);
}
