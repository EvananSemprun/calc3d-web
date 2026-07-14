import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Package, Trash2 } from 'lucide-react';
import type { OrderLineDto } from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import { useOrders, ORDER_STATUS, type Order } from '@/features/orders/api';
import { useSortable } from '@/lib/useSortable';
import { useProducts } from '@/features/products/api';
import { useSettings } from '@/features/settings/useSettings';
import { CurrencyPicker } from '@/features/settings/CurrencyPicker';
import { AttributionPicker, EMPTY_ATTRIBUTION, type Attribution } from '@/features/campaigns/AttributionPicker';
import { Badge, Button, Card, CardContent, EmptyState, Field, Input, NumberInput, SearchInput, Select, SortHeader, TableSkeleton } from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';

export function OrdersPage() {
  const { money } = useMoney();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: orders = [], isLoading } = useOrders();
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      notify.success('Pedido eliminado');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const pendiente = orders.reduce((s, o) => s + o.balance, 0);

  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      orders
        .map((o) => ({ ...o, clientName: o.client?.name ?? '' }))
        .filter(
          (o) =>
            !q ||
            o.clientName.toLowerCase().includes(q) ||
            String(o.code).includes(q) ||
            ORDER_STATUS[o.status].label.toLowerCase().includes(q),
        ),
    [orders, q],
  );
  type OrderRow = Order & { clientName: string };
  const { sorted, sortKey, sortDir, toggle } = useSortable<OrderRow>(rows, 'code', 'desc');
  const sort = { sortKey, sortDir, toggle };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Pedidos</h1>
            <p className="text-sm text-muted-foreground">
              Encargos con fecha de entrega, abonos y saldo. Por cobrar: {money(pendiente)}.
            </p>
          </div>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo pedido
        </Button>
      </div>

      {orders.length > 0 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por cliente, N° o estado…"
          className="w-full sm:max-w-md"
        />
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton cols={6} />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={Package}
              description="Sin pedidos todavía. Crea el primero para sacar los encargos de WhatsApp."
              action={
                <Button variant="accent" onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4" /> Nuevo pedido
                </Button>
              }
            />
          ) : sorted.length === 0 ? (
            <EmptyState icon={Package} description={`Sin pedidos para «${search.trim()}».`} />
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
                      <th className="px-4 py-2.5" />
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
                          {o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('es-VE') : '—'}
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
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              if (await confirm({ title: `¿Eliminar el pedido #${o.code}?` })) remove.mutate(o.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
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
                            · entrega {new Date(o.deliveryDate).toLocaleDateString('es-VE')}
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
    </div>
  );
}

function NewOrderModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<{ id: string; name: string }[]>('/clients')).data,
  });
  const { data: products = [] } = useProducts();
  const { data: settings } = useSettings();
  const { money } = useMoney();
  const [clientId, setClientId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [currencyLabel, setCurrencyLabel] = useState<string | null>(settings?.defaultRateLabel ?? null);
  const [attr, setAttr] = useState<Attribution>(EMPTY_ATTRIBUTION);
  const [lines, setLines] = useState<OrderLineDto[]>([
    { description: '', quantity: 1, unit: 'u', unitPrice: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  const setLine = (i: number, patch: Partial<OrderLineDto>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  /** Agrega una línea desde un producto del catálogo (nombre + precio vigente). */
  const addFromProduct = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const line: OrderLineDto = { description: p.name, quantity: 1, unit: 'u', unitPrice: p.recost.priceSet };
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
        currencyLabel,
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
    <Dialog open onOpenChange={(n) => !n && onClose()} title="Nuevo pedido">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
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
          <div className="col-span-2">
            <CurrencyPicker value={currencyLabel} onChange={setCurrencyLabel} />
          </div>
          <div className="col-span-2">
            <AttributionPicker value={attr} onChange={setAttr} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground">Artículos</p>
            {products.length > 0 && (
              <div className="w-52">
                <Select
                  value=""
                  onChange={(e) => e.target.value && addFromProduct(e.target.value)}
                  aria-label="Agregar desde productos"
                >
                  <option value="">+ Desde productos…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {money(p.recost.priceSet)}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          {lines.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Descripción"
                  value={l.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                />
              </div>
              <div className="w-16">
                <NumberInput value={l.quantity} onChange={(v) => setLine(i, { quantity: v })} />
              </div>
              <div className="w-24">
                <NumberInput step="0.01" value={l.unitPrice} onChange={(v) => setLine(i, { unitPrice: v })} />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLines((ls) => [...ls, { description: '', quantity: 1, unit: 'u', unitPrice: 0 }])}
          >
            <Plus className="h-4 w-4" /> Artículo
          </Button>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={save} disabled={saving || !clientId}>
            {saving ? 'Guardando…' : 'Crear pedido'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
