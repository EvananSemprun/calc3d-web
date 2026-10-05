import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Plus,
  Trash2,
  Undo2,
} from 'lucide-react';
import type { OwnerFinancingKey } from '@calc3d/shared';
import { Badge, Button, Card, CardContent, EmptyState, Field, Input, NumberInput, PageSkeleton, Select, Stat } from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { useMoney, useSettings } from '@/features/settings/useSettings';
import { todayKey } from '@/lib/today';
import { cn } from '@/lib/utils';
import {
  type CashSummary,
  useAddMovement,
  useCash,
  useConfirmReconciliation,
  useDeleteMovement,
  useSaveReconciliation,
  useVoidReconciliation,
} from '@/features/cash/api';

/**
 * CAJA — la hoja "Caja" del Excel y el bloque "Quién puso la plata" de
 * "Inversion".
 *
 * El negocio y su contraparte comparten UNA cuenta, con la plata de los dos
 * mezclada. Por eso conciliar NO es comparar el total de la cuenta contra lo
 * que el negocio debería tener: son CUATRO números —esperado, total, personal
 * declarado y real del negocio— y la diferencia sale del real contra el
 * esperado.
 *
 * Las compras que paga la contraparte NO se cargan acá: se marcan en Gastos
 * con "¿Quién lo pagó?" y el aporte sale solo. Acá va solo la plata pura.
 */
export function CashPage() {
  const { data, isLoading } = useCash();
  const { data: settings } = useSettings();
  const { money } = useMoney();
  const [conciliando, setConciliando] = useState(false);
  const [moviendo, setMoviendo] = useState(false);

  if (isLoading || !data) return <PageSkeleton />;
  const nombre = data.counterparty.name;
  /** El faltante más reciente que ya está CONFIRMADO: un borrador no acusa nada. */
  const faltante = data.reconciliations.find((c) => c.status === 'CONFIRMED' && c.kind === 'SHORT');
  const toca = tocaConciliar(data, settings?.reconciliationFrequency ?? 'NONE');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Caja</h1>
            <p className="text-sm text-muted-foreground">
              Cuánto dinero es del negocio, y cuánto le debe a cada quien.
            </p>
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setMoviendo(true)}>
            <Plus className="h-4 w-4" /> Movimiento
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={() => setConciliando(true)}>
            <Plus className="h-4 w-4" /> Conciliación de caja
          </Button>
        </div>
      </div>

      {/* Un recordatorio, no una alerta: no pasó nada malo, solo toca mirar. */}
      {toca && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock aria-hidden className="h-4 w-4 shrink-0 text-brand-yellow-ink" />
          {toca.dias == null
            ? 'Todavía no conciliaste la caja.'
            : `Te toca conciliar: la última fue hace ${toca.dias} días.`}
        </p>
      )}

      {faltante && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <p>
            <strong>Faltan {money(Math.abs(faltante.differenceUsd))}</strong> en la cuenta: el{' '}
            {fecha(faltante.date)} quedaban {money(faltante.businessActualUsd)} para el negocio y
            debería haber {money(faltante.expectedUsd)}. Se usó plata del negocio sin anotarla:
            cargala como “Pago a {nombre}” o revisá qué gasto falta.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Saldo del negocio" value={money(data.balance.balance)} accent="yellow" />
        <Stat
          label={`Le debe a ${nombre}`}
          value={money(data.financing.owedToOwner)}
          sub="lo que puso y todavía no se le devolvió"
        />
        <Stat label="Le debe al prestamista" value={money(data.financing.owedToLender)} />
        <Stat
          label="Total por devolver"
          value={money(data.financing.totalOwed)}
          accent="blue"
          sub="el total nunca sube al pagar una cuota"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <SaldoCard data={data} />
        <FinanciamientoCard data={data} />
      </div>

      <ConciliacionesCard data={data} onNuevo={() => setConciliando(true)} />
      <MovimientosCard data={data} onNuevo={() => setMoviendo(true)} />

      <ReconciliationDialog open={conciliando} onClose={() => setConciliando(false)} data={data} />
      <MovementDialog open={moviendo} onClose={() => setMoviendo(false)} data={data} />
    </div>
  );
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { timeZone: 'UTC' });

/** Cada cuánto toca conciliar, en días. `NONE` = el dueño no quiere recordatorio. */
const CADA: Record<string, number> = { WEEKLY: 7, BIWEEKLY: 14, MONTHLY: 30 };

