import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Lock, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import type { OrderLineDto } from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import { useDocRate } from '@/features/settings/useExchangeRates';
import { useOrder, ORDER_STATUS_OPTIONS } from '@/features/orders/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, NumberInput, PageSkeleton, Select, Stat } from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { todayKey } from '@/lib/today';
import { ProductionCard } from '@/features/orders/ProductionCard';

const todayIso = () => todayKey();

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { money, moneyAtRate } = useMoney();
  const { data: order, isLoading } = useOrder(id);
  // Bs EN VIVO mientras el pedido no esté cerrado; congelados una vez emitida la nota.
  const docRate = useDocRate(order?.exchangeRates, { frozen: !!order?.settledAt });
  const moneyAlt = docRate ? (n: number) => moneyAtRate(n, docRate.rate, docRate.currencyCode) : null;
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const confirm = useConfirm();

  const shareWhatsApp = () => {
    if (!order) return;
    const items = order.lines.map((l) => `• ${l.quantity} ${l.unit ?? ''} ${l.description}`).join('\n');
    const msg =
      `Hola ${order.client.name}, aquí el resumen de tu pedido #${order.code}:\n${items}\n\n` +
      `Total: ${money(order.total)}\nAbonado: ${money(order.paid)}\nSaldo: ${money(order.balance)}` +
      (order.deliveryDate
        ? `\nEntrega: ${new Date(order.deliveryDate).toLocaleDateString('es-VE')}`
        : '');
    // Teléfono a formato internacional: quita no-dígitos; 0 inicial (Venezuela) → 58.
    const raw = (order.client.phone ?? '').replace(/\D/g, '');
    const phone = raw.startsWith('0') ? `58${raw.slice(1)}` : raw;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener');
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['orders', id] });
    qc.invalidateQueries({ queryKey: ['orders'] });
  };

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/orders/${id}`, body),
    onSuccess: invalidate,
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const removePayment = useMutation({
    mutationFn: (paymentId: string) => api.delete(`/orders/${id}/payments/${paymentId}`),
    onSuccess: () => {
      invalidate();
      notify.success('Abono eliminado');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const settle = useMutation({
    mutationFn: () => api.post(`/orders/${id}/settle`),
    onSuccess: invalidate,
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const downloadNotePdf = async (code: number) => {
    const res = await api.get(`/orders/${id}/delivery-note.pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nota-entrega-${code}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Emitir la nota CONGELA los Bs (con confirmación) la primera vez; luego solo descarga.
  const emitDeliveryNote = async () => {
    if (!order) return;
    try {
      if (!order.settledAt) {
        const ok = await confirm({
          title: `Emitir nota de entrega #${order.code}`,
          description:
            'Se congelará la tasa en bolívares de este pedido con el valor de hoy. A partir de aquí los montos en Bs dejan de actualizarse (quedan finales).',
          confirmLabel: 'Emitir y congelar',
        });
        if (!ok) return;
        await settle.mutateAsync();
      }
      await downloadNotePdf(order.code);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  if (isLoading || !order) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <Link to="/orders" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Pedidos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-9 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">
              Pedido #{order.code} · {order.client?.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {order.client?.phone ? `${order.client.phone} · ` : ''}
              {order.deliveryDate
                ? `entrega ${new Date(order.deliveryDate).toLocaleDateString('es-VE')}`
                : 'sin fecha de entrega'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="w-44"
            value={order.status}
            onChange={(e) => patch.mutate({ status: e.target.value })}
          >
            {ORDER_STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Input
            type="date"
            className="w-40"
            value={order.deliveryDate ? order.deliveryDate.slice(0, 10) : ''}
            onChange={(e) => patch.mutate({ deliveryDate: e.target.value || null })}
          />
          <Button variant="outline" onClick={shareWhatsApp} disabled={!order.client.phone} title={order.client.phone ? undefined : 'El cliente no tiene teléfono'}>
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </Button>
          <Button variant="outline" onClick={emitDeliveryNote} disabled={settle.isPending}>
            <Download className="h-4 w-4" />
            {order.settledAt ? 'Nota de entrega' : 'Emitir nota de entrega'}
          </Button>
        </div>
      </div>

      {/* KPIs de dinero */}
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Total"
          value={money(order.total)}
          sub={moneyAlt ? `≈ ${moneyAlt(order.total)}` : undefined}
        />
        <Stat label="Abonado" value={money(order.paid)} accent="success" />
        <Stat
          label="Saldo"
          value={money(order.balance)}
          accent={order.balance > 0 ? 'yellow' : 'success'}
          sub={moneyAlt ? `≈ ${moneyAlt(order.balance)}` : order.balance <= 0 ? 'saldado' : undefined}
        />
      </div>

      {/* Estado de la tasa en bolívares: en vivo vs cerrada */}
      {docRate && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/30 px-3 py-2 text-xs text-muted-foreground">
          {order.settledAt ? (
            <>
              <Lock className="h-3.5 w-3.5 text-brand-yellow-ink" />
              <span>
                Bs cerrados el {new Date(order.settledAt).toLocaleDateString('es-VE')} · tasa{' '}
                {docRate.rate.toLocaleString('es-VE')} {docRate.currencyCode}/USD
                {docRate.label ? ` (${docRate.label})` : ''} — montos en Bs finales.
              </span>
            </>
          ) : (
            <>
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-success" />
              <span>
                Bs <strong>en vivo</strong> · tasa de hoy {docRate.rate.toLocaleString('es-VE')}{' '}
                {docRate.currencyCode}/USD{docRate.label ? ` (${docRate.label})` : ''}. Se congelan al
                emitir la nota de entrega.
              </span>
            </>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Artículos */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Artículos</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Editar
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Descripción</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Cant.</th>
                  <th className="px-4 py-2.5 text-right font-semibold">P. unit.</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {order.lines.map((l, i) => (
                  <tr key={i} className="border-b border-border/70 last:border-0">
                    <td className="px-4 py-3">{l.description}</td>
                    <td className="px-4 py-3 text-right">
                      {l.quantity} {l.unit ?? ''}
                    </td>
                    <td className="px-4 py-3 text-right">{money(l.unitPrice)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(l.quantity * l.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Lo que pasó al producirlo + abonos */}
        <div className="space-y-5">
        <ProductionCard order={order} />
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Abonos</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setPayOpen(true)}>
              <Plus className="h-4 w-4" /> Abono
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {order.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin abonos. El saldo es el total.</p>
            ) : (
              order.payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background/30 px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-semibold tabular">
                      {money(p.amount)}
                      {p.rate ? (
                        <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                          ≈ {moneyAtRate(p.amount, Number(p.rate), p.currencyCode ?? 'VES')}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(p.date).toLocaleDateString('es-VE')}
                      {p.note ? ` · ${p.note}` : ''}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      if (await confirm({ title: '¿Eliminar este abono?' })) removePayment.mutate(p.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
            {order.balance <= 0 && order.total > 0 && (
              <Badge variant="success" className="mt-1">
                Pedido saldado
              </Badge>
            )}
          </CardContent>
        </Card>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={async () => {
            if (await confirm({ title: `¿Eliminar el pedido #${order.code}?` })) {
              await api.delete(`/orders/${id}`);
              qc.invalidateQueries({ queryKey: ['orders'] });
              navigate('/orders');
            }
          }}
        >
          <Trash2 className="h-4 w-4" /> Eliminar pedido
        </Button>
      </div>

      {payOpen && (
        <AddPaymentModal
          orderId={id}
          maxSuggested={order.balance}
          onClose={() => setPayOpen(false)}
          onSaved={() => {
            setPayOpen(false);
            invalidate();
            notify.success('Abono registrado');
          }}
        />
      )}

      {editOpen && (
        <EditLinesModal
          initial={order.lines}
          onClose={() => setEditOpen(false)}
          onSave={(lines) => {
            patch.mutate(
              { lines },
              {
                onSuccess: () => {
                  setEditOpen(false);
                  notify.success('Artículos actualizados');
                },
              },
            );
          }}
        />
      )}
    </div>
  );
}

function EditLinesModal({
  initial,
  onClose,
  onSave,
}: {
  initial: OrderLineDto[];
  onClose: () => void;
  onSave: (lines: OrderLineDto[]) => void;
}) {
  const [lines, setLines] = useState<OrderLineDto[]>(
    initial.length ? initial : [{ description: '', quantity: 1, unit: 'u', unitPrice: 0 }],
  );
  const setLine = (i: number, patch: Partial<OrderLineDto>) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <Dialog open onOpenChange={(n) => !n && onClose()} title="Editar artículos">
      <div className="space-y-3">
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
            <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
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
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="accent"
            onClick={() => onSave(lines.filter((l) => l.description.trim() && l.quantity > 0))}
          >
            Guardar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function AddPaymentModal({
  orderId,
  maxSuggested,
  onClose,
  onSaved,
}: {
  orderId: string;
  maxSuggested: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState(Math.max(0, maxSuggested));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post(`/orders/${orderId}/payments`, { date, amount, note: note || null });
      onSaved();
    } catch (e) {
      notify.error(apiErrorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(n) => !n && onClose()} title="Registrar abono">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (amount > 0 && !saving) save();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Monto">
            <NumberInput autoFocus step="0.01" value={amount} onChange={setAmount} />
          </Field>
        </div>
        <Field label="Nota (opcional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. adelanto por Pago Móvil" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="accent" disabled={saving || amount <= 0}>
            {saving ? 'Guardando…' : 'Registrar abono'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
