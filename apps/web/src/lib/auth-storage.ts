/**
 * Dónde viven los tokens de sesión y las preferencias del login.
 *
 * El checkbox «Recuérdame» decide el almacén:
 * - marcado   → `localStorage`: la sesión sobrevive a cerrar el navegador.
 * - desmarcado → `sessionStorage`: la sesión muere al cerrar el navegador.
 *
 * ⚠️ Toda LECTURA tiene que mirar los DOS almacenes y todo BORRADO tiene que
 * limpiar los DOS. Si solo se mirara el que dice la preferencia, desmarcar
 * «Recuérdame» dejaría el token viejo en `localStorage` y la sesión no moriría
 * de verdad: la función parecería andar y no andaría.
 *
 * Los helpers de abajo son PUROS: reciben los almacenes por parámetro, así que
 * se pueden probar con dos objetos de mentira sin navegador. Las funciones de
 * conveniencia (`leerToken`, `guardarTokens`, …) son las que atan esos helpers
 * al navegador real.
 */

/** Lo mínimo que usamos de `localStorage`/`sessionStorage` (o de un doble de prueba). */
export interface AlmacenWeb {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

/** El par de almacenes del navegador. `null` = no disponible (modo privado, bloqueado). */
export interface Almacenes {
  /** Sobrevive a cerrar el navegador (`localStorage`). */
  persistente: AlmacenWeb | null;
  /** Muere al cerrar el navegador (`sessionStorage`). */
  deSesion: AlmacenWeb | null;
}

export const CLAVE_TOKEN = 'calc3d_token';
export const CLAVE_REFRESH = 'calc3d_refresh';
/** Preferencia del checkbox «Recuérdame». Siempre persistente: es una preferencia, no una credencial. */
export const CLAVE_RECORDARME = 'calc3d_recordarme';
/** Último correo con el que se entró bien. NUNCA la contraseña: de eso se encarga el gestor del navegador. */
export const CLAVE_ULTIMO_CORREO = 'calc3d_ultimo_correo';

// ─────────────────────────────── Helpers puros ───────────────────────────────

/**
 * Lee una clave de los DOS almacenes (primero el persistente).
 *
 * Buscar en los dos es lo que hace que la preferencia pueda cambiar sin dejar
 * sesiones zombis: el token está en uno o en el otro, nunca hay que adivinar.
 */
export function leerDeAlmacenes(almacenes: Almacenes, clave: string): string | null {
  return (
    leerSeguro(almacenes.persistente, clave) ?? leerSeguro(almacenes.deSesion, clave) ?? null
  );
}

/**
 * Escribe una clave en el almacén que corresponde a la preferencia y la BORRA
 * del otro, para que no queden dos copias (una vieja se leería primero).
 */
export function escribirEnAlmacenes(
  almacenes: Almacenes,
  clave: string,
  valor: string,
  recordar: boolean,
): void {
  const destino = recordar ? almacenes.persistente : almacenes.deSesion;
  const otro = recordar ? almacenes.deSesion : almacenes.persistente;
  borrarSeguro(otro, clave);
  escribirSeguro(destino, clave, valor);
}

/** Borra una clave de los DOS almacenes. Siempre los dos, sin mirar la preferencia. */
export function borrarDeAlmacenes(almacenes: Almacenes, clave: string): void {
  borrarSeguro(almacenes.persistente, clave);
  borrarSeguro(almacenes.deSesion, clave);
}

/** Lee el par de tokens mirando los dos almacenes. */
export function leerTokens(almacenes: Almacenes): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  return {
    accessToken: leerDeAlmacenes(almacenes, CLAVE_TOKEN),
    refreshToken: leerDeAlmacenes(almacenes, CLAVE_REFRESH),
  };
}

/** Guarda el par de tokens en el almacén que pide la preferencia y limpia el otro. */
export function guardarTokensEn(
  almacenes: Almacenes,
  accessToken: string,
  refreshToken: string,
  recordar: boolean,
): void {
  escribirEnAlmacenes(almacenes, CLAVE_TOKEN, accessToken, recordar);
  escribirEnAlmacenes(almacenes, CLAVE_REFRESH, refreshToken, recordar);
}

