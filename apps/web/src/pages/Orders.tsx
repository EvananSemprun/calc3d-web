import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Package } from 'lucide-react';
import type { OrderLineDto } from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import { useOrders, ORDER_STATUS, ORDER_STATUS_OPTIONS, type Order } from '@/features/orders/api';
import { OrdersShell } from '@/features/orders/OrdersShell';
import {
  OrdersDateFilterControl,
  OrdersUndatedNotice,
  useOrdersDateFilter,
} from '@/features/orders/OrdersDateFilter';
import { EMPTY_ORDER_LINE, OrderLinesEditor } from '@/features/orders/OrderLinesEditor';
import { useDocumentCurrency } from '@/features/orders/useDocumentCurrency';
import { useSortable } from '@/lib/useSortable';
import { usePersistentState } from '@/lib/usePersistentState';
import { uniqueSorted } from '@/lib/utils';
import { formatStoredDay } from '@/lib/today';
import { useStoreProducts } from '@/features/store/api';
import { CurrencyPicker } from '@/features/settings/CurrencyPicker';
import { AttributionPicker, EMPTY_ATTRIBUTION, type Attribution } from '@/features/campaigns/AttributionPicker';
import { Badge, Button, Card, CardContent, EmptyState, Field, Input, FilterBar, Select, SortHeader, TableSkeleton, FieldGrid } from '@/components/ui';
import { Dialog } from '@/components/overlays';
import { notify } from '@/components/toast';

