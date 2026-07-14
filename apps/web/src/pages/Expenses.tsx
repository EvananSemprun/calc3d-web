import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  Field,
  Input,
  NumberInput,
  Select,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { Dialog, useConfirm, Tooltip } from '@/components/overlays';
import { notify } from '@/components/toast';
import { DateRangePicker, useDateRange } from '@/features/finance/DateRange';
import {
  EXPENSE_CATEGORY_LABELS,
  LINK_KIND_LABELS,
  expenseLink,
  useExpenses,
  type ExpenseRow,
} from '@/features/finance/api';
import { catalogs } from '@/features/catalogs/config';
import { Combobox } from '@/components/Combobox';
import { useCampaigns } from '@/features/campaigns/api';
import { useExchangeRates } from '@/features/settings/useExchangeRates';

const todayIso = () => {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};

/** Días que duró una campaña (inclusivo). Null si no hay fecha de fin válida. */
function durationDays(from: string, to?: string | null) {
  if (!to) return null;
  const d = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
  return d > 0 ? d : null;
}

/** Tipos de gasto. Los que enlazan catálogo reusan su config de campos. */
type ExpenseType = {
  key: string;
  label: string;
  catalog?: keyof typeof catalogs; // config de campos para alta inline
  endpoint?: string; // endpoint del catálogo
  linkField?: 'materialId' | 'printerId' | 'componentId';
  priceField?: string; // campo de precio de referencia en el catálogo
  perUnit?: boolean; // el precio de referencia = monto / cantidad
  category: ExpenseRow['category'];
  investment?: boolean;
};

const EXPENSE_TYPES: ExpenseType[] = [
  { key: 'filament', label: 'Filamento', catalog: 'materials', endpoint: 'materials', linkField: 'materialId', priceField: 'rollPrice', perUnit: true, category: 'CONSUMABLE' },
  { key: 'printer', label: 'Impresora', catalog: 'printers', endpoint: 'printers', linkField: 'printerId', priceField: 'price', perUnit: false, category: 'EQUIPMENT', investment: true },
  { key: 'component', label: 'Insumo', catalog: 'components', endpoint: 'components', linkField: 'componentId', priceField: 'packagePrice', perUnit: true, category: 'CONSUMABLE' },
  { key: 'maintenance', label: 'Mantenimiento', linkField: 'printerId', category: 'MAINTENANCE' },
  { key: 'general', label: 'General (envío, renta…)', category: 'OTHER' },
  { key: 'advertising', label: 'Publicidad', category: 'ADVERTISING' },
];

/** Defaults sensatos para los campos numéricos del catálogo (igual que en Catálogos). */
const numericDefaults: Record<string, number> = {
  rollGrams: 1000,
  lifetimeHours: 5000,
  unitsPerPackage: 100,
  powerKw: 0,
  maintPerHour: 0,
};

