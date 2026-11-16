import type { PesoMedido, TipoDeCarrete } from '@calc3d/shared';

/**
 * EL PESO DE LOS ROLLOS EMPEZADOS, del lado de la pantalla.
 *
 * Un rollo «En uso» o «Por acabarse» se pesa en la balanza y se le resta el
 * carrete vacío: lo que queda es el filamento. Nada se estima (regla del
 * dueño): lo que no está medido vale 0 y se avisa.
 *
 * ⚠️ Lo que se guarda lo calcula el SERVIDOR (copia el peso del carrete del
 * catálogo y resta). Este archivo solo arma lo que se MANDA y una PREVIA para
 * que un carrete equivocado se note al escribir. El criterio de «sin pesar» es
 * el del servidor (`pesoACongelar` / `pesosDelMes`): sin balanza, sin carrete,
 * o balanza por debajo del carrete. Y una casilla admite pesar UN solo rollo.
 */

export type Casilla = 'inUse' | 'running';

/** Valor del selector para «Sin carrete» (se elige a propósito: no es lo mismo que no haber elegido). */
export const SIN_CARRETE = 'sin';

/**
 * Lo que se escribió de UNA casilla. `balanza` 0 = vacío (la casilla es un
 * `NumberInput`). `carrete`: '' = no se tocó (rige el del mes pasado, si hay),
 * `SIN_CARRETE` = «Sin carrete», o el id de un tipo.
 */
export interface PesoEscrito {
  balanza: number;
  carrete: string;
}

export type PesosEscritos = Record<string, Partial<Record<Casilla, PesoEscrito>>>;

export type MotivoSinPesar = 'sin-balanza' | 'sin-carrete' | 'bajo-el-carrete';

export type LecturaDeCasilla =
  | { estado: 'sin-rollos' }
  | { estado: 'pesado'; gramos: number; carrete: TipoDeCarrete }
  | { estado: 'sin-pesar'; motivo: MotivoSinPesar; carrete?: TipoDeCarrete };

/**
 * El carrete que rige para una casilla: lo que se eligió ahora y, si todavía no
 * se tocó, lo que se eligió el mes pasado para ESA ficha y ESA casilla. Es la
 * única preselección, y solo existe si el dueño la hizo antes: jamás se deduce
 * de la compra («con carrete», «recarga»), que casi siempre no lo dice.
 *
 * Devuelve '' (nada elegido), `SIN_CARRETE` o un id que existe en el catálogo.
 */
export function carreteEfectivo(
  escrito: PesoEscrito | undefined,
  previo: string | null | undefined,
  tipos: readonly TipoDeCarrete[],
): string {
  const elegido = escrito?.carrete ?? '';
  if (elegido === SIN_CARRETE) return SIN_CARRETE;
  const id = elegido !== '' ? elegido : (previo ?? '');
  return tipos.some((t) => t.id === id) ? id : '';
}

export function leerCasilla(
  rollos: number,
  escrito: PesoEscrito | undefined,
  previo: string | null | undefined,
  tipos: readonly TipoDeCarrete[],
): LecturaDeCasilla {
  if (rollos <= 0) return { estado: 'sin-rollos' };
  if (!escrito || !(escrito.balanza > 0)) return { estado: 'sin-pesar', motivo: 'sin-balanza' };
  const id = carreteEfectivo(escrito, previo, tipos);
  const carrete = tipos.find((t) => t.id === id);
  if (!carrete) return { estado: 'sin-pesar', motivo: 'sin-carrete' };
  const gramos = escrito.balanza - carrete.gramos;
  // Por debajo del carrete el dato está roto: el servidor lo guarda sin gramos.
  if (gramos < 0) return { estado: 'sin-pesar', motivo: 'bajo-el-carrete', carrete };
  return { estado: 'pesado', gramos, carrete };
}

/** Rollos empezados de una casilla que valdrán 0: todos, salvo UNO si se pesó. */
export function rollosSinPesarDeCasilla(rollos: number, lectura: LecturaDeCasilla): number {
  if (lectura.estado === 'sin-rollos') return 0;
  return lectura.estado === 'pesado' ? rollos - 1 : rollos;
}

/**
 * Lo ya guardado de cada ficha, como lo que se «escribió»: así una casilla pesada
 * aparece con su peso al reabrir un mes y el aviso cuenta la verdad. `null` = esa
 * casilla no se pesó. Un tipo de carrete ausente se siembra como «Sin carrete»
 * EXPLÍCITO: vacío caería en el carrete del mes pasado y re-enviaría un dato
 * distinto del guardado.
 */
export function sembrarPesos(
  fichas: readonly {
    materialId: string;
    pesosGuardados: { inUse: PesoMedido | null; running: PesoMedido | null };
  }[],
): PesosEscritos {
  const sembrados: PesosEscritos = {};
  for (const f of fichas) {
    for (const casilla of ['inUse', 'running'] as const) {
      const p = f.pesosGuardados?.[casilla];
      if (!p || p.pesoBalanza === null) continue;
      sembrados[f.materialId] = {
        ...sembrados[f.materialId],
        [casilla]: { balanza: p.pesoBalanza, carrete: p.carreteTipoId ?? SIN_CARRETE },
      };
    }
  }
  return sembrados;
}

export interface FichaPesable {
  materialId: string;
  inUse: number;
  running: number;
  carretesPrevios: { inUse: string | null; running: string | null } | null;
}

/** Cuántos rollos empezados quedarían sin pesar si se cerrara AHORA con lo escrito. */
export function contarSinPesar(
  fichas: readonly FichaPesable[],
  rollosDe: (f: FichaPesable) => { inUse: number; running: number },
  pesos: PesosEscritos,
  tipos: readonly TipoDeCarrete[],
): number {
  let total = 0;
  for (const f of fichas) {
    const r = rollosDe(f);
    for (const casilla of ['inUse', 'running'] as const) {
      const lectura = leerCasilla(r[casilla], pesos[f.materialId]?.[casilla], f.carretesPrevios?.[casilla], tipos);
      total += rollosSinPesarDeCasilla(r[casilla], lectura);
    }
  }
  return total;
}

/**
 * Lo que viaja en el cierre para una casilla. `undefined` = NO se tocó: la clave
 * no se manda y el servidor conserva lo que ya hubiera guardado (reabrir un mes y
 * re-cerrarlo no debe borrar pesos). Escribir y después borrar la balanza SÍ se
 * manda, como `null`: es la forma explícita de limpiar.
 */
export function pesoParaCerrar(
  escrito: PesoEscrito | undefined,
  previo: string | null | undefined,
  tipos: readonly TipoDeCarrete[],
): PesoMedido | undefined {
  if (!escrito) return undefined;
  // Un id elegido o sembrado se manda TAL CUAL: el servidor lo valida contra el catálogo. Pasarlo
  // por `carreteEfectivo` lo borraría (null) si los tipos todavía no cargaron al cerrar.
  const id =
    escrito.carrete !== '' && escrito.carrete !== SIN_CARRETE
      ? escrito.carrete
      : carreteEfectivo(escrito, previo, tipos);
  return {
    pesoBalanza: escrito.balanza > 0 ? Math.round(escrito.balanza) : null,
    carreteTipoId: id === '' || id === SIN_CARRETE ? null : id,
  };
}