export function OrdersPage() {
  const { money } = useMoney();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: orders = [], isLoading } = useOrders();
  const [open, setOpen] = useState(false);

  const pendiente = orders.reduce((s, o) => s + o.balance, 0);

  // Filtros como selects (pedido del dueño): valores cerrados, sin tipear.
  const [estadoF, setEstadoF] = usePersistentState('orders:status', '');
  const [clienteF, setClienteF] = usePersistentState('orders:client', '');
  const clientes = useMemo(() => uniqueSorted(orders.map((o) => o.client?.name)), [orders]);
  // Un valor guardado que ya no existe dejaría el select en blanco y la lista vacía.
  const estadoSeguro = ORDER_STATUS_OPTIONS.some((s) => s.value === estadoF) ? estadoF : '';
  const clienteSeguro = clientes.includes(clienteF) ? clienteF : '';
  const rows = useMemo(
    () =>
      orders
        .map((o) => ({ ...o, clientName: o.client?.name ?? '' }))
        .filter(
          (o) =>
            (!estadoSeguro || o.status === estadoSeguro) &&
            (!clienteSeguro || o.clientName === clienteSeguro),
        ),
    [orders, estadoSeguro, clienteSeguro],
  );
  type OrderRow = Order & { clientName: string };
  // El filtro de fecha vive SOLO en esta pestaña (el calendario ya es una vista
  // por fecha y Por cobrar ordena por antigüedad). Arranca en "Todo".
  const dateFilter = useOrdersDateFilter<OrderRow>(rows);
  const { sorted, sortKey, sortDir, toggle } = useSortable<OrderRow>(dateFilter.rows, 'code', 'desc');
  const sort = { sortKey, sortDir, toggle };

  return (
    <OrdersShell
      title="Encargos"
      description={`Encargos con fecha de entrega, abonos y saldo. Por cobrar: ${money(pendiente)}.`}
      actions={
        <Button variant="accent" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo encargo
        </Button>
      }
    >
      {orders.length > 0 && (
        <div className="space-y-2">
          <FilterBar>
            <Select className="w-full sm:w-44" value={estadoSeguro} onChange={(e) => setEstadoF(e.target.value)}>
              <option value="">Estado: todos</option>
              {ORDER_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select className="w-full sm:w-52" value={clienteSeguro} onChange={(e) => setClienteF(e.target.value)}>
              <option value="">Cliente: todos</option>
              {clientes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <OrdersDateFilterControl filter={dateFilter} />
          </FilterBar>
          <OrdersUndatedNotice filter={dateFilter} />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton cols={6} />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={Package}
              description="Sin encargos todavía. Crea el primero para dejar de llevarlos por WhatsApp."
              action={
                <Button variant="accent" onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" /> Nuevo encargo
                </Button>
              }
            />
          ) : sorted.length === 0 ? (
            <EmptyState icon={Package} description="Ningún encargo coincide con los filtros." />
          ) : (
            <>
              {/* Desktop: tabla ordenable */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <SortHeader<OrderRow> label="N°" sortKey="code" sort={sort} />
                      <SortHeader<OrderRow> label="Cliente" sortKey="clientName" sort={sort} />
                      <SortHeader<OrderRow> label="Entrega" sortKey="deliveryDate" sort={sort} />
                      <SortHeader<OrderRow> label="Estado" sortKey="status" sort={sort} />
                      <SortHeader<OrderRow> label="Total" sortKey="total" sort={sort} className="text-right" />
                      <SortHeader<OrderRow> label="Saldo" sortKey="balance" sort={sort} className="text-right" />
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {sorted.map((o) => (
                      <tr
                        key={o.id}
                        className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-accent/40"
                        onClick={() => navigate(`/orders/${o.id}`)}
                      >
                        <td className="px-4 py-3 font-mono">#{o.code}</td>
                        <td className="px-4 py-3">{o.clientName || '—'}</td>
                        <td className="px-4 py-3">
                          {o.deliveryDate ? formatStoredDay(o.deliveryDate) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</span>
                        </td>
                        <td className="px-4 py-3 text-right">{money(o.total)}</td>
                        <td className="px-4 py-3 text-right">
                          {o.balance > 0 ? (
                            <span className="font-semibold text-brand-yellow-ink">{money(o.balance)}</span>
                          ) : (
                            <Badge variant="success">saldado</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Móvil: tarjetas */}
              <div className="divide-y divide-border/70 md:hidden">
                {sorted.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => navigate(`/orders/${o.id}`)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-accent/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">#{o.code}</span>
                        <span className="truncate font-medium">{o.clientName || 'Sin cliente'}</span>
                      </div>
                      <div className="mt-0.5 text-xs">
                        <span className={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</span>
                        {o.deliveryDate && (
                          <span className="text-muted-foreground">
                            {' '}
                            · entrega {formatStoredDay(o.deliveryDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular">
                      <div className="font-semibold">{money(o.total)}</div>
                      {o.balance > 0 ? (
                        <div className="text-xs text-brand-yellow-ink">saldo {money(o.balance)}</div>
                      ) : (
                        <div className="text-xs text-success">saldado</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {open && (
        <NewOrderModal
          onClose={() => setOpen(false)}
          onSaved={(id) => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ['orders'] });
            navigate(`/orders/${id}`);
          }}
        />
      )}
    </OrdersShell>
  );
}

function NewOrderModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<{ id: string; name: string }[]>('/clients')).data,
  });
  const { data: products = [] } = useStoreProducts();
  const { money } = useMoney();
  const [clientId, setClientId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  // Moneda con valor SEGURO: si la etiqueta por defecto ya no existe, "Solo USD".
  const currency = useDocumentCurrency();
  const [attr, setAttr] = useState<Attribution>(EMPTY_ATTRIBUTION);
  const [lines, setLines] = useState<OrderLineDto[]>([{ ...EMPTY_ORDER_LINE }]);
  const [saving, setSaving] = useState(false);

  /** Agrega una línea desde un producto del catálogo (nombre + precio vigente). */
  const addFromProduct = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const line: OrderLineDto = { description: p.name, quantity: 1, unit: 'u', unitPrice: Number(p.priceUsd) };
    setLines((ls) => {
      // Si la única línea está vacía, reemplázala en vez de dejar una en blanco.
      if (ls.length === 1 && !ls[0].description.trim()) return [line];
      return [...ls, line];
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const clean = lines.filter((l) => l.description.trim() && l.quantity > 0);
      const res = await api.post<{ id: string }>('/orders', {
        clientId,
        deliveryDate: deliveryDate || null,
        lines: clean,
        currencyLabel: currency.value,
        originChannel: attr.originChannel,
        campaignId: attr.campaignId,
      });
      onSaved(res.data.id);
    } catch (e) {
      notify.error(apiErrorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(n) => !n && onClose()} title="Nuevo encargo">
      {/* Los datos del cliente y los artículos son dos bloques separados: antes
          las filas de artículo arrancaban pegadas al formulario. */}
      <div className="space-y-5">
        <FieldGrid min="11rem" className="gap-3">
          <Field label="Cliente" required>
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Elige un cliente…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha de entrega">
            <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
          </Field>
          <div className="col-span-full">
            <CurrencyPicker value={currency.value} onChange={currency.setValue} />
          </div>
          <div className="col-span-full">
            <AttributionPicker value={attr} onChange={setAttr} />
          </div>
        </FieldGrid>

        <OrderLinesEditor
          lines={lines}
          onChange={setLines}
          currencyLabel={currency.value}
          extra={
            products.length > 0 && (
              <div className="w-52">
                <Select
                  value=""
                  onChange={(e) => e.target.value && addFromProduct(e.target.value)}
                  aria-label="Agregar desde productos"
                >
                  <option value="">+ Desde productos…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {money(Number(p.priceUsd))}
                    </option>
                  ))}
                </Select>
              </div>
            )
          }
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={save} disabled={saving || !clientId}>
            {saving ? 'Guardando…' : 'Crear encargo'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
