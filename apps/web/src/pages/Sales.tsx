import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  FieldGrid,
  FilterBar,
  Input,
  NumberInput,
  Select,
  Stat,
  Switch,
  TableSkeleton,
} from '@/components/ui';
import { Dialog, useConfirm, Tooltip } from '@/components/overlays';
import { notify } from '@/components/toast';
import { cn } from '@/lib/utils';
import { usePersistentState } from '@/lib/usePersistentState';
import { todayKey } from '@/lib/today';
import { DateRangePicker, useDateRange } from '@/features/finance/DateRange';
import { SALE_KIND_LABELS, useSales } from '@/features/finance/api';
import {
  formatoDiaVenta,
  opcionesAtribucion,
  opcionesCliente,
  pasaAtribucion,
  pasaCliente,
  totalesVentas,
  valorSeguro,
  type OpcionFiltro,
  type SaleRowFull,
} from '@/features/finance/sales-view';
import { SalesWeeklySummary } from '@/features/finance/SalesWeeklySummary';
import { CHANNEL_LABELS, useCampaigns } from '@/features/campaigns/api';
import { AttributionPicker, EMPTY_ATTRIBUTION, type Attribution } from '@/features/campaigns/AttributionPicker';

type Vista = 'REGISTROS' | 'SEMANAL';

