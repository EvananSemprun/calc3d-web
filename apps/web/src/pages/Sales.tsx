import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShoppingCart, Trash2, Wand2 } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import { Badge, Button, Card, CardContent, EmptyState, Field, Input, NumberInput, Select, Stat, TableSkeleton } from '@/components/ui';
import { Dialog, useConfirm, Tooltip } from '@/components/overlays';
import { notify } from '@/components/toast';
import { DateRangePicker, useDateRange } from '@/features/finance/DateRange';
import { SALE_KIND_LABELS, useSales } from '@/features/finance/api';
import { AttributionPicker, EMPTY_ATTRIBUTION, type Attribution } from '@/features/campaigns/AttributionPicker';

const todayIso = () => {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};

export function SalesPage() {
  const range = useDateRange('MONTH', 'sales');
  const { money } = useMoney();
  const qc = useQueryClient();
  const { data: sales = [], isLoading } = useSales(range);
  const [openManual, setOpenManual] = useState(false);
  const [openQuote, setOpenQuote] = useState(false);
  const confirm = useConfirm();

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/sales/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      notify.success('Venta eliminada');
    },
    onError: (error) => notify.error(apiErrorMessage(error)),
  });

  const total = sales.reduce((s, r) => s + r.amount, 0);
  const encargos = sales.filter((s) => s.kind === 'ENCARGO').reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Ventas</h1>
            <p className="text-sm text-muted-foreground">Registra cada venta; el total se calcula solo.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setOpenQuote(true)}>
            <Wand2 className="h-4 w-4" /> Desde presupuesto
          </Button>
          <Button variant="accent" onClick={() => setOpenManual(true)}>
            <Plus className="h-4 w-4" /> Registrar venta
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker range={range} />
        <div className="flex gap-3">
          <Stat label="Total del periodo" value={money(total)} accent="yellow" className="min-w-[150px]" />
          <Stat label="De encargos" value={money(encargos)} className="min-w-[150px]" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton cols={5} />
          ) : sales.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              description="Sin ventas en este periodo. Registra una venta o conviértela desde un presupuesto."
              action={
                <Button variant="accent" onClick={() => setOpenManual(true)}>
                  <Plus className="h-4 w-4" /> Registrar venta
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                    <th className="px-4 py-3 font-semibold">Tipo</th>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Nota</th>
                    <th className="px-4 py-3 text-right font-semibold">Monto</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className="border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 tabular">{s.date.slice(0, 10)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={s.kind === 'ENCARGO' ? 'brand' : 'outline'}>
                          {SALE_KIND_LABELS[s.kind]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.client?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.note ?? '—'}</td>
                      <td className="px-4 py-3 text-right font-display font-bold tabular">{money(s.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <Tooltip label="Eliminar venta">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: '¿Eliminar esta venta?',
                                  description: 'Esta acción no se puede deshacer.',
                                  confirmLabel: 'Eliminar',
                                  tone: 'destructive',
                                })
                              ) {
                                remove.mutate(s.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {openManual && <ManualSaleModal onClose={() => setOpenManual(false)} onSaved={() => { setOpenManual(false); qc.invalidateQueries({ queryKey: ['sales'] }); }} />}
      {openQuote && <FromQuoteModal onClose={() => setOpenQuote(false)} onSaved={() => { setOpenQuote(false); qc.invalidateQueries({ queryKey: ['sales'] }); }} />}
    </div>
  );
}

function ManualSaleModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<{ id: string; name: string }[]>('/clients')).data,
  });
  const [form, setForm] = useState({ date: todayIso(), amount: 0, kind: 'COUNTER', clientId: '', note: '' });
  const [attr, setAttr] = useState<Attribution>(EMPTY_ATTRIBUTION);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/sales', {
        date: form.date,
        amount: form.amount,
        kind: form.kind,
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
      title="Registrar venta"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Monto">
            <NumberInput step="0.01" value={form.amount} onChange={(n) => setForm({ ...form, amount: n })} />
          </Field>
        </div>
        <Field label="Tipo">
          <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="COUNTER">Mostrador</option>
            <option value="ENCARGO">Encargo</option>
          </Select>
        </Field>
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

function FromQuoteModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: quotes = [] } = useQuery({
    queryKey: ['quotes'],
    queryFn: async () => (await api.get<{ id: string; name: string; status: string }[]>('/quotes')).data,
  });
  const [quoteId, setQuoteId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/sales/from-quote', { quoteId, date, kind: 'ENCARGO' });
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
      title="Venta desde presupuesto"
      description="El monto se toma del precio sugerido del presupuesto."
    >
      <div className="space-y-3">
        <Field label="Presupuesto">
          <Select value={quoteId} onChange={(e) => setQuoteId(e.target.value)}>
            <option value="">Elegir presupuesto…</option>
            {quotes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="accent" onClick={save} disabled={saving || !quoteId}>
            {saving ? 'Guardando…' : 'Crear venta'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
