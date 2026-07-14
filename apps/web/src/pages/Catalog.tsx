import { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  Input,
  NumberInput,
  SearchInput,
  Select,
  TableSkeleton,
} from '@/components/ui';
import { usePersistentState } from '@/lib/usePersistentState';
import { Dialog, useConfirm, Tooltip } from '@/components/overlays';
import { Combobox } from '@/components/Combobox';
import { notify } from '@/components/toast';
import { catalogs, type CatalogConfig, type CatalogField } from '@/features/catalogs/config';
import { DateRangePicker, useDateRange } from '@/features/finance/DateRange';

type Row = Record<string, unknown> & { id: string };

const numericDefaults: Record<string, number> = {
  rollGrams: 1000,
  lifetimeHours: 5000,
  unitsPerPackage: 100,
  powerKw: 0,
  maintPerHour: 0,
};

export function CatalogPage() {
  const { resource } = useParams<{ resource: string }>();
  const config = resource ? catalogs[resource] : undefined;
  if (!config) return <Navigate to="/" replace />;
  return <CatalogView key={config.route} config={config} />;
}

function CatalogView({ config }: { config: CatalogConfig }) {
  const qc = useQueryClient();
  const { money } = useMoney();
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();

  const { data: items = [], isLoading } = useQuery({
    queryKey: [config.endpoint],
    queryFn: async () => (await api.get<Row[]>(`/${config.endpoint}`)).data,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/${config.endpoint}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [config.endpoint] });
      notify.success('Elemento eliminado');
    },
    onError: (error) => notify.error(apiErrorMessage(error)),
  });

  const startCreate = () => {
    setEditing(null);
    setOpen(true);
  };
  const startEdit = (row: Row) => {
    setEditing(row);
    setOpen(true);
  };

  const fmt = (value: unknown, kind?: string) => {
    if (value === null || value === undefined || value === '') return '—';
    if (kind === 'money') return money(Number(value));
    if (kind === 'number') return new Intl.NumberFormat().format(Number(value));
    if (value === 'PER_PIECE') return 'Por pieza';
    if (value === 'PER_ORDER') return 'Por pedido';
    return String(value);
  };

  // --- Filtros (marca / color / fecha de compra) — solo si la config los pide ---
  const filters = config.filters ?? [];
  const range = useDateRange('ALL', `catalog:${config.route}`);
  const [brandF, setBrandF] = usePersistentState(`catalog:${config.route}:brand`, '');
  const [colorF, setColorF] = usePersistentState(`catalog:${config.route}:color`, '');
  const [search, setSearch] = useState('');

  type PurchaseLite = { quantity: number | null; date: string };
  const purchasesOf = (r: Row): PurchaseLite[] =>
    Array.isArray(r.expenses) ? (r.expenses as PurchaseLite[]) : [];
  const rollsOf = (r: Row) => purchasesOf(r).reduce((s, e) => s + (e.quantity || 0), 0);

  const distinct = (key: string) =>
    [...new Set(items.map((r) => String(r[key] ?? '')).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    );
  const brands = useMemo(() => distinct('brand'), [items]);
  const colors = useMemo(() => distinct('color'), [items]);

  const matchesDate = (r: Row) => {
    if (!filters.includes('date') || (!range.from && !range.to)) return true;
    return purchasesOf(r).some((p) => {
      const d = String(p.date).slice(0, 10);
      return (!range.from || d >= range.from) && (!range.to || d <= range.to);
    });
  };
  const q = search.trim().toLowerCase();
  const matchesSearch = (r: Row) =>
    !q ||
    String(r.name ?? '').toLowerCase().includes(q) ||
    config.columns.some((c) => String(r[c.key] ?? '').toLowerCase().includes(q));
  const visible = items.filter(
    (r) =>
      (!brandF || String(r.brand ?? '') === brandF) &&
      (!colorF || String(r.color ?? '') === colorF) &&
      matchesSearch(r) &&
      matchesDate(r),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">{config.title}</h1>
            <p className="text-sm text-muted-foreground">Catálogo reutilizable en tus presupuestos.</p>
          </div>
        </div>
        {!config.costDefinition && (
          <Button variant="accent" onClick={startCreate}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={`Buscar ${config.title.toLowerCase()}…`}
            className="w-full sm:w-64"
          />
          {filters.includes('brand') && (
            <Select className="w-44" value={brandF} onChange={(e) => setBrandF(e.target.value)}>
              <option value="">Todas las marcas</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </Select>
          )}
          {filters.includes('color') && (
            <Select className="w-44" value={colorF} onChange={(e) => setColorF(e.target.value)}>
              <option value="">Todos los colores</option>
              {colors.map((cl) => (
                <option key={cl} value={cl}>
                  {cl}
                </option>
              ))}
            </Select>
          )}
          {filters.includes('date') && <DateRangePicker range={range} />}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton cols={5} />
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-blue/15 text-brand-blue-bright ring-1 ring-inset ring-brand-blue/30">
                <Inbox className="h-6 w-6" />
              </span>
              <p className="text-sm text-muted-foreground">
                {config.costDefinition
                  ? `Aún no registras ${config.title.toLowerCase()}. Se crean al registrar su compra en Gastos.`
                  : `No hay ${config.title.toLowerCase()} todavía. Agrega el primero.`}
              </p>
              {!config.costDefinition && (
                <Button variant="outline" size="sm" onClick={startCreate}>
                  <Plus className="h-4 w-4" /> Agregar
                </Button>
              )}
            </div>
          ) : visible.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Ningún resultado con los filtros actuales.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    {config.columns.map((col) => (
                      <th key={col.key} className="px-4 py-3 font-semibold">
                        {col.label}
                      </th>
                    ))}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40"
                    >
                      {config.columns.map((col) => (
                        <td key={col.key} className="px-4 py-3">
                          {col.computed === 'rolls' ? rollsOf(row) : fmt(row[col.key], col.kind)}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Tooltip label="Editar">
                            <Button variant="ghost" size="icon" onClick={() => startEdit(row)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Tooltip>
                          <Tooltip label="Eliminar">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={async () => {
                                if (
                                  await confirm({
                                    title: '¿Eliminar este elemento?',
                                    description: 'Esta acción no se puede deshacer.',
                                    confirmLabel: 'Eliminar',
                                    tone: 'destructive',
                                  })
                                ) {
                                  remove.mutate(row.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {open && (
        <CatalogFormModal
          config={config}
          editing={editing}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: [config.endpoint] });
          }}
        />
      )}
    </div>
  );
}

function buildDefaults(config: CatalogConfig, editing: Row | null) {
  const out: Record<string, unknown> = {};
  for (const f of config.fields) {
    if (editing && editing[f.name] !== undefined && editing[f.name] !== null) {
      out[f.name] = f.type === 'number' ? Number(editing[f.name]) : editing[f.name];
    } else if (f.type === 'number') {
      out[f.name] = numericDefaults[f.name] ?? 0;
    } else if (f.type === 'select') {
      out[f.name] = f.options?.[0]?.value ?? '';
    } else {
      out[f.name] = '';
    }
  }
  return out;
}

function CatalogFormModal({
  config,
  editing,
  onClose,
  onSaved,
}: {
  config: CatalogConfig;
  editing: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const confirm = useConfirm();
  const { data: existing = [] } = useQuery({
    queryKey: [config.endpoint],
    queryFn: async () => (await api.get<Row[]>(`/${config.endpoint}`)).data,
  });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(config.schema), defaultValues: buildDefaults(config, editing) });

  const save = async (data: Record<string, unknown>) => {
    // Detección de duplicados por nombre (solo al crear): avisa antes de duplicar.
    if (!editing) {
      const name = String(data.name ?? '').trim().toLowerCase();
      const dupe = name && existing.some((r) => String(r.name ?? '').trim().toLowerCase() === name);
      if (
        dupe &&
        !(await confirm({
          title: `Ya existe "${String(data.name)}"`,
          description: `¿Crear otro ${config.singular} con el mismo nombre?`,
          confirmLabel: 'Crear de todas formas',
        }))
      ) {
        return;
      }
    }
    try {
      if (editing) {
        await api.patch(`/${config.endpoint}/${editing.id}`, data);
      } else {
        await api.post(`/${config.endpoint}`, data);
      }
      onSaved();
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`${editing ? 'Editar' : 'Agregar'} ${config.singular}`}
    >
      {editing && (
        <div className="mb-3">
          <Badge variant="outline">Editando</Badge>
        </div>
      )}
      <form onSubmit={handleSubmit(save)} className="space-y-3">
        {config.fields.map((field) => (
          <FieldInput
            key={field.name}
            field={field}
            register={register}
            control={control}
            error={errors[field.name]?.message as string | undefined}
          />
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="accent" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function FieldInput({
  field,
  register,
  control,
  error,
}: {
  field: CatalogField;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  error?: string;
}) {
  return (
    <Field label={field.label + (field.optional ? ' (opcional)' : '')} error={error} hint={field.hint}>
      {field.type === 'combobox' && field.optionsKind ? (
        <Controller
          name={field.name}
          control={control}
          render={({ field: f }) => (
            <Combobox
              kind={field.optionsKind!}
              value={String(f.value ?? '')}
              onChange={f.onChange}
            />
          )}
        />
      ) : field.type === 'select' ? (
        <Controller
          name={field.name}
          control={control}
          render={({ field: f }) => (
            <Select value={String(f.value ?? '')} onChange={(e) => f.onChange(e.target.value)}>
              {field.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        />
      ) : field.type === 'number' ? (
        <Controller
          name={field.name}
          control={control}
          render={({ field: f }) => (
            <NumberInput
              step={field.step}
              value={typeof f.value === 'number' && !Number.isNaN(f.value) ? f.value : 0}
              onChange={f.onChange}
            />
          )}
        />
      ) : (
        <Input type="text" {...register(field.name)} />
      )}
    </Field>
  );
}
