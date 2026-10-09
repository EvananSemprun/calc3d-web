import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import {
  Button,
  Checkbox,
  Field,
  Input,
  NumberInput,
  Select,
  FieldGrid,
} from '@/components/ui';
import { Dialog } from '@/components/overlays';
import { notify } from '@/components/toast';
import type { ExpenseRow } from '@/features/finance/api';
import { catalogs } from '@/features/catalogs/config';
import { Combobox } from '@/components/Combobox';
import { useCampaigns } from '@/features/campaigns/api';
import { useCounterparties } from '@/features/cash/api';
import { useContacts } from '@/features/contacts/api';
import { useExchangeRates } from '@/features/settings/useExchangeRates';

/**
 * EL FORMULARIO DE UNA COMPRA O UN GASTO, en un solo lugar.
 *
 * Vive fuera de la página de Gastos porque **se abre desde el área de cada
 * cosa**: una compra de filamento se registra en Filamento → Compras, una
 * impresora en su catálogo, un insumo en el suyo. Antes había que salir a
 * Gastos y volver a decir de qué era — un dato que el contexto ya sabía.
 *
 * Con `tipoFijo` el tipo no se elige: entraste por Filamento, es filamento.
 */

/** Valor centinela del desplegable: "no está en la lista, lo escribo". */
const OTRO = '__otro__';

const todayIso = () => {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
};


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
  /**
   * Dónde se registra este tipo, si tiene un área propia.
   *
   * ⚠️ Es un PAR: el tipo que aparece acá **no** se ofrece en el desplegable
   * de Gastos, porque habría dos caminos para lo mismo. Si agregás un botón en
   * una pantalla nueva, marcá su tipo acá; si sacás el botón, sacá la marca o
   * el tipo queda sin ninguna puerta.
   */
  zona?: string;
};