/**
 * Si ya pasó el momento de conciliar, según la frecuencia configurada.
 *
 * ⚠️ "Hoy" se decide en hora LOCAL con `todayKey()`.
 * `new Date().toISOString().slice(0,10)` es hoy en UTC, y en Venezuela (UTC−4)
 * eso significa que desde las 20:00 la app cree que ya es mañana — ya rompió
 * siete lugares en este proyecto.
 *
 * Es un recordatorio, no una regla: conciliar cualquier día sigue estando bien.
 */
function tocaConciliar(data: CashSummary, frecuencia: string) {
  const cada = CADA[frecuencia];
  if (!cada) return null;

  const ultima = data.reconciliations.find((c) => c.status === 'CONFIRMED');
  if (!ultima) return { dias: null as number | null, cada };

  const unDia = 24 * 60 * 60 * 1000;
  const dias = Math.floor(
    (Date.parse(`${todayKey()}T00:00:00Z`) - Date.parse(ultima.date.slice(0, 10) + 'T00:00:00Z')) /
      unDia,
  );
  return dias >= cada ? { dias, cada } : null;
}

function SaldoCard({ data }: { data: CashSummary }) {
  const { money } = useMoney();
  const b = data.balance;
  const nombre = data.counterparty.name;
  const lineas: [string, number][] = [
    ['Ventas cobradas', b.collected],
    ['Gastos generales', -b.expenses],
    ['Filamento comprado', -b.filament],
    ['Equipos pagados por la caja', -b.equipment],
    [`Aportes de ${nombre} (se devuelven)`, b.contributionsRefundable],
    [`Aportes de capital de ${nombre}`, b.contributionsCapital],
    [`Devoluciones a ${nombre}`, -b.debtRepayments],
    [`Retiros de ${nombre}`, -b.ownerDraws],
    ['Cuotas pagadas por la caja', -b.loanPayments],
  ];

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-lg font-bold">De dónde sale el saldo</h2>
        <dl className="divide-y divide-border/50 text-sm">
          {lineas
            .filter(([, v]) => v !== 0)
            .map(([etiqueta, v]) => (
              <div key={etiqueta} className="flex justify-between gap-3 py-2">
                <dt className="text-muted-foreground">{etiqueta}</dt>
                <dd className={cn('tabular-nums', v < 0 && 'text-destructive')}>
                  {v > 0 ? '+' : ''}
                  {money(v)}
                </dd>
              </div>
            ))}
          <div className="flex justify-between gap-3 pt-2 font-semibold">
            <dt>Saldo del negocio</dt>
            <dd className="tabular-nums">{money(b.balance)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          Caja no es ganancia: un rollo sin usar o una cuota sacan plata sin ser pérdida, y un
          aporte tuyo la sube sin ser venta. Una devolución baja la caja y la deuda a la vez:
          no es un gasto.
        </p>
      </CardContent>
    </Card>
  );
}

const FUENTE: Record<OwnerFinancingKey, string> = {
  designer: 'Diseñador',
  purchases: 'Compras y aportes',
  loanPayments: 'Cuotas del préstamo',
  equipment: 'Equipos',
};

