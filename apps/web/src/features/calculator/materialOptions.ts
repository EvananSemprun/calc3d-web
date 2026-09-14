import { monthStart } from '@calc3d/shared';
import type { MaterialItem } from './useCatalogData';

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