export const EXPENSE_TYPES: ExpenseType[] = [
  { key: 'filament', label: 'Filamento', catalog: 'materials', endpoint: 'materials', linkField: 'materialId', priceField: 'rollPrice', perUnit: true, category: 'CONSUMABLE', zona: 'Filamento → Compras' },
  { key: 'printer', label: 'Impresora', catalog: 'printers', endpoint: 'printers', linkField: 'printerId', priceField: 'price', perUnit: false, category: 'EQUIPMENT', investment: true, zona: 'Catálogo de impresoras' },
  { key: 'component', label: 'Insumo', catalog: 'components', endpoint: 'components', linkField: 'componentId', priceField: 'packagePrice', perUnit: true, category: 'CONSUMABLE', zona: 'Catálogo de insumos' },
  { key: 'maintenance', label: 'Mantenimiento', linkField: 'printerId', category: 'MAINTENANCE' },
  { key: 'general', label: 'General (envío, renta…)', category: 'OTHER' },
  { key: 'design', label: 'Diseño', category: 'DESIGN' },
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
/** Los que NO tienen área propia: es lo único que Gastos ofrece en su desplegable. */
export const TIPOS_SIN_ZONA = EXPENSE_TYPES.filter((t) => !t.zona);

export function ExpenseModal({
  onClose,
  onSaved,
  tipoFijo,
}: {
  onClose: () => void;
  onSaved: () => void;
  /** La `key` de un `EXPENSE_TYPES`. Con esto el tipo no se elige ni se muestra. */
  tipoFijo?: string;
}) {
  const { data: contrapartes = [] } = useCounterparties();
  const qc = useQueryClient();
  const [typeKey, setTypeKey] = useState(tipoFijo ?? TIPOS_SIN_ZONA[0].key);
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
  // El proveedor es un contacto del directorio. `OTRO` abre el campo de texto
  // para uno que todavía no existe: el servidor lo crea al guardar, para no
  // cortarte el formulario y mandarte a Contactos a mitad de camino.
  const [providerId, setProviderId] = useState('');
  const [providerName, setProviderName] = useState('');
  const [updatePrice, setUpdatePrice] = useState(true);
  const [catForm, setCatForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  // Por defecto lo paga el negocio; si lo pagó el propietario, la Caja lo cuenta como aporte.
  // `''` = la caja del negocio. No hay opción "préstamo" suelta: si lo puso un
  // prestamista, se elige al prestamista.
  const [counterpartyId, setCounterpartyId] = useState('');

  const type = EXPENSE_TYPES.find((t) => t.key === typeKey)!;
  const linksCatalog = !!type.catalog;
  const cfg = type.catalog ? catalogs[type.catalog] : null;

  // Catálogo existente (para modo "existente" y para mantenimiento → impresoras).
  const listEndpoint = type.endpoint ?? (type.key === 'maintenance' ? 'printers' : undefined);
  const { data: items = [] } = useQuery({
    queryKey: [listEndpoint],
    queryFn: async () =>
      (await api.get<{ id: string; name: string; status?: string }[]>(`/${listEndpoint}`)).data,
    enabled: !!listEndpoint,
  });
  const elegidaDescontinuada = items.find((i) => i.id === selectedId)?.status === 'DISCONTINUED';

  // Proveedores (opcional, para cualquier tipo de gasto): los contactos con
  // tipo Proveedor. Mezclar los clientes haría crecer el desplegable sin control.
  const { data: contactos = [] } = useContacts();
  const providers = contactos.filter((c) => c.type === 'SUPPLIER');

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
          // Filamento: el precio del rollo lo fija el servidor con monto ÷ rollos.
          mode === 'existing' && updatePrice && type.priceField && type.key !== 'filament'
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
            ...proveedorParaGuardar,
            counterpartyId: counterpartyId || null,
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
        if (type.linkField === 'materialId') {
          // Una compra de filamento reactiva la ficha y suma compras: la reposición y
          // las compras de filamento dependen de eso.
          for (const key of ['filament-stock', 'filament-summary', 'filament-purchases']) {
            qc.invalidateQueries({ queryKey: [key] });
          }
        }
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
          counterpartyId: counterpartyId || null,
        };
        const payload: Record<string, unknown> = { ...base, description, endDate: endDate || null, ...proveedorParaGuardar };
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

  /**
   * Lo que viaja: el id de un proveedor que ya existe, o el NOMBRE de uno
   * nuevo. Nunca los dos — el servidor le daría prioridad al id y el nombre
   * que escribiste se perdería sin decir nada.
   */
  const proveedorParaGuardar =
    providerId === OTRO
      ? { providerName: providerName.trim() || null }
      : { providerId: providerId || null };

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
      title={tipoFijo ? `Registrar compra de ${EXPENSE_TYPES.find((t) => t.key === tipoFijo)!.label.toLowerCase()}` : 'Registrar gasto'}
      className="max-h-[90vh] overflow-y-auto"
    >
      <div className="space-y-3">
      {/* Con el tipo fijo no hay nada que elegir: lo dijo la pantalla de la que viene. */}
      {!tipoFijo && (
        <Field label="Tipo de gasto">
          <Select value={typeKey} onChange={(e) => changeType(e.target.value)}>
            {TIPOS_SIN_ZONA.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

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
            <FieldGrid min="11rem" className="gap-3 rounded-lg border border-border bg-background/30 p-3">
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
              <p className="col-span-full text-xs text-muted-foreground">
                {selectedBsRate
                  ? `Equivale a ${usdFromBs.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} (se guarda como costo base).`
                  : 'Elige una tasa en Bs para calcular el equivalente en USD. Si no hay tasas, créalas en Config → Moneda.'}
              </p>
            </FieldGrid>
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
                  {i.status === 'DISCONTINUED' ? `${i.name} (descontinuado)` : i.name}
                </option>
              ))}
            </Select>
          </Field>
          {elegidaDescontinuada && type.perUnit && (
            <p className="text-xs text-muted-foreground">
              Esta ficha está descontinuada: al registrar la compra vuelve a estar activa.
            </p>
          )}
          {type.perUnit && (
            <Field label="Cantidad comprada">
              <NumberInput value={quantity} onChange={(n) => setQuantity(Math.max(1, Math.floor(n)))} />
            </Field>
          )}
          {type.key === 'filament' ? (
            <PrecioDelRollo amount={amount} quantity={quantity} />
          ) : (
            <Checkbox
              checked={updatePrice}
              onChange={setUpdatePrice}
              label="Usar este precio como referencia para cotizar"
            />
          )}
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
          {type.key === 'filament' && <PrecioDelRollo amount={amount} quantity={quantity} />}
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

      <Field
        label="Proveedor (opcional)"
        hint={providerId === OTRO ? 'Se agrega al directorio como proveedor.' : undefined}
      >
        <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          <option value="">Sin proveedor</option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={OTRO}>Otro (escribirlo)…</option>
        </Select>
      </Field>
      {providerId === OTRO && (
        <Input
          value={providerName}
          onChange={(e) => setProviderName(e.target.value)}
          placeholder="Nombre del proveedor"
          aria-label="Nombre del proveedor nuevo"
        />
      )}

      <Field
        label="¿Quién lo pagó?"
        hint="Si lo pagaste de tu bolsillo, la Caja lo cuenta como aporte que el negocio te debe."
      >
        <Select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)}>
          <option value="">La caja del negocio</option>
          {contrapartes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.kind === 'EXTERNAL_LENDER' ? c.name : `${c.name}, de su bolsillo`}
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

/** Filamento: el precio del rollo para cotizar sale de la compra, no de una casilla (2026-09-14). */
function PrecioDelRollo({ amount, quantity }: { amount: number; quantity: number }) {
  const precio = quantity > 0 ? amount / quantity : 0;
  return (
    <p className="text-xs text-muted-foreground">
      El precio del rollo para cotizar queda en{' '}
      {precio.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.
    </p>
  );
}
