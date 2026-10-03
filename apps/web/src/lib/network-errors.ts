/**
 * Qué decirle al usuario cuando la petición no obtuvo NINGUNA respuesta, y
 * cuándo vale la pena reintentar antes de mostrarle el cartel.
 *
 * Todo lo de este archivo es PURO (no toca `window`, `navigator` ni axios), así
 * que se puede probar con valores a mano. `lib/api.ts` es el que le pasa el
 * estado real del navegador.
 *
 * El texto viejo era «¿Está corriendo el backend (pnpm dev:api)?» y se le
 * mostraba al usuario final en producción, donde no puede correr nada: un
 * mensaje que apunta al lugar equivocado es peor que uno genérico.
 */

/** Códigos de axios para «la petición se cortó por tiempo o se canceló». */
export const CODIGO_TIMEOUT = 'ECONNABORTED';
export const CODIGO_CANCELADA = 'ERR_CANCELED';

export interface EstadoDeRed {
  /** `import.meta.env.DEV`: solo en desarrollo tiene sentido hablar del backend local. */
  enDesarrollo: boolean;
  /** `navigator.onLine`: false = el problema está del lado del usuario. */
  enLinea: boolean;
  /** `error.code` de axios, si vino. */
  codigo?: string;
}

/**
 * El mensaje de un fallo SIN respuesta del servidor, distinguiendo la causa.
 *
 * Un solo texto para todo («no se pudo conectar») hace que el usuario no sepa
 * si el problema es su wifi, el servidor dormido o algo roto.
 */
export function mensajeDeRed({ enDesarrollo, enLinea, codigo }: EstadoDeRed): string {
  if (!enLinea) {
    return 'Parece que no tenés conexión a internet. Revisá tu red y volvé a intentar.';
  }
  if (codigo === CODIGO_TIMEOUT || codigo === CODIGO_CANCELADA) {
    return 'El servidor tardó demasiado en responder. Volvé a intentar en unos segundos.';
  }
  if (enDesarrollo) {
    return 'No se pudo conectar con el servidor. ¿Está corriendo el backend (pnpm dev)?';
  }
  return 'No se pudo conectar con el servidor. Probá de nuevo en unos segundos.';
}

/** Cuántos reintentos como máximo, y cuánto se espera antes de cada uno. */
export const ESPERAS_DE_REINTENTO_MS = [1000, 3000] as const;
export const REINTENTOS_MAX = ESPERAS_DE_REINTENTO_MS.length;

export interface IntentoFallido {
  /** El método HTTP de la petición (en cualquier caja). */
  metodo?: string;
  /** `true` si el servidor SÍ contestó algo (un 400 o un 500 no mejora repitiendo). */
  huboRespuesta: boolean;
  /** `error.code` de axios, si vino. */
  codigo?: string;
  /** Cuántos reintentos ya se hicieron de esta misma petición. */
  reintentosHechos: number;
}

/**
 * ⚠️ Solo se reintentan LECTURAS (GET).
 *
 * Reintentar una escritura (POST/PATCH/PUT/DELETE) que se cortó sin respuesta
 * puede duplicar datos: el servidor pudo haberla procesado y haberse caído al
 * contestar, así que un cobro o un alta se registrarían dos veces. Preferimos
 * mostrar el error y que la persona decida.
 *
 * Tampoco se reintenta si hubo respuesta (el error es de la petición, no de la
 * red) ni si la cancelación fue deliberada (`ERR_CANCELED`: lo pidió el propio
 * código al desmontar una pantalla o abortar una consulta).
 */
export function sePuedeReintentar({
  metodo,
  huboRespuesta,
  codigo,
  reintentosHechos,
}: IntentoFallido): boolean {
  if (huboRespuesta) return false;
  if (codigo === CODIGO_CANCELADA) return false;
  if ((metodo ?? 'get').toLowerCase() !== 'get') return false;
  return reintentosHechos < REINTENTOS_MAX;
}

/** La espera (en ms) antes del reintento número `reintentosHechos` (0 = el primero). */
export function esperaDeReintento(reintentosHechos: number): number {
  const indice = Math.min(Math.max(reintentosHechos, 0), ESPERAS_DE_REINTENTO_MS.length - 1);
  return ESPERAS_DE_REINTENTO_MS[indice];
}