function FinanciamientoCard({ data }: { data: CashSummary }) {
  const { money } = useMoney();
  const f = data.financing;
  const nombre = data.counterparty.name;

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-lg font-bold">Quién puso la plata</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Fuente</th>
                <th className="py-2 pr-3 text-right font-semibold">Puesto</th>
                <th className="py-2 pr-3 text-right font-semibold">Recuperado</th>
                <th className="py-2 text-right font-semibold">Falta</th>
              </tr>
            </thead>
            <tbody>
              {f.rows.map((r) => (
                <tr key={r.key} className="border-b border-border/40">
                  <td className="py-2 pr-3">{`${nombre} · ${FUENTE[r.key]}`}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(r.put)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{money(r.recovered)}</td>
                  <td className="py-2 text-right tabular-nums">{money(r.missing)}</td>
                </tr>
              ))}
              <tr className="border-b border-border/40">
                <td className="py-2 pr-3">Prestamista · saldo</td>
                <td className="py-2 pr-3 text-right tabular-nums">{money(f.owedToLender)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">—</td>
                <td className="py-2 text-right tabular-nums">{money(f.owedToLender)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-2 pr-3" colSpan={3}>
                  Total por devolver
                </td>
                <td className="py-2 text-right tabular-nums">{money(f.totalOwed)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Lo que sacás para vos se descuenta de las deudas, de la más antigua a la más reciente. Al
          prestamista se le paga con las cuotas, no con la caja.
        </p>
        {f.overWithdrawn > 0 && (
          <p className="text-xs font-medium text-destructive">
            Sacaste {money(f.overWithdrawn)} más de lo que pusiste.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** El veredicto de una conciliación, con las palabras que usa la pantalla. */
const ESTADO = {
  SQUARE: 'Cuadrado',
  FAVOR: 'Diferencia a favor',
  SHORT: 'Diferencia en contra',
} as const;

function ConciliacionesCard({ data, onNuevo }: { data: CashSummary; onNuevo: () => void }) {
  const { money } = useMoney();
  const confirm = useConfirm();
  const anular = useVoidReconciliation();
  const nombre = data.counterparty.name;

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Conciliaciones de caja</h2>
          <p className="text-sm text-muted-foreground">
            Mirá la cuenta y anotá el total, y cuánto de eso es personal de {nombre}. Lo del
            negocio se calcula a esa fecha. En rojo: hay MENOS de lo que debería haber.
          </p>
        </div>
        {data.reconciliations.length === 0 ? (
          <EmptyState
            title="Todavía no conciliaste"
            description="Una vez por semana, antes de abrir. Si se te pasa, hacelo al otro día: lo grave es dejar pasar dos semanas."
            action={<Button onClick={onNuevo}>Primera conciliación</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Fecha</th>
                  <th className="py-2 pr-3 text-right font-semibold">En la cuenta</th>
                  <th className="py-2 pr-3 text-right font-semibold">Personal</th>
                  <th className="py-2 pr-3 text-right font-semibold">Del negocio</th>
                  <th className="py-2 pr-3 text-right font-semibold">Esperado</th>
                  <th className="py-2 pr-3 text-right font-semibold">Diferencia</th>
                  <th className="py-2 pr-3 font-semibold">Estado</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {data.reconciliations.map((c) => (
                  <tr
                    key={c.id}
                    className={cn(
                      'border-b border-border/40 last:border-0',
                      c.status === 'VOID' && 'opacity-50 line-through',
                    )}
                  >
                    <td className="py-2 pr-3 align-top tabular-nums text-muted-foreground">
                      <span className="flex flex-wrap items-center gap-2">
                        {fecha(c.date)}
                        {/* Solo lo que vino del Excel: MIGRATION y RECONCILIATION no son
                            importaciones y una insignia de más vuelve ruido a todas. */}
                        {c.source === 'EXCEL_IMPORT' && <Badge variant="outline">Importado</Badge>}
                      </span>
                      {c.note && <span className="block text-xs">{c.note}</span>}
                      {c.explanation && <span className="block text-xs">{c.explanation}</span>}
                      {c.adjustment && (
                        <span className="block text-xs">Ajustada con {money(c.adjustment.amount)}</span>
                      )}
                      {c.stale && (
                        <span className="block text-xs">
                          Hoy daría {money(c.expectedNow)}: entraron movimientos con fecha anterior.
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right align-top tabular-nums">{money(c.totalUsd)}</td>
                    <td className="py-2 pr-3 text-right align-top tabular-nums text-muted-foreground">
                      {money(c.personalUsd)}
                    </td>
                    <td className="py-2 pr-3 text-right align-top tabular-nums">
                      {money(c.businessActualUsd)}
                    </td>
                    <td className="py-2 pr-3 text-right align-top tabular-nums text-muted-foreground">
                      {money(c.expectedUsd)}
                    </td>
                    <td
                      className={cn(
                        'py-2 pr-3 text-right align-top font-semibold tabular-nums',
                        c.kind === 'SHORT' && 'text-destructive',
                        c.kind === 'FAVOR' && 'text-success',
                      )}
                    >
                      {money(c.differenceUsd)}
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <span className="flex flex-wrap items-center gap-2">
                        {ESTADO[c.kind]}
                        {c.status === 'DRAFT' && <Badge variant="warning">Borrador</Badge>}
                        {c.status === 'VOID' && <Badge variant="outline">Anulada</Badge>}
                      </span>
                    </td>
                    <td className="py-2 text-right align-top">
                      {/* Anular solo tiene sentido sobre lo confirmado: un borrador no
                          movió nada todavía. */}
                      {c.status === 'CONFIRMED' && (
                        <button
                          type="button"
                          aria-label={`Anular la conciliación del ${fecha(c.date)}`}
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={async () => {
                            const ok = await confirm({
                              title: `¿Anular la conciliación del ${fecha(c.date)}?`,
                              description: c.adjustment
                                ? `Se borra el ajuste de ${money(c.adjustment.amount)} y sus aplicaciones a deudas. La conciliación queda en el historial.`
                                : 'La conciliación queda en el historial, marcada como anulada.',
                              confirmLabel: 'Anular',
                              tone: 'destructive',
                            });
                            if (ok) {
                              anular.mutate(c.id, {
                                onSuccess: () => notify.success('Conciliación anulada'),
                              });
                            }
                          }}
                        >
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MovimientosCard({ data, onNuevo }: { data: CashSummary; onNuevo: () => void }) {
  const { money } = useMoney();
  const confirm = useConfirm();
  const borrar = useDeleteMovement();
  const nombre = data.counterparty.name;

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Movimientos con tu bolsillo</h2>
          <p className="text-sm text-muted-foreground">
            Solo la plata pura: lo que sacás para vos o lo que metés sin comprar nada. Una compra que
            pagaste vos va en Gastos con “¿Quién lo pagó?”, no acá.
          </p>
        </div>
        {data.movements.length === 0 ? (
          <EmptyState
            title="Sin movimientos"
            description="Cuando saques plata del negocio para vos, anotala: es lo que más descuadra la caja."
            action={<Button onClick={onNuevo}>Anotar movimiento</Button>}
          />
        ) : (
          <ul className="divide-y divide-border/50">
            {data.movements.map((m) => {
              const sale = m.kind === 'WITHDRAWAL';
              const Icono = sale ? ArrowUpRight : ArrowDownLeft;
              const etiqueta = sale
                ? `Pago a ${nombre}`
                : m.refundable
                  ? `Aporte de ${nombre}`
                  : `Aporte de capital de ${nombre}`;
              return (
                <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Icono className={cn('h-4 w-4 shrink-0', sale ? 'text-destructive' : 'text-success')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{m.concept}</p>
                    <p className="text-xs text-muted-foreground">
                      {fecha(m.date)} · <Badge variant="outline">{etiqueta}</Badge>
                      {m.note && ` · ${m.note}`}
                    </p>
                  </div>
                  <span className={cn('tabular-nums font-semibold', sale && 'text-destructive')}>
                    {sale ? '−' : '+'}
                    {money(m.amount)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Borrar ${m.concept}`}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={async () => {
                      if (await confirm({ title: '¿Borrar este movimiento?', description: m.concept })) {
                        borrar.mutate(m.id, { onSuccess: () => notify.success('Movimiento borrado') });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * El reparto exacto: qué deuda, de qué fecha, cuánto.
 *
 * ⚠️ Esto DUPLICA A PROPÓSITO la lógica de `applyPayment` del servidor. Sirve
 * nada más para previsualizar el faltante ANTES de confirmar, sin guardar: lo
 * que se persiste lo calcula el servidor. Si el reparto viajara desde el front,
 * cualquiera lo inventaría y la deuda se daría por pagada donde conviniera.
 */
/**
 * El reparto exacto: qué deuda, de qué fecha, cuánto.
 *
 * ⚠️ Lo calcula el SERVIDOR y acá solo se dibuja. No se recalcula con
 * `obligations`: esa lista viene sin filtro de fecha y con la contraparte por
 * defecto de la organización, mientras que confirmar filtra hasta la fecha de
 * la conciliación y usa la contraparte de la cuenta. Al conciliar con retraso
 * —lo normal— un reparto calculado acá ofrecería deudas posteriores que el
 * servidor va a ignorar, y el dueño estaría aprobando algo que no ocurre.
 */
function Reparto({ plan }: { plan: NonNullable<CashSummary['reconciliations'][number]['plan']> }) {
  const { money } = useMoney();

  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {plan.applications.map((a) => (
        <li key={a.sourceId} className="flex justify-between gap-3">
          <span>Deuda del {a.date}</span>
          <span className="tabular-nums">{money(a.amount)}</span>
        </li>
      ))}
      <li className="flex justify-between gap-3 font-medium">
        <span>Excedente como retiro</span>
        <span className="tabular-nums">{money(plan.leftover)}</span>
      </li>
    </ul>
  );
}

/**
 * CONCILIAR EN DOS PASOS: primero se guarda un BORRADOR con lo contado y recién
 * después, viendo las cuatro líneas y el reparto, se confirma.
 *
 * El paso de más no es ceremonia: confirmar puede registrar el faltante como
 * salida a la contraparte y dar deudas por saldadas. Nadie debería firmar eso
 * sin ver antes, con números, qué deuda se cancela.
 */
function ReconciliationDialog({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: CashSummary;
}) {
  const { money } = useMoney();
  const nombre = data.counterparty.name;
  const cuenta = data.accounts.find((a) => a.isDefault) ?? data.accounts[0];
  /** Lo personal NO se deriva: se sugiere lo declarado la vez anterior. */
  const sugerido = data.reconciliations.find((c) => c.status === 'CONFIRMED')?.personalAmount ?? 0;

  const [date, setDate] = useState(todayKey);
  const [total, setTotal] = useState(0);
  const [personal, setPersonal] = useState(sugerido);
  const [rate, setRate] = useState(0);
  const [note, setNote] = useState('');
  const [explanation, setExplanation] = useState('');
  const [atribuir, setAtribuir] = useState(true);

  const guardar = useSaveReconciliation();
  const confirmar = useConfirmReconciliation();

  // Al abrir se vuelve a sugerir lo personal y se limpia lo del paso B: dejar
  // una explicación vieja escrita sería firmar la conciliación de otro día.
  useEffect(() => {
    if (!open) return;
    setPersonal(sugerido);
    setExplanation('');
    setAtribuir(true);
  }, [open, sugerido]);

  if (!cuenta) return null;

  const esUsd = cuenta.currency === 'USD';
  /** El borrador de ESA fecha: es lo que se previsualiza y lo que se confirma. */
  const borrador = data.reconciliations.find(
    (c) => c.date.slice(0, 10) === date && c.status === 'DRAFT',
  );
  const falta = borrador ? Math.abs(borrador.differenceUsd) : 0;
  const atribuible =
    !!borrador && borrador.kind === 'SHORT' && cuenta.shared && cuenta.autoAttributeShortfall;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title="Conciliación de caja">
      <div className="space-y-5">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate(
              {
                accountId: cuenta.id,
                date,
                totalAmount: total,
                personalAmount: cuenta.shared ? personal : 0,
                currency: cuenta.currency,
                rate: esUsd ? null : rate,
                note: note.trim() || null,
              },
              { onSuccess: () => notify.success('Borrador guardado') },
            );
          }}
        >
          <Field label="Fecha" hint="Si ya hay un borrador de ese día, se corrige">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
          </Field>
          <Field label={`Total en ${cuenta.name} (${cuenta.currency})`} required>
            <NumberInput value={total} onChange={setTotal} />
          </Field>
          {!esUsd && (
            <Field label={`Tasa del día (${cuenta.currency} por USD)`} required>
              <NumberInput value={rate} onChange={setRate} />
            </Field>
          )}
          {cuenta.shared && (
            <Field
              label={`De eso, cuánto es personal de ${nombre}`}
              hint="Lo declarás vos: el sistema no puede saberlo. Se sugiere lo de la conciliación anterior."
            >
              <NumberInput value={personal} onChange={setPersonal} />
            </Field>
          )}
          <Field label="Nota (opcional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={total < 0 || !date || (!esUsd && rate <= 0) || guardar.isPending}
            >
              Guardar borrador
            </Button>
          </div>
        </form>

        {borrador && (
          <section className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
            <h3 className="font-display text-sm font-bold">Antes de confirmar</h3>
            <dl className="divide-y divide-border/50 text-sm">
              <div className="flex justify-between gap-3 py-1.5">
                <dt className="text-muted-foreground">Saldo esperado del negocio</dt>
                <dd className="tabular-nums">{money(borrador.expectedUsd)}</dd>
              </div>
              <div className="flex justify-between gap-3 py-1.5">
                <dt className="text-muted-foreground">Saldo total de la cuenta</dt>
                <dd className="tabular-nums">{money(borrador.totalUsd)}</dd>
              </div>
              <div className="flex justify-between gap-3 py-1.5">
                <dt className="text-muted-foreground">Personal de {nombre}</dt>
                <dd className="tabular-nums">−{money(borrador.personalUsd)}</dd>
              </div>
              <div className="flex justify-between gap-3 py-1.5">
                <dt className="text-muted-foreground">Saldo real del negocio</dt>
                <dd className="tabular-nums">{money(borrador.businessActualUsd)}</dd>
              </div>
            </dl>
            <p
              className={cn(
                'text-sm font-bold',
                borrador.kind === 'SHORT' && 'text-destructive',
                borrador.kind === 'FAVOR' && 'text-success',
              )}
            >
              {ESTADO[borrador.kind]}: {money(borrador.differenceUsd)}
            </p>

            {/* La regla peligrosa: convierte "no sé dónde está la plata" en una
                deuda saldada. Por eso se muestra el reparto EXACTO antes de
                confirmar y se puede apagar o explicar de otra manera. */}
            {atribuible && (
              <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={atribuir}
                    onChange={(e) => setAtribuir(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    Registrar {money(falta)} como salida a {nombre}, aplicada a sus deudas{' '}
                    {data.applicationOrder === 'NEWEST_FIRST'
                      ? 'de la más reciente a la más antigua'
                      : 'de la más antigua a la más reciente'}
                    .
                  </span>
                </label>
                {atribuir && borrador.plan && <Reparto plan={borrador.plan} />}
                <p className="text-xs text-muted-foreground">
                  ⚠️ Es una regla del negocio para la cuenta compartida, no una causa comprobada del
                  faltante.
                </p>
              </div>
            )}

            {/* La asimetría: lo que sobra NUNCA se convierte en venta, ganancia
                ni aporte. */}
            {borrador.kind === 'FAVOR' && (
              <p className="text-xs text-muted-foreground">
                Sobra plata. No se registra nada automáticamente: no se sabe de dónde salió.
              </p>
            )}

            <Field label="Otra explicación (opcional)">
              <Input
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Ej. le pagué al diseñador y no lo anoté"
              />
            </Field>

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={confirmar.isPending}
                onClick={() =>
                  confirmar.mutate(
                    {
                      id: borrador.id,
                      attributeShortfall: atribuible && atribuir,
                      explanation: explanation.trim() || null,
                    },
                    {
                      onSuccess: () => {
                        notify.success('Conciliación confirmada');
                        onClose();
                      },
                    },
                  )
                }
              >
                Confirmar
              </Button>
            </div>
          </section>
        )}
      </div>
    </Dialog>
  );
}

function MovementDialog({
  open,
  onClose,
  data,
}: {
  open: boolean;
  onClose: () => void;
  data: CashSummary;
}) {
  const nombre = data.counterparty.name;
  const [date, setDate] = useState(todayKey);
  const [kind, setKind] = useState<'WITHDRAWAL' | 'CONTRIBUTION'>('WITHDRAWAL');
  const [amount, setAmount] = useState(0);
  const [concept, setConcept] = useState('');
  const [note, setNote] = useState('');
  /** Un aporte con `false` es CAPITAL: sube la caja y no genera deuda. */
  const [refundable, setRefundable] = useState(true);
  const agregar = useAddMovement();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title="Movimiento con tu bolsillo">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          agregar.mutate(
            { date, kind, amount, concept: concept.trim(), refundable, note: note.trim() || null },
            {
              onSuccess: () => {
                notify.success('Movimiento anotado');
                setAmount(0);
                setConcept('');
                setNote('');
                setRefundable(true);
                onClose();
              },
            },
          );
        }}
      >
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="WITHDRAWAL">{`Pago a ${nombre} (sacaste plata del negocio)`}</option>
            <option value="CONTRIBUTION">{`Aporte de ${nombre} (metiste plata tuya)`}</option>
          </Select>
        </Field>
        {kind === 'CONTRIBUTION' && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={!refundable}
              onChange={(e) => setRefundable(!e.target.checked)}
              className="mt-1"
            />
            <span>
              Es aporte de capital: sube la caja y el negocio <strong>no</strong> te lo debe.
            </span>
          </label>
        )}
        <Field label="Fecha">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Monto (USD)" required>
          <NumberInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Concepto" required>
          <Input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="Ej. retiro para gastos personales"
          />
        </Field>
        <Field label="Nota (opcional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={amount <= 0 || !concept.trim() || agregar.isPending}>
            Anotar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
