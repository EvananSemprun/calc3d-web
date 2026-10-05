import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  EmptyState,
  Field,
  FieldGrid,
  Input,
  Select,
  TableSkeleton,
} from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSettings } from '@/features/settings/useSettings';
import {
  useCashAccounts,
  useCounterparties,
  useDeleteCashAccount,
  useSaveCashAccount,
  useSetDefaultCashAccount,
  type CashAccountKind,
  type CashAccountRow,
} from './api';

/** El nombre de cada tipo de cuenta, en UN solo lugar. */
const TIPO: Record<CashAccountKind, string> = {
  EXCHANGE: 'Exchange',
  BANK: 'Banco',
  CASH: 'Efectivo',
  WALLET: 'Billetera',
  OTHER: 'Otra',
};

type Borrador = {
  name: string;
  kind: CashAccountKind;
  currency: string;
  shared: boolean;
  sharedWithId: string;
  autoAttributeShortfall: boolean;
  active: boolean;
};

const VACIO: Borrador = {
  name: '',
  kind: 'EXCHANGE',
  currency: 'USD',
  shared: false,
  sharedWithId: '',
  autoAttributeShortfall: false,
  active: true,
};

/**
 * CUENTAS + REGLAS DE CONCILIACIÓN.
 *
 * Son dos tarjetas: dónde vive la plata y cada cuánto se revisa que la plata
 * que hay sea la que debería haber. Se montan juntas porque la segunda no
 * significa nada sin la primera.
 */
export function CashAccountsCard() {
  return (
    <>
      <AccountsCard />
      <ReconciliationRulesCard />
    </>
  );
}

/**
 * CUENTAS — dónde vive la plata.
 *
 * ⚠️ Los errores los escribe el SERVIDOR (409 con el nombre y el motivo:
 * "Binance tiene 2 conciliación(es). Desactivala en vez de borrarla.", "Es la
 * única cuenta: la conciliación la necesita."). Se muestran tal cual con
 * `apiErrorMessage`: un "no se pudo" genérico deja al dueño trabado.
 */
