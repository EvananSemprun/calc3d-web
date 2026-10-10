/**
 * QUÉ DÍA ES **DONDE ESTÁ EL USUARIO**.
 *
 * ⚠️ `new Date().toISOString().slice(0, 10)` NO sirve para esto: da el día en
 * UTC. En Venezuela (UTC−4) eso significa que **desde las 20:00 y hasta la
 * medianoche, la app cree que ya es mañana**. Se veía en el calendario, que
 * marcaba el 8 siendo las 20:45 del 7, y se colaba en todo lo que arranca
 * "con la fecha de hoy": un abono registrado de noche quedaba fechado al día
 * siguiente, y el último día del mes el Dashboard saltaba a la meta del mes
 * que viene.
 *
 * Ojo con la distinción, porque las dos cosas conviven en el proyecto:
 * - **Guardar y formatear** una fecha ya guardada (entrega, conteo del mes) va
 *   en **UTC**: se almacenan a medianoche UTC y leerlas en la zona local
 *   imprimía el día anterior.
 * - **Preguntar qué día es hoy** va en la zona **local**, que es donde vive
 *   quien mira la pantalla. Para eso es este archivo.
 */

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** Hoy, en la zona del usuario, como `AAAA-MM-DD`. */
export function todayKey(base = new Date()): string {
  return `${base.getFullYear()}-${dosDigitos(base.getMonth() + 1)}-${dosDigitos(base.getDate())}`;
}

/**
 * Formatea un DÍA guardado (entrega, abono, campaña): llega como medianoche UTC,
 * así que se lee en UTC. Con la zona local, en Venezuela mostraba el día anterior.
 * No usar para instantes reales (`settledAt`, `createdAt`): esos van en local.
 */
export function formatStoredDay(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', { timeZone: 'UTC' });
}

/**
 * Un MES guardado (`'2026-09'`) → `'septiembre de 2026'`.
 *
 * Se lee en **UTC** porque un mes se guarda como su primer día a medianoche
 * UTC: en la zona local caería el 31 del mes anterior y diría el mes
 * equivocado — el mismo error que ya imprimió el día previo en los documentos.
 *
 * ⚠️ Esta misma conversión está escrita a mano en otros cuatro lugares
 * (`StockTab`, `Goals`, `materialOptions`); lo nuevo usa esta y lo viejo
 * conviene migrarlo cuando se lo toque.
 */
export function labelMes(month: string): string {
  return new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString('es-VE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** El mes en curso, en la zona del usuario, como `AAAA-MM`. */
export function currentMonthKey(base = new Date()): string {
  return `${base.getFullYear()}-${dosDigitos(base.getMonth() + 1)}`;
}
