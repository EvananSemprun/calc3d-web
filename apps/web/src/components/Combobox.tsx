import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Plus, Trash2 } from 'lucide-react';
import type { CatalogOptionKind } from '@calc3d/shared';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/overlays';
import {
  useCatalogOptions,
  useCreateOption,
  useDeleteOption,
} from '@/features/catalog-options/api';

/**
 * Combobox CREATABLE (sin dependencias nuevas): un select con búsqueda que además
 * deja escribir un valor nuevo. Al crear «X», la opción se guarda en la lista
 * administrada (persiste) y queda elegida. Las opciones se pueden borrar de la
 * lista (no afecta a los materiales que ya la usan). Controlado: `value`/`onChange`.
 */
export function Combobox({
  kind,
  value,
  onChange,
  placeholder = 'Elegir o escribir…',
}: {
  kind: CatalogOptionKind;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { data: options = [] } = useCatalogOptions(kind);
  const createOption = useCreateOption();
  const deleteOption = useDeleteOption();
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const q = query.trim();
  const filtered = useMemo(
    () => (q ? options.filter((o) => o.value.toLowerCase().includes(q.toLowerCase())) : options),
    [options, q],
  );
  const exists = options.some((o) => o.value.toLowerCase() === q.toLowerCase());
  const canCreate = q.length > 0 && !exists;
  // Total de filas navegables: opciones + (fila "Crear «X»" si aplica).
  const rowCount = filtered.length + (canCreate ? 1 : 0);
  // Reinicia el resaltado al reabrir o al cambiar la búsqueda.
  useEffect(() => setActive(0), [query, open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  const create = () => {
    if (!q) return;
    // Optimista: elige de una; la mutación persiste la opción en la lista.
    createOption.mutate({ kind, value: q });
    choose(q);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={placeholder}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background/50 px-3 py-2 text-sm shadow-sm transition-all hover:border-brand-blue/50 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        )}
      >
        <span className={cn('truncate', !value && 'text-muted-foreground')}>
          {value || placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-glow-sm">
          <div className="border-b border-border/70 p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              role="combobox"
              aria-expanded
              aria-controls="combobox-list"
              aria-activedescendant={rowCount ? `combobox-opt-${active}` : undefined}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => (rowCount ? (a + 1) % rowCount : 0));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => (rowCount ? (a - 1 + rowCount) % rowCount : 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (active < filtered.length) choose(filtered[active].value);
                  else if (canCreate) create();
                } else if (e.key === 'Escape') {
                  setOpen(false);
                }
              }}
              placeholder="Buscar o escribir…"
              className="h-9 w-full rounded-md border border-input bg-background/50 px-3 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
          <div id="combobox-list" role="listbox" className="max-h-56 overflow-y-auto p-1">
            {filtered.map((o, i) => (
              <div
                key={o.id}
                id={`combobox-opt-${i}`}
                role="option"
                aria-selected={o.value === value}
                onMouseMove={() => setActive(i)}
                className={cn(
                  'group flex items-center justify-between rounded-md pr-1',
                  i === active ? 'bg-brand-blue/15' : 'hover:bg-muted/60',
                )}
              >
                <button
                  type="button"
                  onClick={() => choose(o.value)}
                  className="flex flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                >
                  <Check
                    className={cn(
                      'h-4 w-4 shrink-0',
                      o.value === value ? 'text-brand-yellow-ink opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{o.value}</span>
                </button>
                <button
                  type="button"
                  title="Quitar de la lista"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `¿Quitar "${o.value}" de la lista?`,
                        description:
                          'Sale del selector. Los materiales que ya la usan conservan su valor.',
                        confirmLabel: 'Quitar',
                        tone: 'destructive',
                      })
                    ) {
                      deleteOption.mutate({ id: o.id, kind });
                    }
                  }}
                  className="rounded p-1 opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            ))}

            {canCreate && (
              <button
                type="button"
                id={`combobox-opt-${filtered.length}`}
                role="option"
                aria-selected={active === filtered.length}
                onClick={create}
                onMouseMove={() => setActive(filtered.length)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-brand-yellow-ink',
                  active === filtered.length ? 'bg-brand-blue/15' : 'hover:bg-muted/60',
                )}
              >
                <Plus className="h-4 w-4 shrink-0" /> Crear «{q}»
              </button>
            )}

            {filtered.length === 0 && !canCreate && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                Escribe para crear una opción.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
