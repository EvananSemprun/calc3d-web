/**
 * ¿ESTE MOVIMIENTO INVALIDA UNA CONCILIACIÓN? (2026-11-12, fase B tarea 8)
 *
 * El dueño concilia la caja (cuenta la plata real y la compara con la esperada)
 * y después carga un movimiento con fecha anterior. La conciliación queda
 * mintiendo y nadie avisa: una CONFIRMADA congela sus importes y solo muestra
 * `stale` dentro de la fila expandida; una DRAFT no congela nada y **cambia en
 * silencio**. Las dos avisan.
 *
 * ⚠️ **La regla vive acá y no en el servicio**, igual que
 * `anulacionNecesitaConfirmacion`: el panel tiene que poder mostrar la
 * advertencia sin adivinarla, y si el servidor y la pantalla la escribieran
 * por separado, un día dirían cosas distintas.
 *
 * ⚠️ **El esperado es GLOBAL, no por cuenta** (ver `escribir-conciliacion`): un
 * movimiento de cualquier cuenta —o sin cuenta— entra en el esperado de TODA
 * conciliación con fecha igual o posterior. Por eso acá no se mira la cuenta:
 * filtrar por ella dejaría pasar justo los ~100 movimientos históricos que no
 * tienen cuenta.
 *
 * Pura: sin Nest ni base. La consulta de las conciliaciones la hace el servidor.
 */

export type EstadoConciliacionAviso = 'DRAFT' | 'CONFIRMED' | 'VOID';

/** Los estados válidos, para validar lo que llega del servidor sin repetirlos. */
export const ESTADOS_DEL_AVISO: readonly EstadoConciliacionAviso[] = ['DRAFT', 'CONFIRMED', 'VOID'];

export interface ConciliacionParaAviso {
  id: string;
  /** Fecha de negocio de la conciliación (el corte del esperado). */
  date: Date | string;
  status: EstadoConciliacionAviso;
}

/**
 * Día `AAAA-MM-DD` de una FECHA DE NEGOCIO.
 *
 * Una `Date` de negocio se guarda a medianoche UTC y ya ES el día elegido: se
 * lee por UTC. Pasarla por la hora de Caracas la correría un día para atrás.
 */
function dia(d: Date | string): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : d.slice(0, 10);
}

/**
 * Las conciliaciones que un movimiento con esas fechas deja desactualizadas.
 *
 * - Cuenta si la fecha es **igual o anterior** a la de la conciliación: el
 *   esperado se corta con `<=`, así que el mismo día entra.
 * - Una fecha POSTERIOR no pide nada: queda fuera del esperado.
 * - Una conciliación ANULADA ya no habla de la caja de nadie.
 * - `fechas` es una lista porque EDITAR mueve un movimiento: lo que sale de
 *   su día viejo y lo que entra en el nuevo cambian ambos esperados.
 */
export function conciliacionesQueSeInvalidan(
  fechas: ReadonlyArray<Date | string>,
  conciliaciones: ReadonlyArray<ConciliacionParaAviso>,
): ConciliacionParaAviso[] {
  const dias = fechas.map(dia);
  return conciliaciones.filter(
    (c) => c.status !== 'VOID' && dias.some((d) => d <= dia(c.date)),
  );
}

/** El texto del 400. Dice QUÉ pasó y CÓMO seguir. */
export function mensajeDeConciliacionAfectada(
  afectadas: ReadonlyArray<ConciliacionParaAviso>,
): string {
  const lista = afectadas
    .map(
      (c) =>
        `${dia(c.date)} (${c.status === 'CONFIRMED' ? 'confirmada' : 'borrador'})`,
    )
    .join(', ');
  const hayConfirmada = afectadas.some((c) => c.status === 'CONFIRMED');
  const hayBorrador = afectadas.some((c) => c.status === 'DRAFT');
  const efectos = [
    hayConfirmada ? 'una confirmada quedará desactualizada' : null,
    hayBorrador ? 'un borrador cambiará su esperado sin avisar' : null,
  ]
    .filter(Boolean)
    .join(' y ');
  return (
    `Este movimiento tiene fecha igual o anterior a ${afectadas.length === 1 ? 'una conciliación' : `${afectadas.length} conciliaciones`} de caja: ${lista}. ` +
    `Si lo guardas, ${efectos}. ` +
    'Vuelve a intentarlo confirmando; después anula la conciliación y crea otra para que vuelva a decir la verdad.'
  );
}

