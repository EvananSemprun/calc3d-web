import { useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

/**
 * Orden client-side de una lista de filas por una clave. `toggle(key)` alterna
 * asc/desc (o cambia de columna). Compara números como números y texto con locale
 * español (numeric, así "10" va después de "2").
 */
export function useSortable<T>(rows: T[], initialKey: keyof T | null = null, initialDir: SortDir = 'asc') {
  const [sortKey, setSortKey] = useState<keyof T | null>(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'es', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const toggle = (key: keyof T) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return { sorted, sortKey, sortDir, toggle };
}