export function SalesPage() {
  const range = useDateRange('MONTH', 'sales');
  const { money } = useMoney();
  const qc = useQueryClient();
  const { data: sales = [], isLoading } = useSales(range);
  const [openManual, setOpenManual] = useState(false);
  const confirm = useConfirm();

  const [vista, setVista] = usePersistentState<Vista>('sales:vista', 'REGISTROS');
  /**
   * El histórico importado arranca OCULTO: son 25 totales SEMANALES del Excel
   * (sin detalle y todos fechados el lunes), no ventas de mostrador. Con ellos
   * a la vista el título de la pantalla mentiría.
   */
  const [verHistorico, setVerHistorico] = usePersistentState('sales:ver-historico', false);
  const [clienteGuardado, setClienteF] = usePersistentState('sales:cliente', '');
  const [canalGuardado, setCanalF] = usePersistentState('sales:canal', '');
  const [campanaGuardada, setCampanaF] = usePersistentState('sales:campana', '');

  const { data: campanas = [] } = useCampaigns();
  const filas = sales as SaleRowFull[];

  const mostrador = useMemo(() => filas.filter((s) => s.kind === 'COUNTER'), [filas]);
  const historico = useMemo(() => filas.filter((s) => s.kind === 'ENCARGO'), [filas]);
  /** Lo que la tabla muestra ANTES de los filtros de cliente/canal/campaña. */
  const porNaturaleza = verHistorico ? filas : mostrador;

  // Opciones de filtro derivadas de las filas: solo valores que existen. Cada
  // select se dibuja únicamente si hay algo que elegir (con todo en null, un
  // select de una sola opción sería ruido que ocupa media fila de teléfono).
  const opClientes = useMemo(() => opcionesCliente(porNaturaleza), [porNaturaleza]);
  const opCanales = useMemo(
    () =>
      opcionesAtribucion(
        porNaturaleza.map((s) => s.originChannel),
        (c) => CHANNEL_LABELS[c as keyof typeof CHANNEL_LABELS],
      ),
    [porNaturaleza],
  );
  const nombreCampana = useMemo(() => {
    const m = new Map(campanas.map((c) => [c.id, c.name]));
    return (id: string) => m.get(id);
  }, [campanas]);
  const opCampanas = useMemo(
    () => opcionesAtribucion(porNaturaleza.map((s) => s.campaignId), nombreCampana),
    [porNaturaleza, nombreCampana],
  );

  // Valor "seguro": lo guardado que ya no existe entre las opciones cae a
  // "todos", en vez de dejar el select en blanco y la lista vacía.
  const clienteF = valorSeguro(clienteGuardado, opClientes.map((o) => o.value));
  const canalF = valorSeguro(canalGuardado, opCanales.map((o) => o.value));
  const campanaF = valorSeguro(campanaGuardada, opCampanas.map((o) => o.value));

  const visibles = useMemo(
    () =>
      porNaturaleza.filter(
        (s) =>
          pasaCliente(clienteF, s) &&
          pasaAtribucion(canalF, s.originChannel) &&
          pasaAtribucion(campanaF, s.campaignId),
      ),
    [porNaturaleza, clienteF, canalF, campanaF],
  );

  /**
   * ⚠️ Los KPIs se calculan sobre LO QUE SE VE. Si sumaran siempre todo, la
   * tabla mostraría las ventas de mostrador y el total diría otra cifra, y el
   * ticket promedio volvería a dividir entre 25 filas que son semanas enteras
   * (el bug que ya se arregló en el Dashboard).
   */
  const kpis = useMemo(() => totalesVentas(visibles), [visibles]);
  const hayFiltros = Boolean(clienteF || canalF || campanaF);
  /** ¿Se está viendo histórico DE VERDAD? (el interruptor puede estar encendido
   *  con un rango que no tiene ninguna fila importada). */
  const conHistorico = verHistorico && historico.length > 0;
  /** Ventas de mostrador que se ven, para el resumen semanal (sin el histórico). */
  const mostradorVisible = useMemo(() => visibles.filter((s) => s.kind === 'COUNTER'), [visibles]);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/sales/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      notify.success('Venta eliminada');
    },
    onError: (error) => notify.error(apiErrorMessage(error)),
  });

  const borrar = async (id: string) => {
    if (
      await confirm({
        title: '¿Eliminar esta venta?',
        description: 'Esta acción no se puede deshacer.',
        confirmLabel: 'Eliminar',
        tone: 'destructive',
      })
    ) {
      remove.mutate(id);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Ventas de mostrador</h1>
            <p className="text-sm text-muted-foreground">
              Lo que se vende en el momento, sin encargo. Los encargos se registran en{' '}
              <Link to="/orders" className="font-medium text-foreground underline underline-offset-4">
                Encargos
              </Link>
              .
            </p>
          </div>
        </div>
        <Button variant="accent" className="w-full sm:w-auto" onClick={() => setOpenManual(true)}>
          <Plus className="h-4 w-4" /> Registrar venta de mostrador
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar className="w-full sm:w-auto">
          <div className="col-span-full sm:col-span-1">
            <DateRangePicker range={range} />
          </div>
          {opClientes.length > 0 && (
            <SelectFiltro
              todos="Cliente: todos"
              opciones={opClientes}
              value={clienteF}
              onChange={setClienteF}
            />
          )}
          {opCanales.length > 0 && (
            <SelectFiltro
              todos="Canal: todos"
              opciones={opCanales}
              value={canalF}
              onChange={setCanalF}
            />
          )}
          {opCampanas.length > 0 && (
            <SelectFiltro
              todos="Campaña: todas"
              opciones={opCampanas}
              value={campanaF}
              onChange={setCampanaF}
            />
          )}
        </FilterBar>
        {/* En el teléfono los totales se reparten el ancho en vez de desbordar. */}
        <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
          <Stat
            label="Total vendido"
            value={money(kpis.total)}
            accent="yellow"
            sub={conHistorico ? 'mostrador + histórico' : 'solo mostrador'}
            className="sm:min-w-[150px]"
          />
          <Stat
            label="Cantidad de ventas"
            value={String(kpis.cantidad)}
            sub={hayFiltros ? 'con los filtros puestos' : 'en el periodo'}
            className="sm:min-w-[130px]"
          />
          <Stat
            label="Ticket promedio"
            value={money(kpis.ticket)}
            sub={
              conHistorico
                ? 'ojo: el histórico son semanas, no ventas'
                : 'total ÷ cantidad de ventas'
            }
            className="col-span-2 sm:col-span-1 sm:min-w-[150px]"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Vista de las ventas"
          className="inline-flex rounded-lg border border-border bg-card p-0.5"
        >
          <BotonVista actual={vista} valor="REGISTROS" onSelect={setVista}>
            Registros
          </BotonVista>
          <BotonVista actual={vista} valor="SEMANAL" onSelect={setVista}>
            Resumen semanal
          </BotonVista>
        </div>
        {/* Cuántas filas quedan fuera, para que nadie crea que se perdieron. */}
        {historico.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Switch checked={verHistorico} onChange={setVerHistorico} label="Ver histórico importado" />
            <span className="text-xs text-muted-foreground">
              {verHistorico
                ? `Se ven también las ${historico.length} fila(s) del historial semanal del Excel (${money(
                    historico.reduce((s, r) => s + r.amount, 0),
                  )}): son totales de una semana, sin detalle, y están fechadas el lunes.`
                : `${historico.length} fila(s) del historial semanal del Excel (${money(
                    historico.reduce((s, r) => s + r.amount, 0),
                  )}) no se muestran: no son ventas de mostrador.`}
            </span>
          </div>
        )}
      </div>

      {vista === 'SEMANAL' ? (
        isLoading ? (
          <TableSkeleton cols={4} />
        ) : (
          <SalesWeeklySummary
            filas={mostradorVisible}
            rango={{ from: range.from, to: range.to }}
            money={money}
            historicoOculto={historico.length}
          />
        )
      ) : (
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <TableSkeleton cols={5} />
            ) : visibles.length === 0 ? (
              <EmptyState
                icon={ShoppingCart}
                description={
                  hayFiltros
                    ? 'Ninguna venta con esos filtros. Probá quitando alguno.'
                    : 'Sin ventas de mostrador en este periodo. Registrá la primera con «Registrar venta de mostrador».'
                }
                action={
                  hayFiltros ? undefined : (
                    <Button variant="accent" onClick={() => setOpenManual(true)}>
                      <Plus className="h-4 w-4" /> Registrar venta de mostrador
                    </Button>
                  )
                }
              />
            ) : (
              <>
                {/* Escritorio: tabla. */}
                <div className="hidden md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-semibold">Fecha</th>
                        {/* La columna "Tipo" solo tiene sentido con el histórico a
                            la vista: si no, todas las filas son de mostrador. */}
                        {conHistorico && <th className="px-4 py-3 font-semibold">Tipo</th>}
                        <th className="px-4 py-3 font-semibold">Nota</th>
                        <th className="px-4 py-3 text-right font-semibold">Monto</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((s) => (
                        <tr
                          key={s.id}
                          className="border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40"
                        >
                          <td className="px-4 py-3 tabular">{formatoDiaVenta(s.date)}</td>
                          {conHistorico && (
                            <td className="px-4 py-3">
                              <Badge variant={s.kind === 'ENCARGO' ? 'brand' : 'outline'}>
                                {SALE_KIND_LABELS[s.kind]}
                              </Badge>
                            </td>
                          )}
                          <td className="px-4 py-3 text-muted-foreground">
                            <div>{s.note ?? '—'}</div>
                            {/* El cliente ya no tiene columna (casi siempre está
                                vacío), pero el vínculo no se pierde: va acá. */}
                            {s.client && (
                              <div className="text-xs">Cliente: {s.client.name}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-display font-bold tabular">
                            {money(s.amount)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Tooltip label="Eliminar venta">
                              <Button variant="ghost" size="icon" onClick={() => borrar(s.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </Tooltip>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Móvil: tarjetas apiladas (una tabla de 5 columnas desborda). */}
                <div className="divide-y divide-border/70 md:hidden">
                  {visibles.map((s) => (
                    <div key={s.id} className="flex items-start gap-2 p-4">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="tabular text-sm">{formatoDiaVenta(s.date)}</span>
                          {conHistorico && (
                            <Badge variant={s.kind === 'ENCARGO' ? 'brand' : 'outline'}>
                              {SALE_KIND_LABELS[s.kind]}
                            </Badge>
                          )}
                        </div>
                        <div className="break-words text-sm text-muted-foreground">
                          {s.note ?? '—'}
                        </div>
                        {s.client && (
                          <div className="break-words text-xs text-muted-foreground">
                            Cliente: {s.client.name}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-display font-bold tabular">{money(s.amount)}</div>
                        <Button variant="ghost" size="icon" onClick={() => borrar(s.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {openManual && (
        <ManualSaleModal
          onClose={() => setOpenManual(false)}
          onSaved={() => {
            setOpenManual(false);
            qc.invalidateQueries({ queryKey: ['sales'] });
          }}
        />
      )}
    </div>
  );
}

/** Un select de filtro con su opción "todos" (valor vacío). */
function SelectFiltro({
  todos,
  opciones,
  value,
  onChange,
}: {
  todos: string;
  opciones: OpcionFiltro[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select className="w-full sm:w-44" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{todos}</option>
      {opciones.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

function BotonVista({
  actual,
  valor,
  onSelect,
  children,
}: {
  actual: Vista;
  valor: Vista;
  onSelect: (v: Vista) => void;
  children: ReactNode;
}) {
  const activo = actual === valor;
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => onSelect(valor)}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        activo
          ? 'bg-brand-yellow/15 text-brand-yellow-ink shadow-glow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function ManualSaleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<{ id: string; name: string }[]>('/clients')).data,
  });
  const [form, setForm] = useState({ date: todayKey(), amount: 0, clientId: '', note: '' });
  const [attr, setAttr] = useState<Attribution>(EMPTY_ATTRIBUTION);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/sales', {
        date: form.date,
        amount: form.amount,
        // Siempre mostrador: la API rechaza ventas ENCARGO nuevas (encargo = pedido).
        kind: 'COUNTER',
        clientId: form.clientId || null,
        note: form.note || null,
        originChannel: attr.originChannel,
        campaignId: attr.campaignId,
      });
      onSaved();
    } catch (e) {
      notify.error(apiErrorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Registrar venta de mostrador"
      description="Venta en el momento. Un encargo va en Encargos, con su cliente y sus abonos."
    >
      <div className="space-y-3">
        <FieldGrid min="11rem" className="gap-3">
          <Field label="Fecha">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Monto">
            <NumberInput step="0.01" value={form.amount} onChange={(n) => setForm({ ...form, amount: n })} />
          </Field>
        </FieldGrid>
        <Field label="Cliente (opcional)">
          <Select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            <option value="">Sin cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nota (opcional)">
          <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Ej. llaveros" />
        </Field>
        <AttributionPicker value={attr} onChange={setAttr} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="accent" onClick={save} disabled={saving || form.amount <= 0}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
