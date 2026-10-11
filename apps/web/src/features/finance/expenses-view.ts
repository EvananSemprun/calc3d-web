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
 *
 * ⚠️ **SON SIETE Y SON MUTUAMENTE EXCLUYENTES: cada gasto cae en UNO Y SOLO
 * UNO** (decisión del dueño, 2026-10-11). Hasta ese día eran nueve y la lista
 * mezclaba **tres ejes distintos**:
 *
 * | Eje | Opciones |
 * |---|---|
 * | Recursos — *qué compraste* | Impresoras · Filamentos · Insumos |
 * | Categorías — *de qué clase es* | Mantenimiento · Publicidad · Diseño · General |
 * | Transversales | ~~Inversión~~ · ~~Los puso una persona~~ |
 *
 * Las dos últimas **no son tipos de gasto**: `investment` es *cómo se cuenta*
 * (lo que el negocio devuelve) y `owner` es *quién pagó*. Por eso cruzaban con
 * todas las demás —una impresora que puso el dueño salía en "Impresoras", en
 * "Inversión" **y** en "Los puso una persona"— y con filtros que se solapan
 * **las partes no suman el total**, que acá es un número de plata. Salieron de
 * la lista y hoy son las dos casillas combinables de `CASILLAS`.
 *
 * ⚠️ Una opción nueva va con su rama en `pasaTipo` (hay un test que recorre
 * esta lista entera) y **tiene que ser disjunta de las otras seis**: si cruza
 * con alguna, el lugar es una casilla, no el desplegable.
 */
export const TIPOS_DE_GASTO = [
  { value: 'printer', label: 'Impresoras' },
  { value: 'material', label: 'Filamentos' },
  { value: 'component', label: 'Insumos' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'advertising', label: 'Publicidad' },
  { value: 'design', label: 'Diseño' },
  { value: 'general', label: 'General' },
] as const;

/**
 * El centinela de "no filtrar", compartido por los DOS filtros de la pantalla.
 * No es un tipo ni un proveedor: es la ausencia de filtro.
 */
export const TODOS = 'ALL';

/**
 * LAS DOS CASILLAS TRANSVERSALES, con su texto en UN solo lugar.
 *
 * ⚠️ **No son tipos, y por eso no están en el desplegable**: son RECORTES que
 * se aplican *además* del tipo (decisión del dueño, 2026-10-11 — ver el aviso
 * de `TIPOS_DE_GASTO`). Al no ser excluyentes se pueden combinar entre sí y con
 * el tipo, que es lo que habilita preguntas que antes no se podían hacer:
 * "filamentos que puso Evanan" necesitaba dos filtros a la vez.
 *
 * El texto vive acá y no en el JSX porque lo usan DOS lugares: la casilla y el
 * renglón de "qué filtros están puestos" (`etiquetasDeFiltro`). Escrito dos
 * veces, renombrar una casilla deja al renglón diciendo el nombre viejo.
 */
export const CASILLAS = {
  soloInversion: 'Solo inversión',
  soloPersona: 'Solo lo que puso una persona',
} as const;

/** El estado de las dos casillas. Desmarcadas = no recortan nada. */
export interface Casillas {
  /** `isInvestment`: *cómo se cuenta* el gasto (lo que el negocio devuelve). */
  soloInversion: boolean;
  /** `counterparty`: *quién pagó*. Sin contraparte lo pagó la caja del negocio. */
  soloPersona: boolean;
}

/**
 * ¿El gasto pasa las casillas?
 *
 * ⚠️ **Es un Y, no un O**: con las dos marcadas se piden los gastos que son
 * inversión **y** los puso una persona. Con un O la respuesta sería "lo que es
 * inversión o lo puso alguien", que es más que cada una por separado — y lo que
 * se pidió es cruzarlas.
 *
 * ⚠️ Desmarcadas no esconden NADA. Una casilla que recortara de más no da
 * error: deja la fila afuera de la tabla y los tres totales de arriba —que
 * suman lo que se ve— diciendo menos dinero del que salió.
 */
export function pasaCasillas(c: Casillas, e: ExpenseRow): boolean {
  if (c.soloInversion && !e.isInvestment) return false;
  if (c.soloPersona && e.counterparty == null) return false;
  return true;
}