/** Borra el par de tokens de los DOS almacenes. */
export function borrarTokensDe(almacenes: Almacenes): void {
  borrarDeAlmacenes(almacenes, CLAVE_TOKEN);
  borrarDeAlmacenes(almacenes, CLAVE_REFRESH);
}

/** La preferencia «Recuérdame». Por defecto `true`, para no cambiarle el comportamiento a nadie. */
export function leerRecordarmeDe(almacenes: Almacenes): boolean {
  const guardado = leerDeAlmacenes(almacenes, CLAVE_RECORDARME);
  if (guardado === null) return true;
  return guardado === '1';
}

export function guardarRecordarmeEn(almacenes: Almacenes, recordar: boolean): void {
  // La preferencia vive SIEMPRE en el almacén persistente: tiene que sobrevivir
  // al cierre del navegador incluso cuando la sesión no.
  escribirSeguro(almacenes.persistente, CLAVE_RECORDARME, recordar ? '1' : '0');
}

/** El último correo con el que se entró bien (null si no hay). */
export function leerUltimoCorreoDe(almacenes: Almacenes): string | null {
  const valor = leerDeAlmacenes(almacenes, CLAVE_ULTIMO_CORREO);
  return valor && valor.trim() ? valor : null;
}

export function guardarUltimoCorreoEn(almacenes: Almacenes, correo: string): void {
  const limpio = correo.trim();
  if (!limpio) return;
  escribirSeguro(almacenes.persistente, CLAVE_ULTIMO_CORREO, limpio);
}

// ───────── Acceso al navegador (todo envuelto: en modo privado puede lanzar) ─────────

function leerSeguro(almacen: AlmacenWeb | null, clave: string): string | null {
  if (!almacen) return null;
  try {
    return almacen.getItem(clave);
  } catch {
    // En modo privado (o con el almacenamiento bloqueado) el acceso lanza.
    return null;
  }
}

function escribirSeguro(almacen: AlmacenWeb | null, clave: string, valor: string): void {
  if (!almacen) return;
  try {
    almacen.setItem(clave, valor);
  } catch {
    // Sin almacenamiento la app sigue andando: solo no recuerda nada.
  }
}

function borrarSeguro(almacen: AlmacenWeb | null, clave: string): void {
  if (!almacen) return;
  try {
    almacen.removeItem(clave);
  } catch {
    // Ídem: no poder borrar no debe tumbar el cierre de sesión.
  }
}

/** Devuelve el almacén del navegador o `null` si ni se puede nombrar (modo privado estricto). */
function almacenDelNavegador(obtener: () => Storage): AlmacenWeb | null {
  try {
    return obtener();
  } catch {
    return null;
  }
}

/** Los almacenes reales del navegador. */
export const almacenesDelNavegador: Almacenes = {
  persistente: almacenDelNavegador(() => window.localStorage),
  deSesion: almacenDelNavegador(() => window.sessionStorage),
};

// ───────── Conveniencias atadas al navegador (las que usa la app) ─────────

export const leerTokensDelNavegador = () => leerTokens(almacenesDelNavegador);
export const guardarTokens = (accessToken: string, refreshToken: string, recordar: boolean) =>
  guardarTokensEn(almacenesDelNavegador, accessToken, refreshToken, recordar);
export const borrarTokens = () => borrarTokensDe(almacenesDelNavegador);
export const leerRecordarme = () => leerRecordarmeDe(almacenesDelNavegador);
export const guardarRecordarme = (recordar: boolean) =>
  guardarRecordarmeEn(almacenesDelNavegador, recordar);
export const leerUltimoCorreo = () => leerUltimoCorreoDe(almacenesDelNavegador);
export const guardarUltimoCorreo = (correo: string) =>
  guardarUltimoCorreoEn(almacenesDelNavegador, correo);
