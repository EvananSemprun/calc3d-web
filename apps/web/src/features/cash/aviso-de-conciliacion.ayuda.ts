import { cuerpoDeAvisoDeConciliacion, type ConciliacionParaAviso } from '@calc3d/shared';

/**
 * EL 400 DEL CANDADO, para los specs de cableado de las siete puertas.
 *
 * ⚠️ **Lo arma con la MISMA función del servidor** (`cuerpoDeAvisoDeConciliacion`
 * de `shared`), no con un objeto escrito a mano. Si el cuerpo cambiara de forma,
 * estos tests cambian con él en vez de seguir probando un 400 que ya nadie
 * manda — que es exactamente cómo un test se vuelve decorativo.
 */
export const errorDeConciliacion = (
  afectadas: ConciliacionParaAviso[] = [{ id: 'rec1', date: '2026-11-16', status: 'CONFIRMED' }],
) => ({ response: { status: 400, data: cuerpoDeAvisoDeConciliacion(afectadas) } });

/** Un 400 que NO es este candado (el de Zod), para probar que no se confunden. */
export const errorCualquiera = () => ({
  response: { status: 400, data: { message: 'Datos inválidos', statusCode: 400 } },
});
