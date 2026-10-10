import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, HandCoins, Plus, Trash2, Undo2 } from 'lucide-react';
import { monthlyLoanPayments, type PaymentFrequency } from '@calc3d/shared';
import { Badge, Button, Card, CardContent, EmptyState, Field, FieldGrid, Input, NumberInput, PageSkeleton, ProgressBar, Select, Stat } from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { useMoney } from '@/features/settings/useSettings';
import { notify } from '@/components/toast';
import { todayKey } from '@/lib/today';
import { apiErrorMessage } from '@/lib/api';
import { useCounterparties } from '@/features/cash/api';
import { cn } from '@/lib/utils';
import {
  type Loan,
  type LoanPayment,
  type LoansOverview,
  type Obligation,
  useAddLoanPayment,
  useCreateLoan,
  useDeleteLoan,
  paraEquilibrio,
  useLoansOverview,
  useVoidLoanPayment,
} from '@/features/loans/api';

/**
 * DEUDA — **las tres deudas del negocio**, que son cosas distintas:
 *
 *  - lo que le debés al **prestamista** (capital − pagos vigentes),
 *  - lo que el negocio le debe a la **contraparte** por lo que puso (equipos,
 *    diseñador, aportes) — ahí caen los pagos por conciliación —, y
 *  - lo que le debés a los **proveedores**: las facturas de compra sin pagar.
 *
 * Todos los saldos **los deriva el servidor**: acá no se recalculan. Las
 * obligaciones salen del MISMO servicio que usa Caja y las facturas del MISMO
 * que usa Compras, o las pantallas terminarían diciendo cosas distintas sobre
 * la misma deuda.
 *
 * ⚠️ **El total de arriba es la suma de los tres bloques, y lo suma el
 * servidor** (`totals`). Acá no se vuelve a sumar: con dos caminos al mismo
 * número, el día que uno cambie el total deja de cuadrar con lo que tiene
 * debajo. Y un total que no cuadra con sus partes es peor que no tenerlo.
 *
 * La **gestión** de cada factura sigue en Compras: esta pantalla responde
 * "cuánto" y lleva allá. Abonar, recibir y anular no se duplican acá.
 *
 * Un pago de préstamo NO es un gasto: el equipo ya está en el ledger como
 * inversión, y contar además cada cuota sería contar la misma máquina dos veces.
 */

/** Cómo se lee cada frecuencia al lado de la cuota. */
const CADA: Record<PaymentFrequency, string> = {
  WEEKLY: 'por semana',
  BIWEEKLY: 'cada quincena',
  MONTHLY: 'por mes',
};
const UNIDAD: Record<PaymentFrequency, [string, string]> = {
  WEEKLY: ['semana', 'semanas'],
  BIWEEKLY: ['quincena', 'quincenas'],
  MONTHLY: ['mes', 'meses'],
};
const plural = (n: number, f: PaymentFrequency) => UNIDAD[f][n === 1 ? 0 : 1];

export function LoansPage() {
  const { data, isLoading } = useLoansOverview();
  const { money } = useMoney();
  const [nuevo, setNuevo] = useState(false);

  if (isLoading || !data) return <PageSkeleton />;

  const { loans, owner, suppliers, totals } = data;
  const capital = loans.reduce((s, l) => s + l.principal, 0);
  // ⚠️ El saldo del bloque sale de `totals`, el mismo número que el servidor
  // sumó para el total de arriba. Sumarlo acá sería el segundo camino.
  const saldo = totals.prestamista;
  const cuota = monthlyLoanPayments(paraEquilibrio(loans));

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
        <Button className="w-full sm:w-auto" onClick={() => setNuevo(true)}>
          <Plus className="h-4 w-4" /> Nuevo préstamo
        </Button>
      </div>

      <TotalDeLaPantalla totals={totals} />

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold">Lo que le debés al prestamista</h2>
          <p className="text-sm text-muted-foreground">
            Plata que te prestaron y se devuelve con cuotas.
          </p>
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
                label="Cuota objetivo mensual"
                value={money(cuota)}
                sub="Es lo que exige el nivel 2 del equilibrio"
              />
            </div>
            {loans.map((l) => (
              <LoanCard key={l.id} loan={l} />
            ))}
          </>
        )}
      </section>

      <DeudaConLaContraparte owner={owner} />

      <DeudaConProveedores suppliers={suppliers} />

      <NewLoanDialog open={nuevo} onClose={() => setNuevo(false)} />
    </div>
  );
}

