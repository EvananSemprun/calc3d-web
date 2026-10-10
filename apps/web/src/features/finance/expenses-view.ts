import {
  EXPENSE_CATEGORY_LABELS,
  LINK_KIND_LABELS,
  expenseLink,
  type ExpenseRow,
} from '@/features/finance/api';

/**
 * LO QUE LA PANTALLA DE GASTOS DERIVA, sin React.
 *
 * Mismo reparto que `sales-view.ts` hace para Ventas: la pantalla
 * (`pages/Expenses.tsx`) se queda con el JSX, los hooks y las mutaciones, y
 * acá vive todo lo que es "de este dato sale este texto / esta fila pasa el
 * filtro".
 *
 * ⚠️ **No es sólo prolijidad.** Mientras estas funciones vivían dentro de la
 * pantalla, su spec las importaba DESDE la pantalla y arrastraba React, React
 * Query, axios, Recharts por carambola y los 30 componentes del árbol: un
 * import roto en cualquier rincón de esa pantalla tumbaba el test de una
 * función que estaba intacta, y el fallo señalaba al lugar equivocado.
 */

/** Días que duró una campaña (inclusivo). Null si no hay fecha de fin válida. */
function durationDays(from: string, to?: string | null) {
  if (!to) return null;
  const d = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
  return d > 0 ? d : null;
}

/**
 * Los tipos del filtro, con su etiqueta, en UN solo lugar: el desplegable y el
 * aviso de "qué filtros están puestos" tienen que nombrar el tipo igual. Con el
 * texto escrito dos veces, renombrar una opción deja al aviso diciendo el
 * nombre viejo.
 */
export const TIPOS_DE_GASTO = [
  { value: 'printer', label: 'Impresoras' },
  { value: 'material', label: 'Filamentos' },
  { value: 'component', label: 'Insumos' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'advertising', label: 'Publicidad' },
  { value: 'design', label: 'Diseño' },
  { value: 'investment', label: 'Inversión' },
  { value: 'owner', label: 'Los puso una persona' },
  { value: 'general', label: 'General' },
] as const;

/**
 * El centinela de "no filtrar", compartido por los DOS filtros de la pantalla.
 * No es un tipo ni un proveedor: es la ausencia de filtro.
 */
export const TODOS = 'ALL';

/**
 * El valor del filtro de tipo que SE PUEDE usar.
 *
 * ⚠️ **Hace falta porque el filtro se PERSISTE.** Mientras vivía en un
 * `useState` arrancaba siempre en "todos" y un valor imposible no podía
 * existir; guardado en `localStorage` sí puede —una opción retirada o
 * renombrada, un valor de una versión anterior, el almacenamiento editado a
 * mano— y entonces ningún gasto pasa el filtro: la tabla se abre **vacía, con
 * el desplegable en blanco y sin nada que explique por qué**. Es la misma
 * regla que ya seguían el filtro de proveedor de esta pantalla, los de Ventas
 * (`valorSeguro`) y los de Stock del mes.
 */
export function tipoSeguro(guardado: string): string {
  // ⚠️ Sin caso especial para `TODOS`: no está en la lista, así que
  // cae por el camino normal y el respaldo ES ese mismo valor. Un
  // `if (guardado === TODOS) return TODOS` arriba devuelve
  // exactamente lo mismo, o sea que es código muerto — una guarda que parece
  // una regla puesta y que ningún test puede tumbar. El test "deja pasar ALL"
  // sigue fijando el comportamiento, que es lo que importa.
  return TIPOS_DE_GASTO.some((t) => t.value === guardado) ? guardado : TODOS;
}

/**
 * ¿El gasto pasa el filtro de tipo? `filtro` es lo que devolvió `tipoSeguro`.
 *
 * ⚠️ Nació como un closure de 9 ramas DENTRO del componente (`matchesType`) y
 * por eso no tenía test: las nueve se comprobaban eligiendo cada opción del
 * desplegable a mano. Cerraba sobre `typeFilter` y nada más, así que salió tal
 * cual. Lo que cuida es que un gasto no se ESCONDA: una rama que devuelve
 * `false` de más no da error, deja la fila afuera de la tabla y los tres
 * totales de arriba —que suman lo que se ve— diciendo menos dinero del que
 * salió.
 *
 * El respaldo (`default`) es **mostrar**, no ocultar. Por la pantalla no se
 * llega ahí, porque el valor pasa antes por `tipoSeguro`; es la red por si
 * alguien llama a esta función con otra cosa.
 *
 * ⚠️ **"General" es el RESTO y es disjunto de todo** (2026-10-10): de los tres
 * recursos, de las tres categorías y de la inversión. Lo que queda superpuesto
 * —y queda a propósito, pendiente de decisión del dueño— son otros dos pares,
 * los dos porque el desplegable mezcla EJES distintos en una sola lista:
 * - **"Los puso una persona"** cruza con todos: es *quién pagó*, no *qué se
 *   compró*. Una impresora que puso el propietario sale en "Impresoras" y acá.
 * - **"Inversión"** cruza con "Impresoras" / "Filamentos" / "Insumos" cuando el
 *   gasto está enlazado a una ficha: es *cómo se cuenta* (lo que el negocio
 *   devuelve), no el recurso.
 * Separarlos de verdad pide dos filtros, no nueve opciones en uno.
 */
