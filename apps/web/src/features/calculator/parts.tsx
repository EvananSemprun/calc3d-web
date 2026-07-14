import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button, RequiredTag, Select } from '@/components/ui';

export function MiniField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <label className={required ? 'text-xs font-semibold text-foreground' : 'text-xs font-medium text-muted-foreground'}>
          {label}
        </label>
        {required && <RequiredTag />}
      </div>
      {children}
    </div>
  );
}

/** Tarjeta para listas de líneas (materiales, componentes, etc.) con botón "+ Línea". */
export function LineGroup({
  title,
  hint,
  onAdd,
  empty,
  children,
}: {
  title: string;
  hint?: string;
  onAdd: () => void;
  empty?: string;
  children: React.ReactNode;
}) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <div className="rounded-xl border border-border/70 bg-background/30 p-4 backdrop-blur-[2px]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h4 className="font-display text-sm font-semibold">{title}</h4>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4" /> Línea
        </Button>
      </div>
      <div className="space-y-3">
        {hasChildren ? (
          children
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            {empty ?? 'Sin líneas. Agrega una con "+ Línea".'}
          </p>
        )}
      </div>
    </div>
  );
}

/** Selector "Elegir del catálogo" reutilizable. */
export function CatalogSelect<T extends { id: string; name: string }>({
  items,
  onPick,
}: {
  items: T[] | undefined;
  onPick: (item: T) => void;
}) {
  return (
    <Select
      className="h-9"
      value=""
      onChange={(e) => {
        const item = items?.find((x) => x.id === e.target.value);
        if (item) onPick(item);
      }}
    >
      <option value="">Elegir del catálogo…</option>
      {items?.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </Select>
  );
}