/**
 * EL TOTAL, con sus tres sumandos a la vista.
 *
 * ⚠️ Los cuatro números vienen del servidor y los tres de abajo son los MISMOS
 * que encabezan cada bloque. Se muestran los sumandos a propósito: un total
 * suelto no se puede comprobar, y este es el número que decide si el dueño se
 * cree solvente o no.
 */
function TotalDeLaPantalla({ totals }: { totals: LoansOverviewTotals }) {
  const { money } = useMoney();

  const partes = [
    { label: 'Al prestamista', value: totals.prestamista },
    { label: 'Al propietario', value: totals.propietario },
    { label: 'A proveedores', value: totals.proveedores },
  ];

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <Stat
          label="Lo que debe el negocio"
          value={money(totals.total)}
          accent="yellow"
          sub="La suma de los tres bloques de abajo"
        />
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          {partes.map((p) => (
            <div
              key={p.label}
              className="flex items-baseline justify-between gap-2 rounded-xl border border-border/70 px-3 py-2"
            >
              <dt className="text-muted-foreground">{p.label}</dt>
              <dd className="font-semibold tabular-nums">{money(p.value)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

type LoansOverviewTotals = LoansOverview['totals'];
type LoansOverviewSuppliers = LoansOverview['suppliers'];

/**
 * El tercer bloque: lo que le debés a cada proveedor, derivado de sus facturas
 * (total de las líneas − abonos no anulados).
 *
 * ⚠️ **Acá no se gestiona nada.** Abonar, recibir y anular viven en Compras, y
 * duplicarlos sería tener dos puertas para la misma escritura. Esta pantalla
 * responde "cuánto" y lleva allá.
 */
function DeudaConProveedores({ suppliers }: { suppliers: LoansOverviewSuppliers }) {
  const { money } = useMoney();
  const { groups, total, aFavor } = suppliers;

  // Una sola fuente de filas: los `money()` y las decisiones se resuelven acá
  // una vez, y las dos vistas solo dibujan.
  const filas = groups.map((g) => ({
    key: g.supplierId ?? 'sin-proveedor',
    nombre: g.supplierName,
    sinNombre: g.supplierId == null,
    debe: money(g.total),
    cuantas:
      g.facturas === 0
        ? 'Sin facturas pendientes'
        : `${g.facturas} factura${g.facturas === 1 ? '' : 's'} sin pagar`,
    aFavor: g.aFavor > 0 ? money(g.aFavor) : null,
  }));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Lo que le debés a los proveedores</h2>
          <p className="text-sm text-muted-foreground">
            Las facturas de compra que todavía no pagaste. Se abonan, se reciben y se anulan en
            Compras.
          </p>
        </div>
        {/* Lleva a la pantalla donde SÍ se gestiona: no se repite el abono acá. */}
        <Link
          to="/compras"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-brand-yellow-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Ir a Compras <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <Stat label="Total por pagar" value={money(total)} accent="yellow" />

          {filas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No le debés nada a ningún proveedor: todas las facturas están pagadas.
            </p>
          ) : (
            <>
              <ul className="space-y-2 sm:hidden">
                {filas.map((f) => (
                  <li key={f.key} className="rounded-xl border border-border/70 p-3 text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn('font-medium', f.sinNombre && 'text-muted-foreground')}>
                        {f.nombre}
                      </span>
                      <span className="font-semibold tabular-nums">{f.debe}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{f.cuantas}</p>
                    {f.aFavor && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Además le pagaste {f.aFavor} de más
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              <table className="hidden w-full text-sm sm:table">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Proveedor</th>
                    <th className="py-2 pr-3 font-semibold">Facturas</th>
                    <th className="py-2 pr-3 text-right font-semibold">Pagado de más</th>
                    <th className="py-2 text-right font-semibold">Le debés</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.key} className="border-b border-border/40 last:border-0">
                      <td className={cn('py-2 pr-3', f.sinNombre && 'text-muted-foreground')}>
                        {f.nombre}
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{f.cuantas}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                        {f.aFavor ?? '—'}
                      </td>
                      <td className="py-2 text-right font-semibold tabular-nums">{f.debe}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ⚠️ Lo pagado de más va APARTE y se dice que no se compensa: si se
              restara del total, el número diría que debés menos de lo que
              debés, y esa plata no vuelve sola. */}
          {aFavor > 0 && (
            <p className="rounded-xl border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
              Hay <strong className="tabular-nums">{money(aFavor)}</strong> pagados de más en
              facturas ya cubiertas. <strong>No se descuenta</strong> de lo que debés arriba: pagar
              de más en una factura no cancela lo que debés en otra. Revisá esas facturas en
              Compras.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * El segundo bloque: lo que el negocio le debe a la contraparte, obligación por
 * obligación. Caja muestra el resumen por fuente; acá se ve **cuál** gasto
 * concreto sigue sin devolverse, que es lo que ahí no se puede ver.
 */
function DeudaConLaContraparte({ owner }: { owner: LoansOverviewOwner }) {
  const { money } = useMoney();
  const abiertas = owner.obligations.filter((o) => o.outstanding > 0);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-bold">
          Lo que el negocio le debe a {owner.counterparty.name}
        </h2>
        <p className="text-sm text-muted-foreground">
          Lo que puso de su bolsillo y todavía no se le devolvió. Se cancela de la más antigua a la
          más reciente.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <Stat label="Total por devolver" value={money(owner.total)} accent="yellow" />
          {abiertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay nada pendiente: todo lo que puso ya se le devolvió.
            </p>
          ) : (
            <ListaObligaciones obligaciones={abiertas} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}

type LoansOverviewOwner = {
  counterparty: { id: string; name: string; kind: string };
  obligations: Obligation[];
  total: number;
  applicationOrder: 'OLDEST_FIRST' | 'NEWEST_FIRST';
};

const CATEGORIA: Record<string, string> = {
  DESIGN: 'Diseño',
  PURCHASE: 'Compra',
  EQUIPMENT: 'Equipo',
  LOAN_PAYMENT: 'Cuota del préstamo',
  CONTRIBUTION: 'Aporte',
};

function ListaObligaciones({ obligaciones }: { obligaciones: Obligation[] }) {
  const { money } = useMoney();
  // Una sola fuente de filas: los `money()` se llaman acá y el markup se repite
  // tonto en las dos vistas.
  const filas = obligaciones.map((o) => ({
    key: `${o.source}-${o.sourceId}`,
    fecha: new Date(o.date).toLocaleDateString('es-VE', { timeZone: 'UTC' }),
    categoria: CATEGORIA[o.category] ?? o.category,
    puesto: money(o.amount),
    devuelto: money(o.applied),
    falta: money(o.outstanding),
  }));

  return (
    <>
      <ul className="space-y-2 sm:hidden">
        {filas.map((f) => (
          <li key={f.key} className="rounded-xl border border-border/70 p-3 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{f.categoria}</span>
              <span className="text-xs text-muted-foreground">{f.fecha}</span>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Puesto</dt>
                <dd className="tabular-nums">{f.puesto}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Devuelto</dt>
                <dd className="tabular-nums">{f.devuelto}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Falta</dt>
                <dd className="font-semibold tabular-nums">{f.falta}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 font-semibold">Fecha</th>
            <th className="py-2 pr-3 font-semibold">Qué</th>
            <th className="py-2 pr-3 text-right font-semibold">Puesto</th>
            <th className="py-2 pr-3 text-right font-semibold">Devuelto</th>
            <th className="py-2 text-right font-semibold">Falta</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.key} className="border-b border-border/40 last:border-0">
              <td className="py-2 pr-3 tabular-nums text-muted-foreground">{f.fecha}</td>
              <td className="py-2 pr-3">{f.categoria}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{f.puesto}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{f.devuelto}</td>
              <td className="py-2 text-right font-semibold tabular-nums">{f.falta}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function LoanCard({ loan }: { loan: Loan }) {
  const { money } = useMoney();
  const confirm = useConfirm();
  const [pagando, setPagando] = useState(false);
  const borrar = useDeleteLoan();

  const pagado = loan.status === 'PAGADO';
  const e = loan.estimate;

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold">{loan.name}</h3>
            <p className="text-sm text-muted-foreground">
              {loan.counterparty ? `Le debés a ${loan.counterparty.name} · ` : ''}
              {money(loan.principal)} de capital
              {loan.installmentTarget > 0 &&
                ` · cuota objetivo de ${money(loan.installmentTarget)} ${CADA[loan.paymentFrequency]}`}
            </p>
            {loan.concept && <p className="text-xs text-muted-foreground">{loan.concept}</p>}
          </div>
          <div className="flex items-center gap-2">
            {pagado ? (
              <Badge variant="success">Pagado</Badge>
            ) : (
              <>
                <Badge variant="outline">Activo</Badge>
                <Button size="sm" onClick={() => setPagando(true)}>
                  Registrar pago
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Borrar ${loan.name}`}
              onClick={async () => {
                if (
                  await confirm({
                    title: `¿Borrar “${loan.name}”?`,
                    description: `Se van con él sus ${loan.payments.length} pagos registrados.`,
                    tone: 'destructive',
                  })
                ) {
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
            </span>
          </div>
          <ProgressBar value={loan.progress} tone={pagado ? 'success' : 'gold'} className="h-3" />
          {!pagado && <Estimacion estimate={e} />}
        </div>

        {loan.payments.length > 0 && <Pagos loan={loan} />}

        {loan.nextDueDate && (
          <p className="text-xs text-muted-foreground">
            Próximo vencimiento anotado:{' '}
            {new Date(loan.nextDueDate).toLocaleDateString('es-VE', { timeZone: 'UTC' })}
          </p>
        )}
        {loan.notes && <p className="text-xs text-muted-foreground">{loan.notes}</p>}
      </CardContent>

      <PaymentDialog loan={loan} open={pagando} onClose={() => setPagando(false)} />
    </Card>
  );
}

/**
 * Cuánto falta, en DOS lecturas.
 *
 * ⚠️ Una sola miente cuando los pagos son irregulares: "faltan 8 meses" es
 * cierto solo si se cumple la cuota objetivo, y el ritmo real puede ser otro.
 */
function Estimacion({ estimate }: { estimate: Loan['estimate'] }) {
  const { atTarget, atActualPace, unit } = estimate;

  if (atTarget == null && atActualPace == null) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Sin cuota objetivo y sin pagos todavía no se puede estimar cuándo termina. Cargá la cuota
        para que entre en el punto de equilibrio.
      </p>
    );
  }

  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>
        Al ritmo objetivo:{' '}
        {atTarget == null ? (
          <em>sin cuota cargada</em>
        ) : (
          <strong className="tabular-nums">
            {atTarget} {plural(atTarget, unit)}
          </strong>
        )}
      </span>
      <span>
        · Al ritmo real:{' '}
        {atActualPace == null ? (
          <em>todavía no se puede medir</em>
        ) : (
          <strong className="tabular-nums">
            {atActualPace} {plural(atActualPace, unit)}
          </strong>
        )}
      </span>
      <span className="basis-full">Son estimaciones, no fechas pactadas.</span>
    </p>
  );
}

function Pagos({ loan }: { loan: Loan }) {
  const { money } = useMoney();
  const confirm = useConfirm();
  const anular = useVoidLoanPayment();

  const anularPago = async (p: LoanPayment) => {
    const ok = await confirm({
      title: `¿Anular el pago de ${money(p.amount)}?`,
      description:
        'El pago queda en el historial marcado como anulado y el saldo vuelve a subir. No se borra.',
      confirmLabel: 'Anular',
      tone: 'destructive',
    });
    if (!ok) return;
    anular.mutate(
      { id: loan.id, paymentId: p.id, reason: 'Anulado desde la pantalla' },
      {
        onSuccess: () => notify.success('Pago anulado'),
        onError: (err) => notify.error(apiErrorMessage(err)),
      },
    );
  };

  // Una sola fuente de filas: `money()`, las decisiones y el handler viven acá
  // una vez, y las dos vistas solo dibujan.
  const filas = loan.payments.map((p) => ({
    key: p.id,
    anulado: p.voidedAt != null,
    fecha: new Date(p.date).toLocaleDateString('es-VE', { timeZone: 'UTC' }),
    monto: money(p.amount),
    referencia: p.reference ?? '—',
    // El nombre viaja CON el pago: quien puso la plata de una cuota no es el
    // acreedor del préstamo, y buscarlo por separado ya se leyó mal una vez.
    quien: p.counterparty?.name ?? 'La caja',
    deLaCaja: p.counterparty == null,
    deuda: p.generatesDebt,
    importado: p.source === 'EXCEL_IMPORT',
    motivo: p.voidReason,
    onAnular: () => anularPago(p),
  }));

  return (
    <>
      <ul className="space-y-2 sm:hidden">
        {filas.map((f) => (
          <li
            key={f.key}
            className={cn('rounded-xl border border-border/70 p-3 text-sm', f.anulado && 'opacity-50')}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn('font-semibold tabular-nums', f.anulado && 'line-through')}>
                {f.monto}
              </span>
              <span className="text-xs text-muted-foreground">{f.fecha}</span>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="outline">{f.quien}</Badge>
              {!f.deLaCaja && f.deuda && <Badge variant="brand">Genera deuda</Badge>}
              {f.importado && <Badge variant="outline">Importado</Badge>}
              {f.anulado && <Badge variant="outline">Anulado</Badge>}
            </p>
            {f.referencia !== '—' && (
              <p className="mt-1 truncate text-xs text-muted-foreground">{f.referencia}</p>
            )}
            {f.motivo && <p className="mt-1 text-xs text-muted-foreground">{f.motivo}</p>}
            {!f.anulado && (
              <Button size="sm" variant="ghost" className="mt-1" onClick={f.onAnular}>
                <Undo2 className="h-4 w-4" /> Anular
              </Button>
            )}
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 font-semibold">Fecha</th>
            <th className="py-2 pr-3 text-right font-semibold">Pago</th>
            <th className="py-2 pr-3 font-semibold">Referencia</th>
            <th className="py-2 pr-3 font-semibold">Lo puso</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr
              key={f.key}
              className={cn('border-b border-border/40 last:border-0', f.anulado && 'opacity-50')}
            >
              <td className="py-2 pr-3 align-top tabular-nums text-muted-foreground">{f.fecha}</td>
              <td className={cn('py-2 pr-3 text-right align-top tabular-nums', f.anulado && 'line-through')}>
                {f.monto}
              </td>
              <td className="max-w-[16rem] truncate py-2 pr-3 align-top text-xs text-muted-foreground">
                {f.referencia}
                {f.motivo && <span className="block">{f.motivo}</span>}
              </td>
              <td className="py-2 pr-3 align-top">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline">{f.quien}</Badge>
                  {!f.deLaCaja && f.deuda && <Badge variant="brand">Genera deuda</Badge>}
                  {f.importado && <Badge variant="outline">Importado</Badge>}
                  {f.anulado && <Badge variant="outline">Anulado</Badge>}
                </span>
              </td>
              <td className="py-2 text-right align-top">
                {!f.anulado && (
                  <button
                    type="button"
                    aria-label="Anular pago"
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={f.onAnular}
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const hoy = () => todayKey();

function PaymentDialog({ loan, open, onClose }: { loan: Loan; open: boolean; onClose: () => void }) {
  const { money } = useMoney();
  const [date, setDate] = useState(hoy());
  const [amount, setAmount] = useState(0);
  const [reference, setReference] = useState('');
  const [quien, setQuien] = useState('');
  const [generatesDebt, setGeneratesDebt] = useState(true);
  const guardar = useAddLoanPayment();
  const { data: contrapartes = [] } = useCounterparties();

  const deLaCaja = quien === '';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title={`Pago de ${loan.name}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate(
            {
              id: loan.id,
              date,
              amount,
              reference: reference.trim() || null,
              counterpartyId: quien || null,
              generatesDebt: !deLaCaja && generatesDebt,
            },
            {
              onSuccess: () => {
                notify.success('Pago registrado');
                onClose();
              },
              onError: (err) => notify.error(apiErrorMessage(err)),
            },
          );
        }}
      >
        <FieldGrid min="11rem">
          <Field label="Fecha">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
          </Field>
          <Field label="Monto" hint={`Saldo pendiente: ${money(loan.balance)}`}>
            <NumberInput step="0.01" value={amount} onChange={setAmount} />
          </Field>
        </FieldGrid>

        <Field label="Referencia" hint="La transferencia, o lo que te sirva para reconocerlo">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>

        <Field label="¿Quién puso la plata?">
          <Select value={quien} onChange={(e) => setQuien(e.target.value)}>
            <option value="">La caja del negocio</option>
            {contrapartes
              .filter((c) => c.kind !== 'EXTERNAL_LENDER')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>

        {/* ⚠️ No se asume. Hasta ahora todo pago del propietario generaba deuda
            sin que nadie lo decidiera. */}
        {!deLaCaja && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={generatesDebt}
              onChange={(e) => setGeneratesDebt(e.target.checked)}
            />
            <span>
              El negocio se lo debe
              <span className="block text-xs text-muted-foreground">
                Destildalo si lo puso a fondo perdido y no espera que se lo devuelvan.
              </span>
            </span>
          </label>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={amount <= 0 || guardar.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function NewLoanDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [concept, setConcept] = useState('');
  const [principal, setPrincipal] = useState(0);
  const [installment, setInstallment] = useState(0);
  const [frequency, setFrequency] = useState<PaymentFrequency>('MONTHLY');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [startDate, setStartDate] = useState(hoy());
  const [nextDueDate, setNextDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const crear = useCreateLoan();
  const { data: contrapartes = [] } = useCounterparties();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()} title="Nuevo préstamo">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate(
            {
              name,
              concept: concept.trim() || null,
              principal,
              monthlyPayment: installment,
              paymentFrequency: frequency,
              counterpartyId: counterpartyId || null,
              startDate,
              nextDueDate: nextDueDate || null,
              notes: notes.trim() || null,
            },
            {
              onSuccess: () => {
                notify.success('Préstamo cargado');
                onClose();
              },
              onError: (err) => notify.error(apiErrorMessage(err)),
            },
          );
        }}
      >
        <Field label="Nombre" hint="Cómo lo reconocés vos: “Deuda impresora P2S”">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>

        <Field label="¿Quién te prestó la plata?" hint="El acreedor, que no es lo mismo que el nombre de la deuda">
          <Select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)}>
            <option value="">Sin especificar</option>
            {contrapartes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Qué se financió" hint="Opcional">
          <Input value={concept} onChange={(e) => setConcept(e.target.value)} />
        </Field>

        <FieldGrid min="11rem">
          <Field label="Capital">
            <NumberInput step="0.01" value={principal} onChange={setPrincipal} />
          </Field>
          <Field label="Cuota objetivo" hint="Lo que te proponés pagar">
            <NumberInput step="0.01" value={installment} onChange={setInstallment} />
          </Field>
          <Field label="Cada cuánto">
            <Select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as PaymentFrequency)}
            >
              {(Object.keys(CADA) as PaymentFrequency[]).map((f) => (
                <option key={f} value={f}>
                  {CADA[f]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Desde">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          {/* Solo si existe de verdad: sin calendario pactado, una fecha
              calculada se lee como un compromiso que no hay. */}
          <Field label="Próximo vencimiento" hint="Solo si acordaste una fecha">
            <Input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
            />
          </Field>
        </FieldGrid>

        <Field label="Notas" hint="Opcional">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!name || principal <= 0 || crear.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
