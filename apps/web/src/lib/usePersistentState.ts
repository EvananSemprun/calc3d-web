import { useEffect, useState } from 'react';

/**
 * useState que persiste en localStorage bajo `key` (recordar filtros/preferencias
 * al volver a una página). Si `key` es null, se comporta como useState normal (útil
 * para hooks que quieren persistencia opcional). Tolera almacenamiento bloqueado.
 */
export function usePersistentState<T>(key: string | null, initial: T) {
  const [state, setState] = useState<T>(() => {
    if (!key) return initial;
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* almacenamiento lleno o deshabilitado: se ignora, no es crítico */
    }
  }, [key, state]);

  return [state, setState] as const;
}