export function pasaTipo(filtro: string, e: ExpenseRow): boolean {
  switch (filtro) {
    case TODOS: return true;
    case 'printer': return !!e.printer;
    case 'material': return !!e.material;
    case 'component': return !!e.component;
    case 'maintenance': return e.category === 'MAINTENANCE';
    case 'advertising': return e.category === 'ADVERTISING';
    case 'design': return e.category === 'DESIGN';
    case 'owner': return e.counterparty != null;
    case 'investment': return e.isInvestment;
    // ⚠️ "General" es EL RESTO, y para eso tiene que excluir también la
    // inversión (2026-10-10, decisión del dueño): una impresora marcada como
    // inversión y sin ficha enlazada salía en "General" **y** en "Inversión" a
    // la vez. Dos filtros mostrando el mismo gasto hacen que las partes sumen
    // más que el total, y entonces ninguna de las dos etiquetas significa lo
    // que dice.
    case 'general': return !e.material && !e.printer && !e.component && !e.isInvestment && e.category !== 'MAINTENANCE' && e.category !== 'ADVERTISING' && e.category !== 'DESIGN';
    default: return true;
  }
}

/**
 * Los tres totales de la pantalla, DERIVADOS de las filas que recibe.
 *
 * ⚠️ Recibe **lo que se ve**, no la respuesta entera: con un filtro puesto, la
 * tabla mostraba 2 gastos y el total seguía diciendo el de los 87 del periodo
 * (la misma regla que ya seguía Ventas: los KPIs se calculan sobre LO QUE SE
 * VE).
 */
export function totalesGastos(filas: { amount: number; isInvestment: boolean }[]) {
  const total = filas.reduce((s, r) => s + r.amount, 0);
  const inversion = filas.filter((r) => r.isInvestment).reduce((s, r) => s + r.amount, 0);
  // La inversión está DENTRO del total, no al lado: los equipos también son
  // dinero que salió. Lo que resta ganancia es el resto (ver el `sub` de cada
  // tarjeta) — la máquina se recupera en Producción → Reposición de equipos.
  return { total, inversion, operativo: total - inversion };
}

/**
 * Una fila de Gastos **ya resuelta**: cada texto y cada decisión salen de acá
 * UNA sola vez.
 *
 * ⚠️ Las dos presentaciones (tabla desde `md`, tarjetas en el teléfono) leen
 * esta lista y su JSX es tonto: ninguna vuelve a llamar a `money()` ni a
 * decidir si la fila es "de factura". Con dos árboles escritos a mano, el día
 * que cambie una columna se arregla uno y se olvida el otro — y acá lo que se
 * olvidaría es justo lo que protege la plata (la fila de factura sin tacho y
 * con el pagador apagado).
 */
export interface FilaGasto {
  id: string;
  /** El día guardado, `AAAA-MM-DD`. Estas fechas ya SON el día que el dueño eligió. */
  dia: string;
  /** Badge de tipo: el recurso enlazado, o la categoría/inversión. */
  etiqueta: string;
  /** Nombre del recurso enlazado; `null` cuando la etiqueta es la categoría. */
  recurso: string | null;
  /** `true` cuando la etiqueta merece destaque (recurso enlazado o inversión). */
  destacada: boolean;
  descripcion: string;
  /** "· duró N días" ya armado, o `null`. */
  duracion: string | null;
  proveedor: string | null;
  /**
   * La cantidad, ya como texto. `null` = el gasto no lleva cantidad.
   *
   * ⚠️ `null` y `'0'` son cosas distintas: una compra de 0 rollos es un dato y
   * tiene que verse. Por eso el guion lo pone cada presentación (la tabla
   * necesita llenar la celda; la tarjeta simplemente no dibuja la línea) y acá
   * se guarda la ausencia, no su dibujo.
   */
  cantidad: string | null;
  /** El monto ya formateado. */
  monto: string;
  /**
   * Nació de una factura de Compras: su monto y su cantidad son el espejo de
   * una línea ya recibida, así que la API rechaza corregirlo o borrarlo desde
   * acá. **Ni tacho ni selector de pagador**: un control que solo sabe fallar
   * es peor que no tenerlo.
   */
  deFactura: boolean;
  /** El pagador elegido para el `Select`; `''` = la caja del negocio. */
  pagadorId: string;
}

/** Resuelve una fila de la API en lo que las dos presentaciones dibujan. */
export function filaDeGasto(e: ExpenseRow, money: (n: number) => string): FilaGasto {
  const link = expenseLink(e);
  const dias = durationDays(e.date, e.endDate);
  return {
    id: e.id,
    dia: e.date.slice(0, 10),
    etiqueta: link
      ? LINK_KIND_LABELS[link.kind]
      : e.isInvestment
        ? 'Inversión'
        : EXPENSE_CATEGORY_LABELS[e.category],
    recurso: link ? link.name : null,
    destacada: link != null || e.isInvestment,
    descripcion: e.description,
    duracion: dias ? `· duró ${dias} días` : null,
    proveedor: e.provider?.name ?? null,
    cantidad: e.quantity != null ? String(e.quantity) : null,
    monto: money(e.amount),
    deFactura: e.purchaseInvoiceLineId != null,
    pagadorId: e.counterparty?.id ?? '',
  };
}
