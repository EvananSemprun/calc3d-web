import { monthStart, type PrecioPorTipo } from '@calc3d/shared';
import type { MaterialItem } from './useCatalogData';

/**
 * EL SELECTOR DE FILAMENTO (2026-10-10, decisión del dueño).
 *
 * Hasta ese día la calculadora obligaba a elegir una FICHA (un color). Medido
 * en producción: el PLA tiene 47 fichas y casi todas valen 20, así que el color
 * no compraba precisión; entre TIPOS sí (PLA PURE 13 contra PLA SILK 22,84).
 * Por eso el selector ofrece dos grupos: **el promedio del tipo** (lo que se
 * elige casi siempre) y **la ficha puntual**, que sigue disponible.
 *
 * ⚠️ Acá NO se calcula ningún promedio: lo deriva el servidor con
 * `preciosPorTipo` (shared) sobre las compras. Esta pantalla solo elige.
 */

/** Una opción del selector: un TIPO (su promedio) o una FICHA (un color). */
export interface OpcionDeFilamento {
  /** `'tipo:PLA'` o `'ficha:<id>'`. La cadena vacía NO es una opción: es "a mano". */
  key: string;
  /** Lo que se lee en el desplegable. */
  label: string;
  /** Lo que queda como nombre del filamento del trabajo, y sale en la cotización. */
  name: string;
  rollPrice: number;
  rollGrams: number;
}

export interface OpcionesDeFilamento {
  porTipo: OpcionDeFilamento[];
  porFicha: OpcionDeFilamento[];
}

/** `'tipo:PLA'`. Prefijada para que un tipo no pueda chocar con el id de una ficha. */
export const claveDeTipo = (type: string): string => `tipo:${type}`;

/**
 * Las dos listas del desplegable.
 *
 * ⚠️ **El orden de los tipos es el que manda el servidor** (de más a menos
 * rollos comprados): reordenarlos acá sería una segunda definición de "el tipo
 * que más se usa", y el primero es el que la calculadora elige al abrirse.
 */
export function opcionesDeFilamento(
  tipos: PrecioPorTipo[] | undefined,
  fichas: MaterialItem[] | undefined,
  money: (n: number) => string,
): OpcionesDeFilamento {
  const porTipo = (tipos ?? []).map((t) => ({
    key: claveDeTipo(t.type),
    // Se dice en cuántos rollos se apoya: un promedio de 1 rollo y uno de 47 no
    // merecen la misma confianza, y el número lo dice sin explicar nada.
    label: `${t.type} — promedio ${money(t.rollPrice)} · ${t.rolls} ${t.rolls === 1 ? 'rollo' : 'rollos'}`,
    // "(promedio)" va en el NOMBRE y no solo en la etiqueta: ese nombre viaja al
    // presupuesto y a la cotización del cliente. "PLA" a secas afirmaría un
    // rollo concreto que nadie eligió.
    name: `${t.type} (promedio)`,
    rollPrice: t.rollPrice,
    rollGrams: t.rollGrams,
  }));

  const porFicha = (quotableMaterials(fichas) ?? []).map((m) => ({
    key: `ficha:${m.id}`,
    label: `${materialLabel(m)} — ${money(Number(m.rollPrice))}`,
    name: m.name,
    rollPrice: Number(m.rollPrice),
    rollGrams: m.rollGrams,
  }));

  return { porTipo, porFicha };
}

/**
 * La opción elegida, buscada en los dos grupos.
 *
 * Con la clave vacía (= "precio escrito a mano") devuelve `undefined`, que es
 * lo que `pickFilament` necesita para no pisar lo que el dueño escribió.
 *
 * ⚠️ **No hay un `if (!key) return undefined` arriba, y es a propósito**:
 * ninguna opción tiene la clave vacía, así que `find` ya devuelve `undefined`
 * por el camino normal. Ese `if` se escribió y se borró el mismo día porque
 * **ninguna mutación lo tumbaba** — era código muerto, igual que el
 * `if (guardado === TODOS)` de `tipoSeguro`. El test de la clave vacía se
 * queda: fija el comportamiento, que es lo que importa.
 */
export function buscarOpcion(ops: OpcionesDeFilamento, key: string): OpcionDeFilamento | undefined {
  return [...ops.porTipo, ...ops.porFicha].find((o) => o.key === key);
}

/**
 * Qué SIGNIFICA el precio que está en el campo.
 *
 * ⚠️ Vale la pena el renglón porque **la exclusión del rollo regalado es
 * invisible**: el promedio del PLA no coincide con el que daría dividir el
 * gasto total entre todos sus rollos, y sin explicación se lee como un error.
 */
export function textoDeOrigen(tipos: PrecioPorTipo[] | undefined, key: string): string {
  // ⚠️ Sin `if (!key)` arriba: la clave vacía no empieza con `'ficha:'` y
  // ningún tipo la tiene, así que cae por el camino normal y el respaldo ES
  // este texto. Ese `if` tampoco lo tumbaba ninguna mutación.
  const A_MANO = 'Precio escrito a mano.';
  if (key.startsWith('ficha:')) return 'Precio de la última compra de esa ficha.';

  // Un tipo que ya no existe (se corrigió la ficha que lo tenía) o los
  // promedios que todavía viajan: no se afirma nada sobre ellos.
  const t = (tipos ?? []).find((x) => claveDeTipo(x.type) === key);
  if (!t) return A_MANO;

  const rollos = `${t.rolls} ${t.rolls === 1 ? 'rollo comprado' : 'rollos comprados'}`;
  return `Promedio de ${t.type}, sobre ${rollos}. El rollo regalado no cuenta.`;
}

/**
 * Las fichas que se ofrecen al cotizar: sin las descontinuadas y con las que
 * cerraron el último mes en 0 AL FINAL (2026-09-14, decisión del dueño: se avisa,
 * no se ocultan — se puede cotizar un color que se va a reponer).
 */
export function quotableMaterials(items: MaterialItem[] | undefined): MaterialItem[] | undefined {
  if (!items) return undefined;
  const activas = items.filter((m) => m.status !== 'DISCONTINUED');
  return [...activas.filter((m) => !m.outAtLastClose), ...activas.filter((m) => m.outAtLastClose)];
}

/** `"PLA Amarillo — 0 al cierre de agosto"` para las que cerraron en 0; si no, el nombre. */
export function materialLabel(m: MaterialItem): string {
  if (!m.outAtLastClose) return m.name;
  const mes = monthStart(m.outAtLastClose).toLocaleDateString('es-VE', { month: 'long', timeZone: 'UTC' });
  return `${m.name} — 0 al cierre de ${mes}`;
}
