import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import {
  Badge,
  Button,
  Card,
  CardContent,
  FilterBar,
  Select,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { useConfirm, Tooltip } from '@/components/overlays';
import { notify } from '@/components/toast';
import { DateRangePicker, useDateRange } from '@/features/finance/DateRange';
import {
  EXPENSE_CATEGORY_LABELS,
  LINK_KIND_LABELS,
  expenseLink,
  useExpenses,
  type ExpenseRow,
} from '@/features/finance/api';
import { ExpenseModal } from '@/features/finance/ExpenseModal';
import { useCounterparties } from '@/features/cash/api';

/** Días que duró una campaña (inclusivo). Null si no hay fecha de fin válida. */
function durationDays(from: string, to?: string | null) {
  if (!to) return null;
  const d = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
  return d > 0 ? d : null;
}
export function ExpensesPage() {
  const { data: contrapartes = [] } = useCounterparties();
  const range = useDateRange('MONTH', 'expenses');
  const { money } = useMoney();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useExpenses(range);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const matchesType = (e: ExpenseRow) => {
    switch (typeFilter) {
      case 'ALL': return true;
      case 'printer': return !!e.printer;
      case 'material': return !!e.material;
      case 'component': return !!e.component;
      case 'maintenance': return e.category === 'MAINTENANCE';
      case 'advertising': return e.category === 'ADVERTISING';
      case 'design': return e.category === 'DESIGN';
      case 'owner': return e.counterparty != null;
      case 'investment': return e.isInvestment;
      case 'general': return !e.material && !e.printer && !e.component && e.category !== 'MAINTENANCE' && e.category !== 'ADVERTISING' && e.category !== 'DESIGN';
      default: return true;
    }
  };
  const visibleRows = rows.filter(matchesType);
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      notify.success('Gasto eliminado');
    },
    onError: (error) => notify.error(apiErrorMessage(error)),
  });

  // Quién lo pagó se corrige desde la tabla: los gastos viejos nacieron todos
  // como "Negocio" y la Caja depende de que esto esté bien.
  const cambiarPagador = useMutation({
    mutationFn: ({ id, counterpartyId }: { id: string; counterpartyId: string | null }) =>
      api.patch(`/expenses/${id}`, { counterpartyId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
    },
    onError: (error) => notify.error(apiErrorMessage(error)),
  });

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const inversion = rows.filter((r) => r.isInvestment).reduce((s, r) => s + r.amount, 0);
  // La inversión está DENTRO del total, no al lado: los equipos también son
  // dinero que salió. Lo que resta ganancia es el resto (ver el `sub` de cada
  // tarjeta) — la máquina se recupera en Producción → Reposición de equipos.
  const operativo = total - inversion;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Gastos e inversiones</h1>
            <p className="text-sm text-muted-foreground">
              Todo el dinero que sale, en un solo lugar. Enlaza con tus catálogos sin duplicar.
            </p>
          </div>
        </div>
        <Button variant="accent" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Registrar gasto
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar className="w-full sm:w-auto">
          <div className="col-span-full sm:col-span-1">
            <DateRangePicker range={range} />
          </div>
          <Select
            className="col-span-full w-full sm:w-48"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">Todos los tipos</option>
            <option value="printer">Impresoras</option>
            <option value="material">Filamentos</option>
            <option value="component">Insumos</option>
            <option value="maintenance">Mantenimiento</option>
            <option value="advertising">Publicidad</option>
            <option value="design">Diseño</option>
            <option value="investment">Inversión</option>
            <option value="owner">Los puso una persona</option>
            <option value="general">General</option>
          </Select>
        </FilterBar>
        {/* En el teléfono los totales se reparten el ancho en vez de desbordar. */}
        <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
          <Stat
            label="Total del periodo"
            value={money(total)}
            sub="todo lo que salió"
            accent="yellow"
            className="min-w-[150px]"
          />
          <Stat
            label="Operativo"
            value={money(operativo)}
            sub="lo que resta ganancia"
            className="min-w-[150px]"
          />
          <Stat
            label="De inversión"
            value={money(inversion)}
            sub="equipos, incluidos en el total"
            accent="blue"
            className="min-w-[150px]"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton cols={5} />
          ) : visibleRows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-blue/15 text-brand-blue-bright ring-1 ring-inset ring-brand-blue/30">
                <Receipt className="h-6 w-6" />
              </span>
              <p className="text-sm text-muted-foreground">Sin gastos en este periodo.</p>
              <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Registrar gasto
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Tipo / Recurso</th>
                    <th className="px-4 py-3 font-semibold">Descripción</th>
                    <th className="px-4 py-3 text-right font-semibold">Cant.</th>
                    <th className="px-4 py-3 text-right font-semibold">Monto</th>
                    <th className="px-4 py-3 font-semibold">Pagó</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((e) => {
                    const link = expenseLink(e);
                    return (
                      <tr key={e.id} className="border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3 tabular">{e.date.slice(0, 10)}</td>
                        <td className="px-4 py-3">
                          {link ? (
                            <span className="flex items-center gap-2">
                              <Badge variant="brand">{LINK_KIND_LABELS[link.kind]}</Badge>
                              <span className="text-muted-foreground">{link.name}</span>
                            </span>
                          ) : (
                            <Badge variant={e.isInvestment ? 'brand' : 'outline'}>
                              {e.isInvestment ? 'Inversión' : EXPENSE_CATEGORY_LABELS[e.category]}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {e.description}
                          {durationDays(e.date, e.endDate) && (
                            <span className="text-muted-foreground">
                              {' '}
                              · duró {durationDays(e.date, e.endDate)} días
                            </span>
                          )}
                          {e.provider && (
                            <span className="text-muted-foreground"> · {e.provider.name}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular">{e.quantity ?? '—'}</td>
                        <td className="px-4 py-3 text-right tabular font-semibold">{money(e.amount)}</td>
                        <td className="px-4 py-3">
                          <Select
                            className="h-8 w-[9rem] text-xs"
                            value={e.counterparty?.id ?? ''}
                            aria-label={`Quién pagó: ${e.description}`}
                            onChange={(ev) =>
                              cambiarPagador.mutate({
                                id: e.id,
                                counterpartyId: ev.target.value || null,
                              })
                            }
                          >
                            <option value="">Negocio</option>
                            {contrapartes.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Tooltip label="Eliminar gasto">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={async () => {
                                if (
                                  await confirm({
                                    title: '¿Eliminar gasto?',
                                    description: 'Esta acción no se puede deshacer.',
                                    confirmLabel: 'Eliminar',
                                    tone: 'destructive',
                                  })
                                ) {
                                  remove.mutate(e.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {open && (
        <ExpenseModal
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ['expenses'] });
          }}
        />
      )}
    </div>
  );
}