/**
 * UNA CONCILIACIÓN AFECTADA, tal como VIAJA en el 400 (2026-11-17).
 *
 * `date` ya es el día `AAAA-MM-DD`: el servidor lo recorta antes de mandarlo
 * para que el panel no tenga que decidir otra vez si una `Date` se lee por UTC
 * o por la hora de Caracas —la decisión que ya está tomada en `dia()`—.
 */
export interface ConciliacionAfectadaEnElAviso {
  id: string;
  date: string;
  status: EstadoConciliacionAviso;
}

/**
 * EL CUERPO DEL 400 del candado blando, y por qué está acá.
 *
 * El servidor lo ARMA con `cuerpoDeAvisoDeConciliacion` y el panel lo LEE con
 * `leerAvisoDeConciliacion`. Las dos mitades salen de este archivo a propósito:
 * el panel tiene que reconocer este 400 entre todos los demás para dibujar
 * «Guardar igual», y lo reconoce por la clave `conciliacionesAfectadas`. Con la
 * clave escrita a mano en el panel, renombrarla en el servidor **apagaría el
 * botón sin romper ningún test** y el formulario volvería a ser un callejón sin
 * salida — en silencio, que es como este bug llegó la primera vez.
 */
export interface CuerpoDeAvisoDeConciliacion {
  statusCode: 400;
  error: 'Bad Request';
  /** El texto que el panel MUESTRA. Lo escribe `mensajeDeConciliacionAfectada`. */
  message: string;
  conciliacionesAfectadas: ConciliacionAfectadaEnElAviso[];
}

/** El cuerpo del 400 a partir de las conciliaciones afectadas. */
export function cuerpoDeAvisoDeConciliacion(
  afectadas: ReadonlyArray<ConciliacionParaAviso>,
): CuerpoDeAvisoDeConciliacion {
  return {
    statusCode: 400,
    error: 'Bad Request',
    message: mensajeDeConciliacionAfectada(afectadas),
    // Para que el panel ofrezca "anula esta conciliación" sin adivinar cuál.
    conciliacionesAfectadas: afectadas.map((c) => ({
      id: c.id,
      date: dia(c.date),
      status: c.status,
    })),
  };
}

/**
 * ¿ESTE cuerpo de error es el aviso de conciliación? Si lo es, lo devuelve
 * tipado; si no, `null`.
 *
 * Pura y defensiva: recibe el `error.response.data` de axios, que es `unknown`
 * de verdad (puede ser el 400 de Zod, un HTML de un proxy, o `undefined` si no
 * hubo respuesta). Lo que lo identifica es la **lista**, no el texto: el
 * mensaje está escrito para una persona y cambiarlo no debe apagar el botón.
 *
 * ⚠️ Una lista VACÍA no es el aviso. El servidor nunca manda el 400 sin
 * afectadas (`if (afectadas.length === 0) return`), y aceptarla dibujaría un
 * aviso sin nada que contar.
 */
export function leerAvisoDeConciliacion(
  cuerpo: unknown,
): CuerpoDeAvisoDeConciliacion | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const { message, conciliacionesAfectadas } = cuerpo as {
    message?: unknown;
    conciliacionesAfectadas?: unknown;
  };
  if (!Array.isArray(conciliacionesAfectadas)) return null;
  const afectadas = conciliacionesAfectadas.filter(
    (c): c is ConciliacionAfectadaEnElAviso =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as { id?: unknown }).id === 'string' &&
      typeof (c as { date?: unknown }).date === 'string' &&
      ESTADOS_DEL_AVISO.includes((c as { status?: unknown }).status as EstadoConciliacionAviso),
  );
  // Sin ninguna afectada válida no es el aviso: ni la lista vacía (que el
  // servidor nunca manda) ni una lista de basura dibujan «Guardar igual».
  if (afectadas.length === 0) return null;
  return {
    statusCode: 400,
    error: 'Bad Request',
    // Sin texto del servidor se arma el mismo con la regla de `shared`, que es
    // la única que sabe escribirlo. Nunca una frase inventada en el panel.
    message: typeof message === 'string' && message.trim() ? message : mensajeDeConciliacionAfectada(afectadas),
    conciliacionesAfectadas: afectadas,
  };
}
