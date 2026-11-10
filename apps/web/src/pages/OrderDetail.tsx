import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, Lock, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { saldoAFavorDelAbono, usdDesdeMoneda, type OrderLineDto } from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import { useDocRate, useExchangeRates } from '@/features/settings/useExchangeRates';
import { useOrder, ORDER_STATUS_OPTIONS } from '@/features/orders/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, NumberInput, PageSkeleton, Select, Stat, FieldGrid } from '@/components/ui';
import { OrderLinesEditor, EMPTY_ORDER_LINE } from '@/features/orders/OrderLinesEditor';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { formatStoredDay, todayKey } from '@/lib/today';
import { ProductionCard } from '@/features/orders/ProductionCard';
import { AttributionPicker } from '@/features/campaigns/AttributionPicker';

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
        ? `\nEntrega: ${formatStoredDay(order.deliveryDate)}`
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

  /**
   * La COTIZACIÓN para el cliente. Desde 2026-09-07 cotizar es el primer estado
   * del pedido: no hay una entidad "presupuesto" aparte, así que este documento
   * sale de acá con las líneas ya acordadas.
   */
  const downloadQuotePdf = async () => {
    if (!order) return;
    try {
      const res = await api.get(`/orders/${id}/cotizacion.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cotizacion-${order.code}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
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
        <ArrowLeft className="h-4 w-4" /> Encargos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-9 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">
              Encargo #{order.code} · {order.client?.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {order.client?.phone ? `${order.client.phone} · ` : ''}
              {order.deliveryDate
                ? `entrega ${formatStoredDay(order.deliveryDate)}`
                : 'sin fecha de entrega'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Estado del encargo"
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
          <Button
            variant="outline"
            onClick={downloadQuotePdf}
            disabled={order.lines.length === 0}
            title={
              order.lines.length === 0
                ? 'Agrega artículos para poder cotizar'
                : 'Lo que se le manda al cliente: sin costos ni márgenes'
            }
          >
            <Download className="h-4 w-4" /> Cotización
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

        {/* Abonos, de dónde vino y, al final, lo que pasó al producirlo */}
        <div className="space-y-5">
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
                      {formatStoredDay(p.date)}
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
                Encargo saldado
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* De dónde vino: alimenta el ROI por campaña. Parchea al cambiar, como
            Estado y Fecha de entrega — no hay un modal de "editar encargo". */}
        <Card>
          <CardHeader>
            <CardTitle>¿De dónde vino?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Atribúyelo a una campaña para medir cómo le fue: lo vendido de este encargo suma al ROI de esa campaña.
            </p>
            <AttributionPicker
              value={{ originChannel: order.originChannel ?? null, campaignId: order.campaignId ?? null }}
              onChange={(v) => patch.mutate({ ...v })}
            />
          </CardContent>
        </Card>

        {/* ÚLTIMA a propósito: casi no se usa y el dueño la quiere al final
            (2026-11-07). El orden de la columna lo decide el uso, no el flujo. */}
        <ProductionCard order={order} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={async () => {
            if (await confirm({ title: `¿Eliminar el encargo #${order.code}?` })) {
              await api.delete(`/orders/${id}`);
              qc.invalidateQueries({ queryKey: ['orders'] });
              navigate('/orders');
            }
          }}
        >
          <Trash2 className="h-4 w-4" /> Eliminar encargo
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
          currencyLabel={order.currencyLabel}
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
  currencyLabel,
  onClose,
  onSave,
}: {
  initial: OrderLineDto[];
  /** Moneda del documento, para ver el total también en ella. */
  currencyLabel?: string | null;
  onClose: () => void;
  onSave: (lines: OrderLineDto[]) => void;
}) {
  // El MISMO editor que "Nuevo encargo" (2026-10-02). Eran dos formularios de
  // artículos con UX distinta: acá los números seguían sin etiqueta y sin total.
  const [lines, setLines] = useState<OrderLineDto[]>(
    initial.length ? initial : [{ ...EMPTY_ORDER_LINE }],
  );

  return (
    <Dialog open onOpenChange={(n) => !n && onClose()} title="Editar artículos">
      <div className="space-y-3">
        <OrderLinesEditor lines={lines} onChange={setLines} currencyLabel={currencyLabel} />
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

/**
 * REGISTRAR UN ABONO, en USD o en la moneda en que de verdad cobró (2026-11-07).
 *
 * El campo "Monto" pide lo que el cliente entregó: dólares si cobró en dólares,
 * bolívares si cobró en bolívares. La app hace la cuenta, no el dueño.
 *
 * ⚠️ **La tasa la escribe ÉL.** Se precarga la vigente porque es el caso
 * normal, pero el número que manda es el que cobró: antes de esto el servidor
 * le pegaba al abono la tasa vigente al momento de guardar, así que un cobro a
 * otra tasa quedaba registrado con una que nunca se usó.
 *
 * ⚠️ **El USD no se manda**: lo deriva el servidor con los bolívares y la tasa
 * (ver `PaymentCreateSchema`). Acá se calcula lo MISMO solo para mostrarlo, con
 * la misma función pura del motor — no con una división escrita a mano, o el
 * número de la pantalla y el que se guarda podrían no coincidir.
 */
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
  const { money } = useMoney();
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: tasas } = useExchangeRates();
  const monedas = tasas?.rates ?? [];

  /** `''` = cobró en dólares. Si no, el nombre de la tasa. */
  const [moneda, setMoneda] = useState('');
  const elegida = monedas.find((r) => r.label === moneda) ?? null;

  const [monto, setMonto] = useState(Math.max(0, maxSuggested));
  const [tasa, setTasa] = useState(0);

  /**
   * Al cambiar de moneda se repone el campo: la tasa vigente y un monto que
   * tenga sentido en ESA moneda. Dejar los bolívares al volver a USD cargaría
   * un abono de miles de dólares con un solo toque.
   */
  const elegirMoneda = (label: string) => {
    setMoneda(label);
    const r = monedas.find((m) => m.label === label) ?? null;
    setTasa(r?.rate ?? 0);
    const pendiente = Math.max(0, maxSuggested);
    setMonto(r ? Number((pendiente * r.rate).toFixed(2)) : pendiente);
  };

  // En USD el monto ES el monto; en otra moneda, el que deriva la tasa.
  const usd = elegida && tasa > 0 && monto > 0 ? usdDesdeMoneda(monto, tasa) : elegida ? 0 : monto;
  const aFavor = saldoAFavorDelAbono(maxSuggested, usd);
  const puedeGuardar = !saving && monto > 0 && (!elegida || tasa > 0);

  const save = async () => {
    setSaving(true);
    try {
      await api.post(
        `/orders/${orderId}/payments`,
        elegida
          ? // ⚠️ Sin `amount`: el schema lo RECHAZA si viaja junto con la moneda.
            {
              date,
              note: note || null,
              currencyLabel: elegida.label,
              rate: tasa,
              amountForeign: monto,
            }
          : { date, amount: monto, note: note || null },
      );
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
          if (puedeGuardar) save();
        }}
      >
        <FieldGrid min="11rem" className="gap-3">
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="¿Cómo pagó?">
            <Select
              aria-label="Cómo pagó"
              value={moneda}
              onChange={(e) => elegirMoneda(e.target.value)}
            >
              <option value="">En dólares</option>
              {monedas.map((r) => (
                <option key={r.label} value={r.label}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        </FieldGrid>

        <FieldGrid min="11rem" className="gap-3">
          <Field label={elegida ? `Monto (${elegida.currencyCode})` : 'Monto (USD)'}>
            <NumberInput
              autoFocus
              step="0.01"
              aria-label={elegida ? `Monto (${elegida.currencyCode})` : 'Monto (USD)'}
              value={monto}
              onChange={setMonto}
            />
          </Field>
          {elegida && (
            <Field
              label={`Tasa (${elegida.currencyCode} por USD)`}
              hint="Viene la de hoy; cámbiala si cobraste a otra"
            >
              <NumberInput
                step="0.0001"
                aria-label={`Tasa (${elegida.currencyCode} por USD)`}
                value={tasa}
                onChange={setTasa}
                min={0}
              />
            </Field>
          )}
        </FieldGrid>

        {elegida && (
          <p className="text-sm text-muted-foreground">
            {tasa > 0 ? (
              <>
                Se registra como <strong className="text-foreground">{money(usd)}</strong>
                {' · '}
                {elegida.currencyCode} {monto.toLocaleString('es-VE')} ÷ {tasa.toLocaleString('es-VE')}
              </>
            ) : (
              <span className="text-destructive">Escribe la tasa a la que cobraste.</span>
            )}
          </p>
        )}

        {/*
          ⚠️ AVISA Y DEJA GUARDAR (ámbar, no rojo). Pasarse unos centavos por
          diferencia cambiaria es legítimo y es justo el caso que esto viene a
          resolver; bloquear ahí sería bloquear lo normal. Rojo queda para lo
          que el servidor rechaza.
        */}
        {aFavor > 0 && (
          <p className="rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm text-warning">
            Este abono supera lo que falta: quedan <strong>{money(aFavor)}</strong> a favor del
            cliente. Se registra igual.
          </p>
        )}

        <Field label="Nota (opcional)">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej. adelanto por Pago Móvil"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="accent" disabled={!puedeGuardar}>
            {saving ? 'Guardando…' : 'Registrar abono'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
