import { MESES_DE_LA_VENTANA, monthStart, type PrecioPorTipo } from '@calc3d/shared';
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
  /** true si la opción no tiene precio (`rollPrice <= 0`): cotizaría el material GRATIS. */
  sinPrecio: boolean;
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
    // Se deriva con la MISMA regla que las fichas, aunque hoy nunca dé true:
    // `preciosPorTipo` ya no ofrece un tipo sin compras con precio. Dos reglas
    // distintas para "no tiene precio" es como vuelve el agujero.
    sinPrecio: !(t.rollPrice > 0),
  }));

  const porFicha = (quotableMaterials(fichas) ?? []).map((m) => {
    // `Number('')` da 0 y `Number('abc')` da NaN: las dos cosas cotizarían el
    // material en cero igual que el regalo, así que las dos son "sin precio".
    const precio = Number(m.rollPrice);
    const sinPrecio = !(precio > 0);
    return {
      key: `ficha:${m.id}`,
      // La marca va en la ETIQUETA y no solo en un color: el desplegable
      // nativo no dibuja estilos por opción en todos los navegadores, y un
      // $0.00 a secas se lee como un error de carga en vez de como un regalo.
      label: `${materialLabel(m)} — ${sinPrecio ? 'sin precio: su compra fue en $0' : money(precio)}`,
      name: m.name,
      rollPrice: precio,
      rollGrams: m.rollGrams,
      sinPrecio,
    };
  });

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

  // ⚠️ El promedio de FUERA de la ventana se dice DISTINTO: un tipo que no se
  // compra hace rato no puede presentarse como si fuera precio de hoy.
  if (t.stale) {
    if (!t.lastPurchase) {
      return `No hay compras de ${t.type} en los últimos ${MESES_DE_LA_VENTANA} meses: es el precio de su última compra, no un promedio.`;
    }
    return `${t.type} no se compra desde ${mesDe(t.lastPurchase)}: es el precio de esa última compra, no un promedio de los últimos ${MESES_DE_LA_VENTANA} meses.`;
  }

  const rollos = `${t.rolls} ${t.rolls === 1 ? 'rollo comprado' : 'rollos comprados'}`;
  return `Promedio de ${t.type} de los últimos ${MESES_DE_LA_VENTANA} meses, sobre ${rollos}. El rollo regalado no cuenta.`;
}

/** `'2026-01-15'` → `'enero de 2026'`, en UTC como el resto de las fechas de negocio. */
function mesDe(dia: string): string {
  return monthStart(dia.slice(0, 7)).toLocaleDateString('es-VE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
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

/**
 * El aviso de que lo elegido **no tiene precio**, o `null`.
 *
 * `PLA Creality Azul oscuro` aparece en $0.00 porque fue un **regalo**: su
 * compra en $0 es verdadera y se queda en el ledger. La opción sigue en la
 * lista —esconderla taparía un dato que hay que ver— pero elegirla cotiza el
 * material GRATIS, y eso no se puede notar solo mirando un 0 en un campo.
 *
 * ⚠️ El criterio es **"no tiene precio"** (`rollPrice <= 0`), **no "es
 * barato"**: el PLA PURE a $13 contra el PLA a $20 es un precio real y es justo
 * el dato que hace que cotizar por tipo valga la pena. Convertir esto en un
 * filtro de atípicos borraría al PLA PURE junto con el regalo.
 */
export function avisoSinPrecio(ops: OpcionesDeFilamento, key: string): string | null {
  const o = buscarOpcion(ops, key);
  if (!o || !o.sinPrecio) return null;
  return `${o.name} no tiene precio: su compra fue en $0 (un regalo), así que el material te va a salir GRATIS. Escribí el precio del rollo a mano o elegí otra opción.`;
}
