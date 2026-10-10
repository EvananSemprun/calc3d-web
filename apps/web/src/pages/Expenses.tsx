import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
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

/**
 * Los tipos del filtro, con su etiqueta, en UN solo lugar: el desplegable y el
 * aviso de "qué filtros están puestos" tienen que nombrar el tipo igual. Con el
 * texto escrito dos veces, renombrar una opción deja al aviso diciendo el
 * nombre viejo.
 */
const TIPOS_DE_GASTO = [
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
 * Los tres totales de la pantalla, DERIVADOS de las filas que recibe.
 *
 * ⚠️ Recibe **lo que se ve**, no la respuesta entera: con un filtro puesto, la
 * tabla mostraba 2 gastos y el total seguía diciendo el de los 87 del periodo
 * (la misma regla que ya seguía Ventas: los KPIs se calculan sobre LO QUE SE
 * VE). Es pura a propósito, para poder testearla el día que `apps/web` tenga
 * runner de tests.
 */
export function totalesGastos(filas: { amount: number; isInvestment: boolean }[]) {
  const total = filas.reduce((s, r) => s + r.amount, 0);
  const inversion = filas.filter((r) => r.isInvestment).reduce((s, r) => s + r.amount, 0);
  // La inversión está DENTRO del total, no al lado: los equipos también son
  // dinero que salió. Lo que resta ganancia es el resto (ver el `sub` de cada
  // tarjeta) — la máquina se recupera en Producción → Reposición de equipos.
  return { total, inversion, operativo: total - inversion };
}

export function ExpensesPage() {
  const { data: contrapartes = [] } = useCounterparties();
  const range = useDateRange('MONTH', 'expenses');
  const { money } = useMoney();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useExpenses(range);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [proveedorFilter, setProveedorFilter] = useState<string>('ALL');
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
  // Las opciones del filtro salen de LAS FILAS CARGADAS, no del directorio
  // entero (el patrón de `PurchasesTab` con `uniqueSorted`): así no se puede
  // elegir un proveedor que deje la tabla vacía. Se agrupa por ID y no por
  // nombre porque dos proveedores que se llamen parecido son contactos
  // distintos, y el nombre de uno no puede arrastrar al otro.
  const proveedores = useMemo(() => {
    const porId = new Map<string, string>();
    for (const e of rows) if (e.provider) porId.set(e.provider.id, e.provider.name);
    return [...porId]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [rows]);
  // Valor "seguro": un proveedor elegido que ya no está entre las opciones
  // (cambió el rango de fechas) cae a "todos", en vez de dejar la tabla vacía.
  const proveedorSeguro = proveedores.some((p) => p.id === proveedorFilter) ? proveedorFilter : 'ALL';
  const matchesProveedor = (e: ExpenseRow) =>
    proveedorSeguro === 'ALL' || e.provider?.id === proveedorSeguro;
  const visibleRows = rows.filter((e) => matchesType(e) && matchesProveedor(e));

  // Qué filtros están puestos, con el mismo texto que el desplegable.
  const filtrosPuestos = [
    typeFilter !== 'ALL' ? TIPOS_DE_GASTO.find((t) => t.value === typeFilter)?.label : null,
    proveedorSeguro !== 'ALL' ? proveedores.find((p) => p.id === proveedorSeguro)?.name : null,
  ].filter((t): t is string => !!t);
  // ⚠️ "Con filtros" solo cambia los textos cuando hay algo que filtrar: en un
  // periodo sin ningún gasto, "ninguno de los 0 pasa el filtro" es peor que
  // decir derecho que no hay gastos.
  const hayFiltros = filtrosPuestos.length > 0 && rows.length > 0;
  const quitarFiltros = () => {
    setTypeFilter('ALL');
    setProveedorFilter('ALL');
  };
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

  // ⚠️ Sobre `visibleRows`, lo mismo que muestra la tabla.
  const { total, inversion, operativo } = totalesGastos(visibleRows);

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
            className="w-full sm:w-48"
            value={typeFilter}
            aria-label="Filtrar por tipo de gasto"
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="ALL">Todos los tipos</option>
            {TIPOS_DE_GASTO.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          {/* Solo se dibuja si hay proveedor que elegir: con los 87 gastos sin
              proveedor cargado, un select de una sola opción es ruido que ocupa
              media fila de teléfono. */}
          {proveedores.length > 0 && (
            <Select
              className="w-full sm:w-48"
              value={proveedorSeguro}
              aria-label="Filtrar por proveedor"
              onChange={(e) => setProveedorFilter(e.target.value)}
            >
              <option value="ALL">Proveedor: todos</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </FilterBar>
        {/* En el teléfono los totales se reparten el ancho en vez de desbordar. */}
        <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
          {/* ⚠️ Los tres suman LO QUE SE VE, así que con un filtro puesto ya no
              son "del periodo": la etiqueta lo dice y el aviso de abajo nombra
              los filtros. Cambiar el número y dejar el cartel viejo sería
              cambiar una mentira por otra. */}
          <Stat
            label={hayFiltros ? 'Total de lo que se ve' : 'Total del periodo'}
            value={money(total)}
            sub={hayFiltros ? `${visibleRows.length} de ${rows.length} gastos` : 'todo lo que salió'}
            accent="yellow"
            className="min-w-[150px]"
          />
          <Stat
            label="Operativo"
            value={money(operativo)}
            sub={hayFiltros ? 'lo que resta ganancia, de lo filtrado' : 'lo que resta ganancia'}
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

      {/* Qué se está mirando, dicho con los nombres de los filtros, y cómo
          volver a ver todo. Sin esto, los totales de "lo que se ve" obligan a
          revisar dos desplegables para saber qué quedó afuera. */}
      {hayFiltros && !isLoading && visibleRows.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Se ven {visibleRows.length} de {rows.length} gasto(s) del periodo · filtros:{' '}
          {filtrosPuestos.join(' · ')}.{' '}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={quitarFiltros}
          >
            Quitar filtros
          </button>
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton cols={7} />
          ) : visibleRows.length === 0 ? (
            /* Con un filtro puesto, "sin gastos en este periodo" es falso: los
               gastos están, el filtro los deja afuera. Y ofrecer "Registrar
               gasto" ahí manda a cargar uno que ya existe. */
            <EmptyState
              icon={Receipt}
              description={
                hayFiltros
                  ? `Ninguno de los ${rows.length} gasto(s) del periodo pasa el filtro (${filtrosPuestos.join(
                      ' · ',
                    )}).`
                  : 'Sin gastos en este periodo.'
              }
              action={
                hayFiltros ? (
                  <Button variant="outline" size="sm" onClick={quitarFiltros}>
                    Quitar filtros
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                    <Plus className="h-4 w-4" /> Registrar gasto
                  </Button>
                )
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Tipo / Recurso</th>
                    <th className="px-4 py-3 font-semibold">Descripción</th>
                    <th className="px-4 py-3 font-semibold">Proveedor</th>
                    <th className="px-4 py-3 text-right font-semibold">Cant.</th>
                    <th className="px-4 py-3 text-right font-semibold">Monto</th>
                    <th className="px-4 py-3 font-semibold">Pagó</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((e) => {
                    const link = expenseLink(e);
                    // Nació de una factura de Compras: su monto y su cantidad
                    // son el espejo de una línea ya recibida, así que la API
                    // rechaza corregirlo o borrarlo desde acá. La fila lo dice
                    // y no ofrece los controles: uno que solo sabe fallar es
                    // peor que no tenerlo.
                    const deFactura = e.purchaseInvoiceLineId != null;
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
                          {deFactura && (
                            <Tooltip label="Entró por una factura: se corrige en Compras.">
                              <span className="ml-2 cursor-help align-middle">
                                <Badge variant="outline">de factura</Badge>
                              </span>
                            </Tooltip>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{e.provider?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-right tabular">{e.quantity ?? '—'}</td>
                        <td className="px-4 py-3 text-right tabular font-semibold">{money(e.amount)}</td>
                        <td className="px-4 py-3">
                          <Select
                            className="h-8 w-[9rem] text-xs"
                            value={e.counterparty?.id ?? ''}
                            aria-label={`Quién pagó: ${e.description}`}
                            // ⚠️ Este desplegable manda un PATCH en cada
                            // cambio: en una fila de factura la API lo rechaza
                            // con un 400, así que acá va apagado.
                            disabled={deFactura}
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
                          {!deFactura && (
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
                          )}
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
