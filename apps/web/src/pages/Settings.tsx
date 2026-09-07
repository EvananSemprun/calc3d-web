import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Boxes,
  Building2,
  Check,
  Coins,
  Database,
  Download,
  Pencil,
  PiggyBank,
  Plus,
  RefreshCw,
  Sprout,
  Trash2,
  User,
  SlidersHorizontal,
} from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings/useSettings';
import { BusinessLogo } from '@/features/settings/BusinessLogo';
import {
  rateAge,
  useDeleteRate,
  useExchangeRates,
  useRefreshRate,
  useSetRate,
} from '@/features/settings/useExchangeRates';
import { useAuth } from '@/auth/AuthContext';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  NumberInput,
  Select,
  TableSkeleton,
} from '@/components/ui';
import { useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';

export function SettingsPage() {
  const sections = [
    { key: 'cuenta', label: 'Cuenta', icon: User, Comp: MyAccount },
    { key: 'calculo', label: 'Cálculo', icon: SlidersHorizontal, Comp: GeneralSettings },
    { key: 'moneda', label: 'Moneda', icon: Coins, Comp: CurrencySettings },
    { key: 'fijos', label: 'Costos fijos', icon: PiggyBank, Comp: FixedCostsSettings },
    { key: 'productos', label: 'Productos', icon: Boxes, Comp: ProductSettings },
    { key: 'negocio', label: 'Negocio', icon: Building2, Comp: BusinessSettings },
    { key: 'datos', label: 'Datos', icon: Database, Comp: DataSettings },
  ] as const;
  const [active, setActive] = useState<(typeof sections)[number]['key']>('cuenta');
  const Active = sections.find((s) => s.key === active)!.Comp;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
        <div>
          <h1 className="font-display text-2xl font-bold">Configuración</h1>
          <p className="text-sm text-muted-foreground">
            Tu cuenta y los valores por defecto del cálculo.
          </p>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-[200px_1fr]">
        {/* Sub-nav: vertical en desktop, fila scrollable en móvil */}
        <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-1">
          {sections.map((s) => {
            const on = s.key === active;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setActive(s.key)}
                className={cn(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:w-full',
                  on
                    ? 'bg-brand-blue/15 text-foreground ring-1 ring-inset ring-brand-blue/40'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <s.icon className={cn('h-4 w-4', on && 'text-brand-yellow-ink')} />
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0">
          <Active />
        </div>
      </div>
    </div>
  );
}

// ---------------- Mi cuenta ----------------

function MyAccount() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  useEffect(() => {
    if (user) setForm({ name: user.name, email: user.email, password: '' });
  }, [user]);

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, string> = { name: form.name, email: form.email };
      if (form.password) payload.password = form.password;
      return api.patch('/users/me', payload);
    },
    onSuccess: async () => {
      setForm((f) => ({ ...f, password: '' }));
      await refresh();
      notify.success('Perfil actualizado');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mi cuenta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Nombre">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Correo (con este inicias sesión)">
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Nueva contraseña" hint="Déjalo vacío para no cambiarla">
            <Input
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Configuración general ----------------

function GeneralSettings() {
  const { data, isLoading } = useSettings();
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (data) {
      setForm({
        currency: data.currency,
        locale: data.locale,
        kwhPrice: Number(data.kwhPrice),
        defaultWastePct: data.defaultWastePct,
        roundingMode: data.roundingMode,
        roundingIncrement: data.roundingIncrement,
        defaultMarkup: data.defaultMarkup,
        minMarginPct: data.minMarginPct,
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        kwhPrice: Number(form.kwhPrice),
        defaultWastePct: Number(form.defaultWastePct),
        roundingIncrement: Number(form.roundingIncrement),
        defaultMarkup: Number(form.defaultMarkup),
        minMarginPct: Number(form.minMarginPct),
      };
      return api.patch('/settings', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      notify.success('Configuración guardada');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  if (isLoading) return <TableSkeleton rows={3} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Valores por defecto del cálculo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Moneda (código ISO)" hint="Ej. USD, MXN, EUR">
            <Input value={String(form.currency ?? '')} onChange={(e) => set('currency', e.target.value)} />
          </Field>
          <Field label="Locale" hint="Ej. en-US, es-MX">
            <Input value={String(form.locale ?? '')} onChange={(e) => set('locale', e.target.value)} />
          </Field>
          <Field label="Precio kWh" hint="Solo si activas la electricidad">
            <NumberInput step="0.01" value={Number(form.kwhPrice ?? 0)} onChange={(v) => set('kwhPrice', v)} />
          </Field>
          <Field label="Merma por defecto" hint="Fracción: 0.08 = 8 %">
            <NumberInput
              step="0.01"
              value={Number(form.defaultWastePct ?? 0)}
              onChange={(v) => set('defaultWastePct', v)}
            />
          </Field>
          <Field
            label="Margen objetivo por defecto"
            hint="Fracción sobre el costo: 1.0 = 100 % (el doble del costo)"
          >
            <NumberInput
              step="0.05"
              value={Number(form.defaultMarkup ?? 1)}
              onChange={(v) => set('defaultMarkup', v)}
            />
          </Field>
          <Field
            label="Piso de margen"
            hint="Bajo este margen real la calculadora avisa en rojo. 0.6 = 60 %"
          >
            <NumberInput
              step="0.05"
              value={Number(form.minMarginPct ?? 0.6)}
              onChange={(v) => set('minMarginPct', v)}
            />
          </Field>
          <Field label="Redondeo de precios">
            <Select value={String(form.roundingMode ?? 'NONE')} onChange={(e) => set('roundingMode', e.target.value)}>
              <option value="NONE">Sin redondeo</option>
              <option value="NEAREST">Al más cercano</option>
              <option value="UP">Hacia arriba</option>
              <option value="DOWN">Hacia abajo</option>
            </Select>
          </Field>
          <Field label="Incremento de redondeo" hint="0.5, 1, 5, 10…">
            <NumberInput
              step="0.5"
              value={Number(form.roundingIncrement ?? 1)}
              onChange={(v) => set('roundingIncrement', v)}
            />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar configuración'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Moneda y tasa (Bs) ----------------

function CurrencySettings() {
  const { data: settings } = useSettings();
  const { data: ratesData, isLoading } = useExchangeRates({ enabled: true });
  const qc = useQueryClient();
  const setRate = useSetRate();
  const deleteRate = useDeleteRate();
  const refresh = useRefreshRate();
  const confirm = useConfirm();

  const rates = ratesData?.rates ?? [];
  const [form, setForm] = useState({ label: '', currencyCode: 'VES', rate: 0 });
  // Etiqueta de la tasa en edición (null = alta nueva). Al editar, el nombre queda
  // fijo (es la identidad): guardar con el mismo nombre ACTUALIZA su valor vigente.
  const [editing, setEditing] = useState<string | null>(null);

  const saveDefault = useMutation({
    mutationFn: (label: string | null) => api.patch('/settings', { defaultRateLabel: label }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      notify.success('Moneda por defecto guardada');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const saveProtection = useMutation({
    mutationFn: (label: string | null) => api.patch('/settings', { protectionRateLabel: label }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      notify.success('Tasa de referencia guardada');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const startEdit = (r: { label: string; currencyCode: string; rate: number }) => {
    setEditing(r.label);
    setForm({ label: r.label, currencyCode: r.currencyCode, rate: r.rate });
  };
  const cancelEdit = () => {
    setEditing(null);
    setForm({ label: '', currencyCode: 'VES', rate: 0 });
  };

  const addRate = () => {
    if (!form.label.trim() || form.currencyCode.length !== 3 || form.rate <= 0) {
      notify.error('Completa nombre, moneda (3 letras) y tasa mayor a 0.');
      return;
    }
    setRate.mutate(
      { label: form.label.trim(), currencyCode: form.currencyCode.toUpperCase(), rate: form.rate },
      {
        onSuccess: () => {
          notify.success(editing ? 'Tasa actualizada' : 'Tasa guardada');
          setForm({ label: '', currencyCode: 'VES', rate: 0 });
          setEditing(null);
        },
        onError: (e) => notify.error(apiErrorMessage(e)),
      },
    );
  };

  if (isLoading) return <TableSkeleton rows={3} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monedas y tasas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Costeas y ves tus estadísticas <strong>siempre en dólares</strong>. Aquí defines tasas con
          nombre (Dólar BCV, Euro neto…) para <strong>mostrar/cobrar</strong> en otra moneda. Al hacer
          un presupuesto, pedido o producto eliges cuál usar; se congela en el documento.
        </p>

        {/* Tasa de referencia: protege el margen al cobrar en bolívares */}
        <div className="rounded-xl border border-brand-blue/40 bg-brand-blue/[0.05] p-4">
          <label className="mb-1 block text-sm font-semibold">
            Tu “dólar real” (protege tu margen al cobrar en Bs)
          </label>
          <p className="mb-2 text-xs text-muted-foreground">
            Es la tasa con la que <strong>no pierdes margen</strong> (normalmente el paralelo/Binance). La
            calculadora la usa para decirte cuántos bolívares cobrar por un precio en dólares.
          </p>
          <Select
            value={settings?.protectionRateLabel ?? ''}
            onChange={(e) => saveProtection.mutate(e.target.value || null)}
          >
            <option value="">Automática (Binance / USDT)</option>
            {rates
              .filter((r) => r.currencyCode === 'VES')
              .map((r) => (
                <option key={r.label} value={r.label}>
                  {r.label} ({r.rate.toLocaleString('es-VE')} Bs/USD)
                </option>
              ))}
          </Select>
        </div>

        {/* Tasas vigentes */}
        <div className="space-y-2">
          {rates.length === 0 ? (
            <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              Sin tasas todavía. Agrega una abajo o trae el dólar del BCV.
            </p>
          ) : (
            rates.map((r) => {
              const age = rateAge(r.updatedAt);
              const isDefault = settings?.defaultRateLabel === r.label;
              return (
                <div
                  key={r.label}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card p-3"
                >
                  <span className="font-semibold">{r.label}</span>
                  <Badge variant="outline">{r.currencyCode}</Badge>
                  <span className="font-mono tabular text-brand-yellow-ink">
                    {r.rate.toLocaleString('es-VE')}
                  </span>
                  <Badge variant={r.source === 'AUTO' ? 'brand' : 'outline'}>
                    {r.source === 'AUTO' ? 'BCV auto' : 'manual'}
                  </Badge>
                  <span className={cn('text-xs', age.stale ? 'text-brand-yellow-ink' : 'text-muted-foreground')}>
                    {age.label}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    {isDefault ? (
                      <Badge variant="success">por defecto</Badge>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => saveDefault.mutate(r.label)}>
                        Usar por defecto
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Editar tasa a mano"
                      onClick={() => startEdit(r)}
                    >
                      <Pencil className="h-4 w-4 text-brand-yellow-ink" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: `¿Eliminar la tasa "${r.label}"?`,
                            description:
                              'Se borra su historial completo. Los documentos ya emitidos conservan su tasa congelada.',
                            confirmLabel: 'Eliminar',
                            tone: 'destructive',
                          })
                        ) {
                          deleteRate.mutate(r.label);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
          {ratesData?.refreshError && (
            <p className="text-xs text-brand-yellow-ink">{ratesData.refreshError}</p>
          )}
        </div>

        {/* Agregar / editar una tasa a mano */}
        <div
          className={cn(
            'rounded-xl border p-4',
            editing ? 'border-brand-yellow/50 shadow-glow-sm' : 'border-border',
          )}
        >
          <p className="mb-3 text-sm font-medium">
            {editing ? (
              <>
                Editar tasa: <span className="text-brand-yellow-ink">{editing}</span>
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  cambia el valor y guarda (el nombre es su identidad)
                </span>
              </>
            ) : (
              'Agregar una tasa'
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_100px_120px_auto] sm:items-end">
            <Field label="Nombre de la tasa">
              <Input
                value={form.label}
                placeholder="Ej. Dólar BCV, Euro neto"
                disabled={!!editing}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </Field>
            <Field label="Moneda">
              <Input
                value={form.currencyCode}
                maxLength={3}
                disabled={!!editing}
                onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value.toUpperCase() }))}
              />
            </Field>
            <Field label="Tasa por 1 USD">
              <NumberInput step="0.01" value={form.rate} onChange={(rate) => setForm((f) => ({ ...f, rate }))} />
            </Field>
            <div className="flex gap-2">
              <Button variant="accent" onClick={addRate} disabled={setRate.isPending}>
                {editing ? (
                  <>
                    <Check className="h-4 w-4" /> Actualizar
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> Guardar
                  </>
                )}
              </Button>
              {editing && (
                <Button variant="outline" onClick={cancelEdit}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={refresh.isPending}
            onClick={() =>
              refresh.mutate(undefined, {
                onSuccess: (out) => {
                  if (out.refreshError) notify.error(out.refreshError);
                  else notify.success('Tasas BCV actualizadas');
                },
                onError: (e) => notify.error(apiErrorMessage(e)),
              })
            }
          >
            <RefreshCw className={cn('h-4 w-4', refresh.isPending && 'animate-spin')} />
            {refresh.isPending ? 'Consultando…' : 'Traer tasas del BCV'}
          </Button>
          {settings?.defaultRateLabel && (
            <Button variant="ghost" size="sm" onClick={() => saveDefault.mutate(null)}>
              Quitar moneda por defecto (solo USD)
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Los documentos congelan la tasa del momento en que se crean; cambiarla aquí no altera
          documentos viejos. El auto-refresco trae el dólar (y el euro si defines una tasa EUR).
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------- Datos del negocio (nota de entrega) ----------------

function BusinessSettings() {
  const { data, isLoading } = useSettings();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    businessName: '',
    businessRif: '',
    businessPhone: '',
    businessAddress: '',
    businessSigner: '',
  });

  useEffect(() => {
    if (data) {
      setForm({
        businessName: data.businessName ?? '',
        businessRif: data.businessRif ?? '',
        businessPhone: data.businessPhone ?? '',
        businessAddress: data.businessAddress ?? '',
        businessSigner: data.businessSigner ?? '',
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch('/settings', {
        ...(form.businessName.trim() ? { businessName: form.businessName.trim() } : {}),
        businessRif: form.businessRif || null,
        businessPhone: form.businessPhone || null,
        businessAddress: form.businessAddress || null,
        businessSigner: form.businessSigner || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      notify.success('Datos del negocio guardados');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  if (isLoading) return <TableSkeleton rows={3} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos del negocio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Aparecen como emisor en la nota de entrega y en la cotización, y encabezan ambos documentos.
        </p>
        <BusinessLogo />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre del negocio" hint="Encabeza los documentos y firma la entrega">
            <Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} />
          </Field>
          <Field label="C.I. / RIF">
            <Input value={form.businessRif} onChange={(e) => set('businessRif', e.target.value)} />
          </Field>
          <Field label="Teléfono">
            <Input value={form.businessPhone} onChange={(e) => set('businessPhone', e.target.value)} />
          </Field>
          <Field label="Dirección">
            <Input value={form.businessAddress} onChange={(e) => set('businessAddress', e.target.value)} />
          </Field>
          <Field label="Quién firma la entrega" hint="Ej. tu nombre">
            <Input value={form.businessSigner} onChange={(e) => set('businessSigner', e.target.value)} />
          </Field>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar datos'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------- Costos fijos y punto de equilibrio ----------------

// ---------------- Datos (respaldo + plantillas) ----------------

function DataSettings() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  /** Descarga autenticada (el token va en el header de axios, no en la URL). */
  const download = async (path: string, filename: string) => {
    setBusy(path);
    try {
      const res = await api.get(path, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const seed = useMutation({
    mutationFn: () => api.post('/onboarding/seed-templates'),
    onSuccess: (res) => {
      const c = (res.data as { created: { materials: number; printers: number; components: number } }).created;
      const total = c.materials + c.printers + c.components;
      qc.invalidateQueries();
      notify.success(
        total > 0
          ? `Sembrado: ${c.materials} materiales, ${c.printers} impresoras, ${c.components} insumos.`
          : 'Ya tenías todas las plantillas. Nada que sembrar.',
      );
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const csvButtons = [
    { entity: 'clients', label: 'Contactos' },
    { entity: 'sales', label: 'Ventas' },
    { entity: 'expenses', label: 'Gastos' },
    { entity: 'products', label: 'Productos' },
    { entity: 'orders', label: 'Pedidos' },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Respaldar mis datos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Tus datos son tuyos. Descárgalos cuando quieras: un respaldo completo en JSON o cada
            tabla en CSV para abrir en Excel.
          </p>
          <Button
            variant="accent"
            onClick={() => download('/backup/all.json', 'calc3d-respaldo.json')}
            disabled={busy === '/backup/all.json'}
          >
            <Download className="h-4 w-4" />
            {busy === '/backup/all.json' ? 'Preparando…' : 'Respaldo completo (JSON)'}
          </Button>
          <div className="flex flex-wrap gap-2">
            {csvButtons.map((b) => (
              <Button
                key={b.entity}
                variant="outline"
                size="sm"
                onClick={() => download(`/backup/csv/${b.entity}`, `calc3d-${b.entity}.csv`)}
                disabled={busy === `/backup/csv/${b.entity}`}
              >
                <Download className="h-4 w-4" /> {b.label} CSV
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plantillas de catálogo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            ¿Arrancando de cero? Siembra materiales (PLA, PETG, ABS, TPU), una impresora e insumos
            comunes con precios de referencia para cotizar en minutos. No duplica lo que ya tengas;
            ajusta los precios a los tuyos después.
          </p>
          <Button variant="outline" onClick={() => seed.mutate()} disabled={seed.isPending}>
            <Sprout className="h-4 w-4" /> {seed.isPending ? 'Sembrando…' : 'Sembrar catálogo de ejemplo'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------- Productos ----------------

function ProductSettings() {
  const { data, isLoading } = useSettings();
  const qc = useQueryClient();
  const [minPct, setMinPct] = useState(15); // en % para la UI

  useEffect(() => {
    if (data) setMinPct(Math.round((data.productAlertMinMarginPct ?? 0.15) * 100));
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch('/settings', {
        productAlertMinMarginPct: Math.max(0, minPct / 100),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      notify.success('Configuración de productos guardada');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  if (isLoading) return <TableSkeleton rows={3} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerta de rentabilidad</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Cuando el costo de tus insumos sube (devaluación, recompra más cara), tus productos
          guardados pueden quedar por debajo de margen sin que lo notes. Define el{' '}
          <strong>margen mínimo</strong>: si un producto cae por debajo, se marca en alerta.
        </p>
        <div className="w-40">
          <Field label="Margen mínimo (%)">
            <NumberInput value={minPct} onChange={setMinPct} min={0} step={1} />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Es ganancia sobre el costo (markup). Ej.: 15 % significa que si vendes en $11.50 algo que
          hoy cuesta $10, sigue en verde; si el costo sube a $10.50, entra en alerta.
        </p>
        <div className="flex justify-end">
          <Button variant="accent" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface FixedCostRow {
  concept: string;
  monthlyAmount: number;
}

function FixedCostsSettings() {
  const { data, isLoading } = useSettings();
  const qc = useQueryClient();
  const [rows, setRows] = useState<FixedCostRow[]>([]);
  const [marginPct, setMarginPct] = useState(40); // en % para la UI
  const [reserve, setReserve] = useState(0);

  useEffect(() => {
    if (data) {
      setRows(data.fixedCosts ?? []);
      setMarginPct(Math.round((data.breakEvenMarginPct ?? 0.4) * 100));
      setReserve(data.equipmentReserve ?? 0);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch('/settings', {
        fixedCosts: rows
          .map((r) => ({ concept: r.concept.trim(), monthlyAmount: Number(r.monthlyAmount) || 0 }))
          .filter((r) => r.concept.length > 0),
        breakEvenMarginPct: Math.min(1, Math.max(0, marginPct / 100)),
        equipmentReserve: Math.max(0, reserve),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      notify.success('Costos fijos guardados');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const total = rows.reduce((s, r) => s + (Number(r.monthlyAmount) || 0), 0);
  const breakEven = marginPct > 0 ? total / (marginPct / 100) : null;

  if (isLoading) return <TableSkeleton rows={3} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Costos fijos mensuales</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Lo que pagas cada mes exista o no producción (alquiler, internet, luz base, tu tiempo).
          NO se reparte en el precio de cada pieza: sirve para el <strong>punto de equilibrio</strong>.
        </p>

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={i === 0 ? 'Concepto' : ''}>
                  <Input
                    value={r.concept}
                    placeholder="Ej. Alquiler"
                    onChange={(e) =>
                      setRows((rs) => rs.map((x, idx) => (idx === i ? { ...x, concept: e.target.value } : x)))
                    }
                  />
                </Field>
              </div>
              <div className="w-36">
                <Field label={i === 0 ? 'Monto / mes' : ''}>
                  <NumberInput
                    step="0.01"
                    value={r.monthlyAmount}
                    onChange={(v) =>
                      setRows((rs) => rs.map((x, idx) => (idx === i ? { ...x, monthlyAmount: v } : x)))
                    }
                  />
                </Field>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((rs) => [...rs, { concept: '', monthlyAmount: 0 }])}
          >
            <Plus className="h-4 w-4" /> Agregar costo fijo
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Margen de contribución"
            hint={`De cada $100 que vendés, lo que queda después del material: ${marginPct} % (o sea, ${100 - marginPct} % de costo variable)`}
          >
            <div className="relative w-28">
              <NumberInput className="pr-7" value={marginPct} onChange={setMarginPct} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
          </Field>
          <div className="rounded-xl border border-brand-blue/40 bg-brand-blue/[0.06] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Necesitas vender al mes
            </div>
            <div className="mt-1 font-display text-2xl font-bold tabular text-brand-yellow-ink">
              {breakEven != null ? breakEven.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {total.toLocaleString(undefined, { maximumFractionDigits: 2 })} fijos ÷ {marginPct}% de margen
            </p>
          </div>
        </div>

        <Field
          label="Reserva mensual para equipos"
          hint="Lo que querés apartar cada mes para reponer las impresoras. Es el tercer nivel del punto de equilibrio; la cuota del préstamo NO va acá, sale sola de Deuda."
        >
          <div className="w-36">
            <NumberInput step="0.01" value={reserve} onChange={setReserve} />
          </div>
        </Field>

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar costos fijos'}
        </Button>
      </CardContent>
    </Card>
  );
}