export function ExpensesPage() {
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
      case 'investment': return e.isInvestment;
      case 'general': return !e.material && !e.printer && !e.component && e.category !== 'MAINTENANCE' && e.category !== 'ADVERTISING';
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

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const inversion = rows.filter((r) => r.isInvestment).reduce((s, r) => s + r.amount, 0);

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
        <Button variant="accent" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Registrar gasto
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker range={range} />
          <Select className="w-48" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="ALL">Todos los tipos</option>
            <option value="printer">Impresoras</option>
            <option value="material">Filamentos</option>
            <option value="component">Insumos</option>
            <option value="maintenance">Mantenimiento</option>
            <option value="advertising">Publicidad</option>
            <option value="investment">Inversión</option>
            <option value="general">General</option>
          </Select>
        </div>
        <div className="flex gap-3">
          <Stat label="Total del periodo" value={money(total)} accent="yellow" className="min-w-[150px]" />
          <Stat label="De inversión" value={money(inversion)} accent="blue" className="min-w-[150px]" />
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

function ExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const [typeKey, setTypeKey] = useState('filament');
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [date, setDate] = useState(todayIso());
  const [endDate, setEndDate] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const { data: campaigns = [] } = useCampaigns();
  // Bs congelado (solo publicidad): pagar en bolívares y guardar la tasa usada.
  const [payBs, setPayBs] = useState(false);
  const [bsRateLabel, setBsRateLabel] = useState('');
  const [bsAmount, setBsAmount] = useState(0);
  const { data: ratesResp } = useExchangeRates({ enabled: true });
  const vesRates = (ratesResp?.rates ?? []).filter((r) => r.currencyCode === 'VES');
  const selectedBsRate = vesRates.find((r) => r.label === bsRateLabel);
  const usdFromBs = selectedBsRate && selectedBsRate.rate > 0 ? bsAmount / selectedBsRate.rate : 0;
  const [amount, setAmount] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [providerId, setProviderId] = useState('');
  const [updatePrice, setUpdatePrice] = useState(true);
  const [catForm, setCatForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const type = EXPENSE_TYPES.find((t) => t.key === typeKey)!;
  const linksCatalog = !!type.catalog;
  const cfg = type.catalog ? catalogs[type.catalog] : null;

  // Catálogo existente (para modo "existente" y para mantenimiento → impresoras).
  const listEndpoint = type.endpoint ?? (type.key === 'maintenance' ? 'printers' : undefined);
  const { data: items = [] } = useQuery({
    queryKey: [listEndpoint],
    queryFn: async () => (await api.get<{ id: string; name: string }[]>(`/${listEndpoint}`)).data,
    enabled: !!listEndpoint,
  });

  // Proveedores (opcional, para cualquier tipo de gasto).
  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: async () => (await api.get<{ id: string; name: string }[]>('/providers')).data,
  });

  const initCatForm = (key: string) => {
    const c = EXPENSE_TYPES.find((t) => t.key === key)?.catalog;
    if (!c) return {};
    const out: Record<string, unknown> = {};
    for (const f of catalogs[c].fields) {
      if (f.type === 'number') out[f.name] = numericDefaults[f.name] ?? 0;
      else if (f.type === 'select') out[f.name] = f.options?.[0]?.value ?? '';
      else out[f.name] = '';
    }
    return out;
  };

  const changeType = (key: string) => {
    setTypeKey(key);
    const t = EXPENSE_TYPES.find((x) => x.key === key)!;
    setMode(t.catalog ? 'new' : 'new');
    setSelectedId('');
    setCatForm(initCatForm(key));
  };

  const save = async () => {
    setSaving(true);
    try {
      if (linksCatalog && cfg && type.linkField && type.endpoint) {
        const kind = type.linkField.replace('Id', '') as 'material' | 'printer' | 'component';
        const name = mode === 'new' ? String(catForm.name ?? '') : items.find((i) => i.id === selectedId)?.name ?? '';
        const refValue =
          mode === 'existing' && updatePrice && type.priceField
            ? type.perUnit && quantity > 0
              ? amount / quantity
              : amount
            : null;
        await api.post('/expenses/with-definition', {
          expense: {
            date,
            amount,
            category: type.category,
            description: description || name,
            isInvestment: !!type.investment,
            quantity: type.perUnit ? quantity : null,
            providerId: providerId || null,
          },
          link: {
            kind,
            mode,
            id: mode === 'existing' ? selectedId : null,
            data: mode === 'new' ? catForm : null,
            referenceField: refValue != null ? type.priceField : null,
            referenceValue: refValue,
          },
        });
        qc.invalidateQueries({ queryKey: [type.endpoint] });
      } else {
        // Publicidad en Bs: el `amount` SIEMPRE va en USD base (= Bs ÷ tasa); se
        // guarda la tasa y el código para poder mostrar el Bs congelado luego.
        const useBs = type.key === 'advertising' && payBs && selectedBsRate;
        const effAmount = useBs ? Math.round((usdFromBs) * 10000) / 10000 : amount;
        const base = {
          date,
          amount: effAmount,
          category: type.category,
          isInvestment: !!type.investment,
          quantity: type.perUnit ? quantity : null,
        };
        const payload: Record<string, unknown> = { ...base, description, endDate: endDate || null, providerId: providerId || null };
        if (type.key === 'maintenance' && selectedId) payload.printerId = selectedId;
        if (type.key === 'advertising' && campaignId) payload.campaignId = campaignId;
        if (useBs) {
          payload.rate = selectedBsRate!.rate;
          payload.currencyCode = 'VES';
        }
        await api.post('/expenses', payload);
      }
      onSaved();
    } catch (e) {
      notify.error(e instanceof Error && !('response' in e) ? e.message : apiErrorMessage(e));
      setSaving(false);
    }
  };

  const needsDescription = !linksCatalog; // general/mantenimiento
  const bsActive = type.key === 'advertising' && payBs;
  const amountOk = bsActive ? usdFromBs > 0 && !!selectedBsRate : amount > 0;
  const canSave =
    amountOk &&
    (linksCatalog
      ? mode === 'new'
        ? !!catForm.name
        : !!selectedId
      : !!description);

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Registrar gasto"
      className="max-h-[90vh] overflow-y-auto"
    >
      <div className="space-y-3">
      <Field label="Tipo de gasto">
        <Select value={typeKey} onChange={(e) => changeType(e.target.value)}>
          {EXPENSE_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>

      {linksCatalog && (
        <div className="flex gap-2">
          <ModeButton active={mode === 'new'} onClick={() => setMode('new')}>
            Nuevo (crear en catálogo)
          </ModeButton>
          <ModeButton active={mode === 'existing'} onClick={() => setMode('existing')}>
            Del catálogo
          </ModeButton>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={type.key === 'advertising' ? 'Fecha de inicio' : 'Fecha'}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {!bsActive && (
          <Field label="Monto pagado (USD)">
            <NumberInput step="0.01" value={amount} onChange={setAmount} />
          </Field>
        )}
      </div>

      {type.key === 'advertising' && (
        <>
          <Checkbox checked={payBs} onChange={(v) => setPayBs(v)} label="Pagué en bolívares" />
          {payBs && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-background/30 p-3">
              <Field label="Tasa (Bs por USD)">
                <Select value={bsRateLabel} onChange={(e) => setBsRateLabel(e.target.value)}>
                  <option value="">Elegir tasa…</option>
                  {vesRates.map((r) => (
                    <option key={r.label} value={r.label}>
                      {r.label} · {r.rate.toLocaleString('es-VE')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Monto pagado (Bs)">
                <NumberInput step="0.01" value={bsAmount} onChange={setBsAmount} />
              </Field>
              <p className="col-span-2 text-xs text-muted-foreground">
                {selectedBsRate
                  ? `Equivale a ${usdFromBs.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} (se guarda como costo base).`
                  : 'Elige una tasa en Bs para calcular el equivalente en USD. Si no hay tasas, créalas en Config → Moneda.'}
              </p>
            </div>
          )}
          <Field label="Fecha de fin (opcional)" hint="Para calcular cuántos días duró la campaña.">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="Campaña (opcional)" hint="Enlaza este gasto a una campaña para medir su ROI.">
            <Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Sin campaña</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}

      {/* Existente: elegir del catálogo */}
      {linksCatalog && mode === 'existing' && (
        <>
          <Field label={`Elegir ${cfg?.singular ?? 'item'}`}>
            <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Elegir…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          </Field>
          {type.perUnit && (
            <Field label="Cantidad comprada">
              <NumberInput value={quantity} onChange={(n) => setQuantity(Math.max(1, Math.floor(n)))} />
            </Field>
          )}
          <Checkbox
            checked={updatePrice}
            onChange={setUpdatePrice}
            label="Usar este precio como referencia para cotizar"
          />
        </>
      )}

      {/* Nuevo: crear item de catálogo inline (reusa campos de la config) */}
      {linksCatalog && mode === 'new' && cfg && (
        <div className="space-y-3 rounded-xl border border-border/70 bg-background/30 p-3">
          <p className="text-xs text-muted-foreground">Se creará en el catálogo de {cfg.title}.</p>
          {cfg.fields.map((f) => (
            <Field key={f.name} label={f.label + (f.optional ? ' (opcional)' : '')} hint={f.hint}>
              {f.type === 'combobox' && f.optionsKind ? (
                <Combobox
                  kind={f.optionsKind}
                  value={String(catForm[f.name] ?? '')}
                  onChange={(v) => setCatForm((s) => ({ ...s, [f.name]: v }))}
                />
              ) : f.type === 'number' ? (
                <NumberInput
                  step={f.step}
                  value={Number(catForm[f.name] ?? 0)}
                  onChange={(n) => setCatForm((s) => ({ ...s, [f.name]: n }))}
                />
              ) : f.type === 'select' ? (
                <Select
                  value={String(catForm[f.name] ?? '')}
                  onChange={(e) => setCatForm((s) => ({ ...s, [f.name]: e.target.value }))}
                >
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={String(catForm[f.name] ?? '')}
                  onChange={(e) => setCatForm((s) => ({ ...s, [f.name]: e.target.value }))}
                />
              )}
            </Field>
          ))}
          {type.perUnit && (
            <Field label="Cantidad comprada">
              <NumberInput value={quantity} onChange={(n) => setQuantity(Math.max(1, Math.floor(n)))} />
            </Field>
          )}
        </div>
      )}

      {/* Mantenimiento: enlace opcional a impresora */}
      {type.key === 'maintenance' && (
        <Field label="Impresora (opcional)">
          <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Sin impresora</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {/* Descripción: obligatoria para general/mantenimiento; opcional para enlazados */}
      <Field label={needsDescription ? 'Descripción' : 'Nota (opcional)'}>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            type.key === 'advertising'
              ? 'Medio y campaña (ej. Facebook · promo)'
              : needsDescription
                ? 'Ej. envío, renta…'
                : 'Opcional'
          }
        />
      </Field>

      <Field label="Proveedor (opcional)">
        <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          <option value="">Sin proveedor</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="accent" onClick={save} disabled={saving || !canSave}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
      </div>
    </Dialog>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
        active
          ? 'border-brand-yellow/50 bg-brand-yellow/[0.08] text-foreground shadow-glow-sm'
          : 'border-border text-muted-foreground hover:bg-accent/60'
      }`}
    >
      {children}
    </button>
  );
}

