import { useState } from 'react';
import { HandCoins, Plus, Trash2 } from 'lucide-react';
import { monthlyLoanPayments } from '@calc3d/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  NumberInput,
  PageSkeleton,
  Stat,
} from '@/components/ui';
import { Dialog } from '@/components/overlays';
import { useMoney } from '@/features/settings/useSettings';
import { notify } from '@/components/toast';
import {
  type Loan,
  useAddLoanPayment,
  useCreateLoan,
  useDeleteLoan,
  useDeleteLoanPayment,
  useLoans,
} from '@/features/loans/api';

/**
 * DEUDA — los préstamos con los que se compró equipo, y sus pagos.
 *
 * El **saldo lo deriva el servidor** (capital − abonos): acá no se recalcula.
 *
 * Un pago de préstamo NO es un gasto y por eso esta pantalla vive fuera del
 * ledger: el equipo ya está ahí como inversión, y contar además cada cuota
 * sería contar la misma máquina dos veces.
 */
export function LoansPage() {
  const { data: loans = [], isLoading } = useLoans();
  const { money } = useMoney();
  const [nuevo, setNuevo] = useState(false);

  if (isLoading) return <PageSkeleton />;

  const capital = loans.reduce((s, l) => s + l.principal, 0);
  const saldo = loans.reduce((s, l) => s + l.balance, 0);
  const cuota = monthlyLoanPayments(loans);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Deuda</h1>
            <p className="text-sm text-muted-foreground">
              Lo que debés y a qué ritmo lo estás pagando.
            </p>
          </div>
        </div>
        <Button onClick={() => setNuevo(true)}>
          <Plus className="h-4 w-4" /> Nuevo préstamo
        </Button>
      </div>

      {loans.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Sin deudas registradas"
          description="Si compraste un equipo con plata prestada, cargalo acá: la cuota entra en el punto de equilibrio del Dashboard."
          action={<Button onClick={() => setNuevo(true)}>Nuevo préstamo</Button>}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Capital prestado" value={money(capital)} />
            <Stat label="Saldo pendiente" value={money(saldo)} accent="yellow" />
            <Stat
              label="Cuota mensual"
              value={money(cuota)}
              sub="Es lo que exige el nivel 2 del equilibrio"
            />
          </div>
          {loans.map((l) => (
            <LoanCard key={l.id} loan={l} />
          ))}
        </>
      )}

      <NewLoanDialog open={nuevo} onClose={() => setNuevo(false)} />
    </div>
  );
}

function LoanCard({ loan }: { loan: Loan }) {
  const { money } = useMoney();
  const [pagando, setPagando] = useState(false);
  const borrarPago = useDeleteLoanPayment();
  const borrar = useDeleteLoan();

  const pagado = loan.progress >= 1;

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">{loan.name}</h2>
            <p className="text-sm text-muted-foreground">
              {loan.printer ? `Compró: ${loan.printer.name} · ` : ''}
              {money(loan.principal)} de capital
              {loan.monthlyPayment > 0 && ` · cuota de ${money(loan.monthlyPayment)}/mes`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pagado ? (
              <Badge variant="success">Pagado</Badge>
            ) : (
              <Button size="sm" onClick={() => setPagando(true)}>
                Registrar pago
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Borrar ${loan.name}`}
              onClick={() => {
                if (confirm(`¿Borrar "${loan.name}" y sus ${loan.payments.length} pagos?`)) {
                  borrar.mutate(loan.id, { onSuccess: () => notify.success('Préstamo borrado') });
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span>
              <strong className="tabular-nums">{money(loan.balance)}</strong> pendiente
            </span>
            <span className="text-muted-foreground">
              {money(loan.paid)} pagados · {(loan.progress * 100).toFixed(0)} %
              {loan.monthsLeft != null && loan.monthsLeft > 0 && (
                <> · faltan {loan.monthsLeft} {loan.monthsLeft === 1 ? 'mes' : 'meses'}</>
              )}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              className={`h-full rounded-full shadow-glow-sm transition-all ${
                pagado ? 'bg-success' : 'bg-brand-yellow'
              }`}
              style={{ width: `${loan.progress * 100}%` }}
            />
          </div>
          {loan.monthsLeft == null && !pagado && (
            <p className="mt-2 text-xs text-muted-foreground">
              Sin cuota mensual no se puede saber cuándo termina. Cargala para que entre en el
              punto de equilibrio.
            </p>
          )}
        </div>

        {loan.payments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Fecha</th>
                  <th className="py-2 pr-3 text-right font-semibold">Pago</th>
                  <th className="py-2 pr-3 font-semibold">Referencia</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {loan.payments.map((p) => (
                  <tr key={p.id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                      {new Date(p.date).toLocaleDateString('es-VE', { timeZone: 'UTC' })}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(p.amount)}</td>
                    <td className="max-w-[16rem] truncate py-2 pr-3 text-xs text-muted-foreground">
                      {p.reference ?? '—'}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        aria-label="Borrar pago"
                        className="text-muted-foreground transition-colors hover:text-destructive"
                        onClick={() =>
                          borrarPago.mutate(
                            { id: loan.id, paymentId: p.id },
                            { onSuccess: () => notify.success('Pago borrado') },
                          )
                        }
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

        {loan.notes && <p className="text-xs text-muted-foreground">{loan.notes}</p>}
      </CardContent>

      <PaymentDialog loan={loan} open={pagando} onClose={() => setPagando(false)} />
    </Card>
  );
}

const hoy = () => new Date().toISOString().slice(0, 10);

function PaymentDialog({
  loan,
  open,
  onClose,
}: {
  loan: Loan;
  open: boolean;
  onClose: () => void;
}) {
  const [date, setDate] = useState(hoy);
  const [amount, setAmount] = useState(loan.monthlyPayment || 0);
  const [reference, setReference] = useState('');
  const agregar = useAddLoanPayment();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title={`Pago de ${loan.name}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          agregar.mutate(
            { id: loan.id, date, amount, reference: reference.trim() || null },
            {
              onSuccess: () => {
                notify.success('Pago registrado');
                setReference('');
                onClose();
              },
            },
          );
        }}
      >
        <Field label="Fecha">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
        </Field>
        <Field label="Monto" hint={`Quedan ${loan.balance.toFixed(2)} por pagar`}>
          <NumberInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Referencia" hint="La del banco, o lo que te sirva para reconocerlo después">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={amount <= 0 || agregar.isPending}>
            Registrar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function NewLoanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [principal, setPrincipal] = useState(0);
  const [monthlyPayment, setMonthlyPayment] = useState(0);
  const crear = useCreateLoan();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title="Nuevo préstamo">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate(
            { name: name.trim(), principal, monthlyPayment },
            {
              onSuccess: () => {
                notify.success('Préstamo creado');
                setName('');
                setPrincipal(0);
                setMonthlyPayment(0);
                onClose();
              },
            },
          );
        }}
      >
        <Field label="Nombre" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Préstamo impresora"
            autoFocus
          />
        </Field>
        <Field label="Capital prestado" required>
          <NumberInput value={principal} onChange={setPrincipal} />
        </Field>
        <Field
          label="Cuota mensual"
          hint="Es lo que el Dashboard exige en el nivel 2 del punto de equilibrio"
        >
          <NumberInput value={monthlyPayment} onChange={setMonthlyPayment} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!name.trim() || principal <= 0 || crear.isPending}>
            Crear
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