function AccountsCard() {
  const { data, isLoading } = useCashAccounts();
  const { data: contrapartes } = useCounterparties();
  const guardar = useSaveCashAccount();
  const borrar = useDeleteCashAccount();
  const porDefecto = useSetDefaultCashAccount();
  const confirm = useConfirm();

  // `null` = cerrado. Con cuenta = edición; con `undefined` = alta nueva.
  const [editando, setEditando] = useState<CashAccountRow | null | undefined>(null);
  const [form, setForm] = useState<Borrador>(VACIO);

  const abierto = editando !== null;
  const set = (parche: Partial<Borrador>) => setForm((f) => ({ ...f, ...parche }));

  const lista = data ?? [];
  const nombreDe = (id: string | null) =>
    contrapartes?.find((c) => c.id === id)?.name ?? 'alguien';

  /**
   * Las contrapartes elegibles son las ACTIVAS, más la que ya tenga atada esta
   * cuenta aunque esté inactiva: si no, al editar el select saldría en blanco y
   * guardar le cambiaría la contraparte sin que nadie lo pidiera.
   */
  const elegibles = (contrapartes ?? []).filter(
    (c) => c.active || c.id === form.sharedWithId,
  );

  const abrirAlta = () => {
    setForm(VACIO);
    setEditando(undefined);
  };

  const abrirEdicion = (a: CashAccountRow) => {
    setForm({
      name: a.name,
      kind: a.kind,
      currency: a.currency,
      shared: a.shared,
      sharedWithId: a.sharedWithId ?? '',
      autoAttributeShortfall: a.autoAttributeShortfall,
      active: a.active,
    });
    setEditando(a);
  };

  const cerrar = () => setEditando(null);

  /**
   * Desmarcar "compartida" apaga también la atribución. La UI la esconde, así
   * que mandarla en `true` sería mostrar una cosa y guardar otra — el servidor
   * lo normaliza igual, pero eso no es excusa.
   */
  const cambiarCompartida = (shared: boolean) =>
    set(shared ? { shared } : { shared, sharedWithId: '', autoAttributeShortfall: false });

  const nombre = form.name.trim();
  const moneda = form.currency.trim().toUpperCase();
  const puedeGuardar =
    !!nombre && moneda.length === 3 && (!form.shared || !!form.sharedWithId);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeGuardar) return;
    guardar.mutate(
      {
        id: editando?.id,
        name: nombre,
        kind: form.kind,
        currency: moneda,
        shared: form.shared,
        sharedWithId: form.shared ? form.sharedWithId : null,
        autoAttributeShortfall: form.shared && form.autoAttributeShortfall,
        active: form.active,
      },
      {
        onSuccess: () => {
          notify.success(editando ? 'Cuenta actualizada' : 'Cuenta creada');
          cerrar();
        },
        onError: (err) => notify.error(apiErrorMessage(err)),
      },
    );
  };

  const eliminar = async (a: CashAccountRow) => {
    const ok = await confirm({
      title: `¿Borrar ${a.name}?`,
      description: 'Si ya tiene conciliaciones, el servidor no va a dejar borrarla.',
      confirmLabel: 'Borrar',
      tone: 'destructive',
    });
    if (!ok) return;
    borrar.mutate(a.id, {
      onSuccess: () => notify.success(`${a.name} ya no está`),
      onError: (err) => notify.error(apiErrorMessage(err)),
    });
  };

  const marcarPrincipal = (a: CashAccountRow) =>
    porDefecto.mutate(a.id, {
      onSuccess: () => notify.success(`Ahora se concilia ${a.name}`),
      onError: (err) => notify.error(apiErrorMessage(err)),
    });

  const botonNueva = (
    <Button variant="accent" size="sm" onClick={abrirAlta}>
      <Plus className="h-4 w-4" /> Nueva cuenta
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Cuentas</CardTitle>
            <p className="text-sm text-muted-foreground">Dónde vive la plata del negocio.</p>
          </div>
          {botonNueva}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <TableSkeleton rows={3} cols={2} />
        ) : lista.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Todavía no hay cuentas"
            description="Anotá al menos una: es la que la conciliación compara contra el saldo esperado."
            action={botonNueva}
          />
        ) : (
          <ul className="space-y-2">
            {lista.map((a) => (
              <li
                key={a.id}
                className={cn(
                  'rounded-lg border border-border bg-card p-3',
                  !a.active && 'opacity-60',
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="font-semibold">{a.name}</span>
                  <Badge variant="outline">{TIPO[a.kind]}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{a.currency}</span>
                  {a.isDefault && <Badge variant="success">Principal</Badge>}
                  {a.shared && (
                    <Badge variant="default">Compartida con {nombreDe(a.sharedWithId)}</Badge>
                  )}
                  {a.autoAttributeShortfall && (
                    <Badge variant="warning">Atribuye faltantes</Badge>
                  )}
                  {!a.active && <Badge variant="outline">Inactiva</Badge>}

                  <div className="ml-auto flex items-center gap-1">
                    {!a.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Usar ${a.name} como principal`}
                        disabled={porDefecto.isPending}
                        onClick={() => marcarPrincipal(a)}
                      >
                        Usar como principal
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${a.name}`}
                      onClick={() => abrirEdicion(a)}
                    >
                      <Pencil className="h-4 w-4 text-brand-yellow-ink" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Borrar ${a.name}`}
                      onClick={() => eliminar(a)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* El límite de multicuenta se DICE, no se esconde: registrar una
            segunda cuenta y esperar que se concilie termina en una diferencia
            inventada. */}
        <p className="text-xs text-muted-foreground">
          Solo se concilia la cuenta principal. Hasta que cada venta y cada gasto digan de qué
          cuenta salieron, el saldo esperado es uno solo para todo el negocio, y compararlo
          contra otra cuenta daría una diferencia inventada.
        </p>
      </CardContent>

      {abierto && (
        <Dialog
          open
          onOpenChange={(n) => !n && cerrar()}
          title={editando ? `Editar ${editando.name}` : 'Nueva cuenta'}
        >
          <form className="space-y-3" onSubmit={enviar}>
            <FieldGrid min="11rem" className="gap-3">
              <Field label="Nombre" required>
                <Input
                  autoFocus
                  value={form.name}
                  maxLength={80}
                  placeholder="Ej. Binance, Efectivo"
                  onChange={(e) => set({ name: e.target.value })}
                />
              </Field>
              <Field label="Tipo">
                <Select
                  value={form.kind}
                  onChange={(e) => set({ kind: e.target.value as CashAccountKind })}
                >
                  {(Object.keys(TIPO) as CashAccountKind[]).map((k) => (
                    <option key={k} value={k}>
                      {TIPO[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Moneda" required hint="Código de 3 letras: USD, VES, EUR…">
                <Input
                  value={form.currency}
                  maxLength={3}
                  placeholder="USD"
                  className="uppercase"
                  onChange={(e) => set({ currency: e.target.value })}
                />
              </Field>
            </FieldGrid>

            <div className="space-y-3 rounded-lg border border-border p-3">
              <Checkbox
                checked={form.shared}
                onChange={cambiarCompartida}
                label="Esta cuenta mezcla plata del negocio con la personal de alguien"
              />

              {form.shared && (
                <div className="space-y-3">
                  <Field label="¿Con quién la compartís?" required>
                    <Select
                      value={form.sharedWithId}
                      onChange={(e) => set({ sharedWithId: e.target.value })}
                    >
                      <option value="">Elegí una contraparte…</option>
                      {elegibles.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.active ? c.name : `${c.name} (inactiva)`}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Checkbox
                    checked={form.autoAttributeShortfall}
                    onChange={(autoAttributeShortfall) => set({ autoAttributeShortfall })}
                    label="Al conciliar, registrar el faltante como salida a esa persona"
                  />
                  {/* La advertencia va AL LADO y visible: es la regla más
                      peligrosa del módulo y en un tooltip no la lee nadie. Se
                      enciende en ámbar cuando la casilla queda ENCENDIDA, que
                      es cuando el riesgo pasa a ser real. */}
                  <div
                    className={cn(
                      'flex gap-2 rounded-lg p-2 text-xs',
                      form.autoAttributeShortfall
                        ? 'border border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground',
                    )}
                  >
                    {form.autoAttributeShortfall && (
                      <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <p>
                      Convierte un faltante que no sabés explicar en una deuda saldada. Siempre
                      vas a ver el reparto antes de confirmar, y podés escribir otra explicación.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <Checkbox checked={form.active} onChange={(active) => set({ active })} label="Activa" />
            <p className="text-xs text-muted-foreground">
              Una cuenta desactivada no se puede elegir en conciliaciones nuevas, pero su
              historial queda.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={cerrar}>
                Cancelar
              </Button>
              <Button type="submit" variant="accent" disabled={guardar.isPending || !puedeGuardar}>
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </Card>
  );
}

type Frecuencia = 'NONE' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
type Orden = 'OLDEST_FIRST' | 'NEWEST_FIRST';

const FRECUENCIA: Record<Frecuencia, string> = {
  NONE: 'Nunca',
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quincenal',
  MONTHLY: 'Mensual',
};

const ORDEN: Record<Orden, string> = {
  OLDEST_FIRST: 'De la más antigua a la más reciente',
  NEWEST_FIRST: 'De la más reciente a la más antigua',
};

/** 1 = lunes … 7 = domingo, como lo espera el contrato. */
const DIAS = [
  [1, 'Lunes'],
  [2, 'Martes'],
  [3, 'Miércoles'],
  [4, 'Jueves'],
  [5, 'Viernes'],
  [6, 'Sábado'],
  [7, 'Domingo'],
] as const;

/** La frecuencia elige día solo cuando el ciclo cae dentro de una semana. */
const pideDia = (f: Frecuencia) => f === 'WEEKLY' || f === 'BIWEEKLY';

/**
 * REGLAS DE CONCILIACIÓN — cada cuánto revisar y contra qué deuda se aplica
 * primero un pago.
 *
 * No hay hook compartido para guardar settings: cada tarjeta arma su propio
 * `useMutation` sobre `PATCH /settings` e invalida `['settings']`, igual que
 * `GeneralSettings`.
 */
function ReconciliationRulesCard() {
  const { data, isLoading } = useSettings();
  const qc = useQueryClient();

  const [frecuencia, setFrecuencia] = useState<Frecuencia>('NONE');
  const [dia, setDia] = useState<number | null>(null);
  const [orden, setOrden] = useState<Orden>('OLDEST_FIRST');

  useEffect(() => {
    if (!data) return;
    setFrecuencia(data.reconciliationFrequency);
    setDia(data.reconciliationWeekday);
    setOrden(data.debtApplicationOrder);
  }, [data]);

  const guardar = useMutation({
    mutationFn: () =>
      api.patch('/settings', {
        reconciliationFrequency: frecuencia,
        // Sin día a la vista no se manda un día viejo: la UI y lo guardado
        // tienen que decir lo mismo.
        reconciliationWeekday: pideDia(frecuencia) ? (dia ?? 1) : null,
        debtApplicationOrder: orden,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      notify.success('Reglas de conciliación guardadas');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const cambiarFrecuencia = (f: Frecuencia) => {
    setFrecuencia(f);
    // Al pasar a semanal/quincenal el select de día necesita un valor: sin
    // esto aparecería en blanco y se guardaría el lunes sin avisar.
    if (pideDia(f) && dia === null) setDia(1);
  };

  if (isLoading) return <TableSkeleton rows={2} cols={2} />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-blue/15 text-brand-blue-bright ring-1 ring-inset ring-brand-blue/30"
          >
            <CalendarClock className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <CardTitle>Reglas de conciliación</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cada cuánto revisar la cuenta y con qué deuda empieza un pago.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <FieldGrid>
          <Field
            label="Frecuencia de conciliación"
            hint="Es un recordatorio: podés conciliar cualquier día."
          >
            <Select
              value={frecuencia}
              onChange={(e) => cambiarFrecuencia(e.target.value as Frecuencia)}
            >
              {(Object.keys(FRECUENCIA) as Frecuencia[]).map((f) => (
                <option key={f} value={f}>
                  {FRECUENCIA[f]}
                </option>
              ))}
            </Select>
          </Field>

          {pideDia(frecuencia) && (
            <Field label="Día de la semana">
              <Select value={String(dia ?? 1)} onChange={(e) => setDia(Number(e.target.value))}>
                {DIAS.map(([v, label]) => (
                  <option key={v} value={String(v)}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field
            label="Orden de aplicación de los pagos"
            hint="Con qué deuda empieza un pago a tu socio o a vos."
          >
            <Select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
              {(Object.keys(ORDEN) as Orden[]).map((o) => (
                <option key={o} value={o}>
                  {ORDEN[o]}
                </option>
              ))}
            </Select>
          </Field>
        </FieldGrid>

        <div className="flex items-center gap-3">
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
            {guardar.isPending ? 'Guardando…' : 'Guardar reglas'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
