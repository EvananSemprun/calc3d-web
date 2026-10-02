import { useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import type { OwnerFinancingKey } from '@calc3d/shared';
import { Badge, Button, Card, CardContent, EmptyState, Field, Input, NumberInput, PageSkeleton, Select, Stat } from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { useMoney } from '@/features/settings/useSettings';
import { todayKey } from '@/lib/today';
import { cn } from '@/lib/utils';
import {
  type CashSummary,
  useAddMovement,
  useCash,
  useDeleteCount,
  useDeleteMovement,
  useSaveCount,
} from '@/features/cash/api';

/**
 * CAJA — la hoja "Caja" del Excel y el bloque "Quién puso la plata" de
 * "Inversion".
 *
 * Toda la plata vive en la misma cuenta de Binance, mezclada con la personal.
 * El conteo de los lunes no busca que los números coincidan: busca que en la
 * cuenta NUNCA haya menos de lo que es del negocio.
 *
 * Las compras que paga Vanan NO se cargan acá: se marcan en Gastos con
 * "Pagado por: Vanan" y el aporte sale solo. Acá va solo la plata pura.
 */
export function CashPage() {
  const { data, isLoading } = useCash();
  const { money } = useMoney();
  const [contando, setContando] = useState(false);
  const [moviendo, setMoviendo] = useState(false);

  if (isLoading || !data) return <PageSkeleton />;
  const ultimo = data.counts[0];

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
          <Button className="flex-1 sm:flex-none" onClick={() => setContando(true)}>
            <Plus className="h-4 w-4" /> Conteo del lunes
          </Button>
        </div>
      </div>

      {ultimo?.short && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <p>
            <strong>En Binance había {money(-ultimo.personal)} menos</strong> de lo que el negocio
            debería tener el {fecha(ultimo.date)}. Se usó plata del negocio sin anotarla: cargala
            como “Pago a Vanan” o revisá qué gasto falta.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Saldo del negocio" value={money(data.balance.balance)} accent="yellow" />
        <Stat
          label="Le debe a Vanan"
          value={money(data.financing.owedToOwner)}
          sub="diseñador, compras, cuotas y la A1"
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

      <ConteosCard data={data} onNuevo={() => setContando(true)} />
      <MovimientosCard data={data} onNuevo={() => setMoviendo(true)} />

      <CountDialog open={contando} onClose={() => setContando(false)} />
      <MovementDialog open={moviendo} onClose={() => setMoviendo(false)} />
    </div>
  );
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { timeZone: 'UTC' });

function SaldoCard({ data }: { data: CashSummary }) {
  const { money } = useMoney();
  const b = data.balance;
  const lineas: [string, number][] = [
    ['Ventas cobradas', b.collected],
    ['Gastos generales', -b.expenses],
    ['Filamento comprado', -b.filament],
    ['Equipos pagados por la caja', -b.equipment],
    ['Aportes de Vanan', b.contributions],
    ['Pagos a Vanan', -b.withdrawals],
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
          aporte tuyo la sube sin ser venta.
        </p>
      </CardContent>
    </Card>
  );
}

const FUENTE: Record<OwnerFinancingKey, string> = {
  designer: 'Diseñador',
  purchases: 'Compras de tu bolsillo',
  loanPayments: 'Cuotas del préstamo',
  equipment: 'Equipos (la A1)',
};

function FinanciamientoCard({ data }: { data: CashSummary }) {
  const { money } = useMoney();
  const f = data.financing;

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
                  <td className="py-2 pr-3">Vanan · {FUENTE[r.key]}</td>
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
          Lo que sacás para vos se descuenta en este orden: diseñador, compras, cuotas y de último la
          impresora. Al prestamista se le paga con las cuotas, no con la caja.
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

function ConteosCard({ data, onNuevo }: { data: CashSummary; onNuevo: () => void }) {
  const { money } = useMoney();
  const confirm = useConfirm();
  const borrar = useDeleteCount();

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Conteo de los lunes</h2>
          <p className="text-sm text-muted-foreground">
            Mirá Binance y anotá el total. Lo del negocio se calcula a esa fecha; la diferencia es
            tuya. En rojo: se usó plata del negocio sin anotarla.
          </p>
        </div>
        {data.counts.length === 0 ? (
          <EmptyState
            title="Todavía no contaste"
            description="Cada lunes, antes de abrir. Si se te pasa, contá el martes: lo grave es dejar pasar dos semanas."
            action={<Button onClick={onNuevo}>Primer conteo</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Fecha</th>
                  <th className="py-2 pr-3 text-right font-semibold">En Binance</th>
                  <th className="py-2 pr-3 text-right font-semibold">Del negocio</th>
                  <th className="py-2 pr-3 text-right font-semibold">Tuyo</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {data.counts.map((c) => (
                  <tr key={c.id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                      {fecha(c.date)}
                      {c.note && <span className="block text-xs">{c.note}</span>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(c.total)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(c.business)}</td>
                    <td
                      className={cn(
                        'py-2 pr-3 text-right font-semibold tabular-nums',
                        c.short ? 'text-destructive' : 'text-success',
                      )}
                    >
                      {money(c.personal)}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        aria-label={`Borrar el conteo del ${fecha(c.date)}`}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        onClick={async () => {
                          if (await confirm({ title: `¿Borrar el conteo del ${fecha(c.date)}?` })) {
                            borrar.mutate(c.id, { onSuccess: () => notify.success('Conteo borrado') });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Movimientos con tu bolsillo</h2>
          <p className="text-sm text-muted-foreground">
            Solo la plata pura: lo que sacás para vos o lo que metés sin comprar nada. Una compra que
            pagaste vos va en Gastos con “Pagado por: Vanan”, no acá.
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
              return (
                <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Icono className={cn('h-4 w-4 shrink-0', sale ? 'text-destructive' : 'text-success')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{m.concept}</p>
                    <p className="text-xs text-muted-foreground">
                      {fecha(m.date)} · <Badge variant="outline">{sale ? 'Pago a Vanan' : 'Aporte de Vanan'}</Badge>
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
                    className="text-muted-foreground transition-colors hover:text-destructive"
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

function CountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [date, setDate] = useState(todayKey);
  const [total, setTotal] = useState(0);
  const [note, setNote] = useState('');
  const guardar = useSaveCount();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title="Conteo del lunes">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate(
            { date, total, note: note.trim() || null },
            {
              onSuccess: () => {
                notify.success('Conteo guardado');
                setNote('');
                onClose();
              },
            },
          );
        }}
      >
        <Field label="Fecha" hint="Si ya contaste ese día, se corrige el conteo anterior">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
        </Field>
        <Field label="Total en Binance (USD)" required>
          <NumberInput value={total} onChange={setTotal} />
        </Field>
        <Field label="Nota (opcional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={total < 0 || !date || guardar.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function MovementDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [date, setDate] = useState(todayKey);
  const [kind, setKind] = useState<'WITHDRAWAL' | 'CONTRIBUTION'>('WITHDRAWAL');
  const [amount, setAmount] = useState(0);
  const [concept, setConcept] = useState('');
  const [note, setNote] = useState('');
  const agregar = useAddMovement();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title="Movimiento con tu bolsillo">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          agregar.mutate(
            { date, kind, amount, concept: concept.trim(), note: note.trim() || null },
            {
              onSuccess: () => {
                notify.success('Movimiento anotado');
                setAmount(0);
                setConcept('');
                setNote('');
                onClose();
              },
            },
          );
        }}
      >
        <Field label="Tipo">
          <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="WITHDRAWAL">Pago a Vanan (sacaste plata del negocio)</option>
            <option value="CONTRIBUTION">Aporte de Vanan (metiste plata tuya)</option>
          </Select>
        </Field>
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
