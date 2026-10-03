import type { AttributionChannel } from '@calc3d/shared';
import type { SaleRow } from '@/features/finance/api';

/**
 * Una fila de `GET /sales` **con los campos de atribución**.
 *
 * `SalesService.list()` devuelve la fila de Prisma completa (no arma la
 * respuesta campo por campo), así que `originChannel` y `campaignId` siempre
 * llegan; el tipo `SaleRow` de `features/finance/api.ts` todavía no los
 * declara. Se extiende acá para no tocar ese archivo.
 */
export interface SaleRowFull extends SaleRow {
  originChannel?: AttributionChannel | null;
  campaignId?: string | null;
}

/** El día GUARDADO de una venta, como `AAAA-MM-DD`. */
export function diaGuardado(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Un día guardado, como `30/09/2026`.
 *
 * ⚠️ Se lee en **UTC**: estas fechas se guardan a medianoche UTC y leerlas en
 * la zona local imprime el día ANTERIOR (en Venezuela, UTC−4, todas).
 * `formatStoredDay` de `lib/today.ts` aplica la misma regla pero **sin rellenar
 * con cero** (`30/9/2026`); acá el día y el mes van con dos dígitos para que la
 * columna de la tabla no se desalinee de una fila a otra.
 */
export function formatoDiaVenta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Totales del periodo. Se calculan SOBRE LAS FILAS QUE SE VEN, nunca sobre todas. */
export interface TotalesVentas {
  /** Suma de los montos visibles. */
  total: number;
  /** Cuántas filas se están viendo. */
  cantidad: number;
  /** Total ÷ cantidad; 0 sin filas (no NaN). */
  ticket: number;
}

/**
 * Deriva los tres KPIs de una lista de ventas.
 *
 * ⚠️ Recibe **lo visible**, no la respuesta entera: con el histórico importado
 * dentro, el ticket promedio divide entre 25 filas que en realidad son semanas
 * enteras del Excel y da un número que no significa nada (el mismo error que ya
 * se arregló en el Dashboard).
 */
export function totalesVentas(filas: { amount: number }[]): TotalesVentas {
  const total = filas.reduce((s, f) => s + f.amount, 0);
  const cantidad = filas.length;
  return { total, cantidad, ticket: cantidad ? total / cantidad : 0 };
}

/**
 * El valor de un filtro que SE PUEDE usar: si lo guardado en localStorage ya no
 * está entre las opciones (se borró el cliente, cambió el rango de fechas), cae
 * a "todos" en vez de dejar el select en blanco y la lista vacía.
 */
export function valorSeguro(guardado: string, opciones: readonly string[]): string {
  return opciones.includes(guardado) ? guardado : '';
}

/** Una opción de filtro: el valor que viaja y el texto que se lee. */
export interface OpcionFiltro {
  value: string;
  label: string;
}

/** Centinela del filtro de cliente para "las ventas que no tienen cliente". */
export const SIN_CLIENTE = '__sin_cliente__';

/**
 * Opciones del filtro de cliente, derivadas de las filas: un cliente por id
 * (ordenado como en español) y, si además hay ventas sueltas, "Sin cliente".
 * Devuelve lista vacía si NINGUNA fila tiene cliente: un select con una sola
 * opción es ruido que ocupa media fila de teléfono.
 */
export function opcionesCliente(filas: SaleRowFull[]): OpcionFiltro[] {
  const porId = new Map<string, string>();
  let huerfanas = false;
  for (const f of filas) {
    if (f.client) porId.set(f.client.id, f.client.name);
    else huerfanas = true;
  }
  if (porId.size === 0) return [];
  const clientes = [...porId.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  return huerfanas ? [...clientes, { value: SIN_CLIENTE, label: 'Sin cliente' }] : clientes;
}

/** Centinela del filtro de canal/campaña para "las ventas sin atribuir". */
export const SIN_ATRIBUIR = '__sin_atribuir__';

/**
 * Opciones de un filtro de atribución (canal o campaña) sobre las filas.
 * `etiqueta` traduce la clave guardada al texto que se muestra; una clave sin
 * traducción se muestra tal cual en vez de desaparecer.
 */
export function opcionesAtribucion(
  claves: (string | null | undefined)[],
  etiqueta: (clave: string) => string | undefined,
): OpcionFiltro[] {
  const presentes = new Set<string>();
  let sinAtribuir = false;
  for (const c of claves) {
    if (c) presentes.add(c);
    else sinAtribuir = true;
  }
  if (presentes.size === 0) return [];
  const opciones = [...presentes]
    .map((value) => ({ value, label: etiqueta(value) ?? value }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  return sinAtribuir ? [...opciones, { value: SIN_ATRIBUIR, label: 'Sin atribuir' }] : opciones;
}

/** ¿La fila pasa un filtro de atribución? `''` = todas. */
export function pasaAtribucion(valor: string, clave: string | null | undefined): boolean {
  if (!valor) return true;
  if (valor === SIN_ATRIBUIR) return !clave;
  return clave === valor;
}

/** ¿La fila pasa el filtro de cliente? `''` = todos. */
export function pasaCliente(valor: string, fila: SaleRowFull): boolean {
  if (!valor) return true;
  if (valor === SIN_CLIENTE) return !fila.client;
  return fila.client?.id === valor;
}