/**
 * Los nombres de los filtros puestos, para el renglón "Se ven N de M · filtros:
 * …" y para el vacío "ninguno de los M pasa el filtro (…)".
 *
 * ⚠️ **Las casillas TIENEN que estar acá.** Los tres KPIs suman *lo que se ve*:
 * si una casilla recorta la lista y el renglón no la nombra, el número de
 * arriba cambia sin que nada lo explique, y hay que ir a revisar cuatro
 * controles para saber qué quedó afuera.
 *
 * El orden es el de los controles en la barra (tipo · proveedor · casillas):
 * leer el renglón y mirar la barra tienen que dar lo mismo.
 */
export function etiquetasDeFiltro(
  tipo: string,
  casillas: Casillas,
  proveedor: string | null,
): string[] {
  return [
    tipo !== TODOS ? TIPOS_DE_GASTO.find((t) => t.value === tipo)?.label : null,
    proveedor,
    casillas.soloInversion ? CASILLAS.soloInversion : null,
    casillas.soloPersona ? CASILLAS.soloPersona : null,
  ].filter((t): t is string => !!t);
}

/**
 * El valor del filtro de tipo que SE PUEDE usar.
 *
 * ⚠️ **Hace falta porque el filtro se PERSISTE.** Mientras vivía en un
 * `useState` arrancaba siempre en "todos" y un valor imposible no podía
 * existir; guardado en `localStorage` sí puede —una opción retirada o
 * renombrada, un valor de una versión anterior, el almacenamiento editado a
 * mano— y entonces el filtro queda apuntando a algo que no existe. Es la misma
 * regla que ya seguían el filtro de proveedor de esta pantalla, los de Ventas
 * (`valorSeguro`) y los de Stock del mes.
 *
 * ⚠️ **Y el caso dejó de ser hipotético el 2026-10-11**: `'investment'` y
 * `'owner'` fueron opciones del desplegable hasta esa mañana, así que hay
 * `localStorage` real con esos dos valores guardados. Caen a `TODOS` por el
 * camino normal, sin caso especial, y hay test de la función **y** de la
 * pantalla: lo que importa es que el cableado los pase por acá.
 *
 * ⚠️ **QUÉ SE ROMPE SIN ESTO, medido por mutación ese mismo día** (y no es lo
 * que esta función decía antes): **la tabla NO se vacía**. El respaldo de
 * `pasaTipo` es *mostrar* (`default: true`), así que un valor que no está en su
 * `switch` deja pasar todos los gastos igual — quitarle el `tipoSeguro(…)` a la
 * pantalla no tumbaba un solo test hasta que se midió lo correcto. Lo que queda
 * roto es el **control**: el `Select` no encuentra una opción con ese valor y el
 * trigger se queda **en blanco**, un filtro del que no se puede saber qué está
 * filtrando. Lo fija `Expenses.pantalla.spec.tsx` leyendo el TEXTO del
 * desplegable. La red de la tabla sigue haciendo falta igual, por si alguien
 * agrega una rama a `pasaTipo` sin agregar su opción a `TIPOS_DE_GASTO`.
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
 * ⚠️ **"General" es el RESTO de los otros SEIS tipos, y nada más** (2026-10-11):
 * ni recurso enlazado ni una de las tres categorías. Los dos ejes
 * transversales ya no se filtran acá — son casillas (`pasaCasillas`).
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
    // ⚠️ **"General" NO excluye la inversión, y esto se revirtió a propósito**
    // (2026-10-11). Unas horas antes SÍ la excluía, por decisión del dueño: con
    // `investment` como una de las NUEVE opciones del desplegable, una
    // impresora marcada como inversión y sin ficha enlazada salía en "General"
    // **y** en "Inversión" a la vez, las partes sumaban más que el total y
    // ninguna de las dos etiquetas significaba lo que decía.
    //
    // Con `investment` fuera de la lista esa exclusión **estorba**: los siete
    // tipos son disjuntos y "General" es el resto de verdad, así que una
    // inversión que no es impresora, ni filamento, ni insumo —una herramienta,
    // un mueble— no caería en NINGÚN tipo y las partes volverían a no sumar el
    // total, ahora por el otro lado. La decisión anterior era correcta para
    // nueve opciones; en siete, no. La superposición que la motivó ya no existe
    // por construcción: "Solo inversión" es un recorte que se aplica ADEMÁS del
    // tipo, no una opción que compita con él.
    case 'general': return !e.material && !e.printer && !e.component && e.category !== 'MAINTENANCE' && e.category !== 'ADVERTISING' && e.category !== 'DESIGN';
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
