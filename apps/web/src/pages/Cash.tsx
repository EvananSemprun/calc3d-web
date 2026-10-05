import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Plus,
  Trash2,
  Undo2,
} from 'lucide-react';
import { CASH_SIGN, type CashCategory, type OwnerFinancingKey } from '@calc3d/shared';
import { Badge, Button, Card, CardContent, EmptyState, Field, Input, NumberInput, PageSkeleton, Select, Stat, TableSkeleton } from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { useMoney, useSettings } from '@/features/settings/useSettings';
import { todayKey } from '@/lib/today';
import { apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  type CashBreakdown,
  type CashSummary,
  useAddMovement,
  useCash,
  useCashBreakdown,
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

/**
 * Las nueve líneas de "De dónde sale el saldo", en el orden de `CASH_SIGN`.
 *
 * ⚠️ El texto sale del nombre DINÁMICO de la contraparte (fase 2): nunca un
 * nombre propio escrito a mano. Y las categorías se recorren desde `CASH_SIGN`,
 * que es la única lista: una categoría nueva en el motor aparece sola en vez de
 * quedarse afuera en silencio.
 */
function etiquetasSaldo(nombre: string): Record<CashCategory, string> {
  return {
    collected: 'Ventas cobradas',
    expenses: 'Gastos generales',
    filament: 'Filamento comprado',
    equipment: 'Equipos pagados por la caja',
    contributionsRefundable: `Aportes de ${nombre} (se devuelven)`,
    contributionsCapital: `Aportes de capital de ${nombre}`,
    debtRepayments: `Devoluciones a ${nombre}`,
    ownerDraws: `Retiros de ${nombre}`,
    loanPayments: 'Cuotas pagadas por la caja',
  };
}

function SaldoCard({ data }: { data: CashSummary }) {
  const { money } = useMoney();
  const b = data.balance;
  const etiquetas = etiquetasSaldo(data.counterparty.name);

  /**
   * UNA sola categoría abierta por vez: dos listas largas abiertas en un
   * teléfono dejan la tarjeta ilegible.
   */
  const [abierta, setAbierta] = useState<CashCategory | null>(null);
  // Perezoso: con `abierta` en null el hook no pide nada.
  const detalle = useCashBreakdown(abierta);

  /**
   * El signo lo pone la categoría (`CASH_SIGN`), no la línea. Es el mismo que
   * usa el motor para armar el saldo, así que el detalle y el resumen no pueden
   * discrepar en el sentido de un número.
   */
  const lineas = (Object.keys(CASH_SIGN) as CashCategory[])
    .map((category) => ({
      category,
      etiqueta: etiquetas[category],
      valor: CASH_SIGN[category] * b[category],
    }))
    .filter((l) => l.valor !== 0);

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div>
          <h2 className="font-display text-lg font-bold">De dónde sale el saldo</h2>
          <p className="text-sm text-muted-foreground">
            Tocá una línea para ver de qué movimientos sale.
          </p>
        </div>
        <ul className="divide-y divide-border/50 text-sm">
          {lineas.map((l) => {
            const abierto = abierta === l.category;
            const idRegion = `saldo-detalle-${l.category}`;
            return (
              <li key={l.category}>
                <button
                  type="button"
                  onClick={() => setAbierta(abierto ? null : l.category)}
                  aria-expanded={abierto}
                  aria-controls={idRegion}
                  className="flex w-full items-center justify-between gap-3 rounded-md py-2 text-left transition-colors hover:text-brand-yellow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <ChevronRight
                      aria-hidden
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                        abierto && 'rotate-90',
                      )}
                    />
                    <span className="truncate text-muted-foreground">{l.etiqueta}</span>
                  </span>
                  <span className={cn('shrink-0 tabular-nums', l.valor < 0 && 'text-destructive')}>
                    {l.valor > 0 ? '+' : ''}
                    {money(l.valor)}
                  </span>
                </button>
                {abierto && (
                  <div
                    id={idRegion}
                    role="region"
                    aria-label={`Detalle de ${l.etiqueta}`}
                    className="pb-3 pl-5"
                  >
                    <DetalleSaldo
                      linea={l}
                      datos={detalle.data}
                      cargando={detalle.isPending}
                      error={detalle.error}
                    />
                  </div>
                )}
              </li>
            );
          })}
          <li className="flex justify-between gap-3 pt-2 font-semibold">
            <span>Saldo del negocio</span>
            <span className="tabular-nums">{money(b.balance)}</span>
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Caja no es ganancia: un rollo sin usar o una cuota sacan plata sin ser pérdida, y un
          aporte tuyo la sube sin ser venta. Una devolución baja la caja y la deuda a la vez:
          no es un gasto.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * El detalle de UNA categoría, ya abierto.
 *
 * ⚠️ El total va al PIE y sale de lo que devolvió el servidor, no de la línea
 * de arriba. Si alguna vez no coinciden, el aviso lo dice con todas las letras:
 * un detalle que se "corrige" solo para cuadrar con el resumen esconde
 * justamente el día en que una de las dos cuentas se rompió.
 */
function DetalleSaldo({
  linea,
  datos,
  cargando,
  error,
}: {
  linea: { category: CashCategory; etiqueta: string; valor: number };
  datos: CashBreakdown | undefined;
  cargando: boolean;
  error: unknown;
}) {
  const { money } = useMoney();
  const signo = CASH_SIGN[linea.category];

  if (error) {
    return (
      <p role="alert" className="py-2 text-xs text-destructive">
        No pude traer el detalle: {apiErrorMessage(error)}
      </p>
    );
  }
  if (cargando || !datos) return <TableSkeleton rows={3} cols={3} />;

  // Una línea solo se dibuja si vale distinto de cero, así que acá un detalle
  // vacío NUNCA es "no hubo movimientos": es que el detalle y el saldo dejaron
  // de salir del mismo lugar.
  if (datos.entries.length === 0) {
    return (
      <p role="alert" className="py-2 text-xs font-medium text-destructive">
        Esta línea vale {money(linea.valor)} y el detalle vino vacío. Eso es un BUG, no una
        categoría sin movimientos: no te fíes de este número hasta que se arregle.
      </p>
    );
  }

  const total = signo * datos.total;
  // Centavo de tolerancia: lo que importa es una diferencia de plata, no el
  // ruido de coma flotante.
  const descuadre = Math.abs(total - linea.valor) >= 0.005;

  return (
    <>
      <ul className="divide-y divide-border/30 text-xs">
        {datos.entries.map((e, i) => (
          <li key={`${e.date}-${i}`} className="flex items-center justify-between gap-2 py-1.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 tabular-nums text-muted-foreground">{fecha(e.date)}</span>
              <span className="truncate" title={e.label}>
                {e.label}
              </span>
              {/* Solo EXCEL_IMPORT: MIGRATION y RECONCILIATION no son importaciones. */}
              {e.source === 'EXCEL_IMPORT' && (
                <Badge variant="outline" className="shrink-0">
                  Importado
                </Badge>
              )}
            </span>
            <span className={cn('shrink-0 tabular-nums', signo < 0 && 'text-destructive')}>
              {money(signo * e.amount)}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-border/50 pt-2 text-xs font-semibold">
        <span>
          Total del detalle &middot; {datos.entries.length}{' '}
          {datos.entries.length === 1 ? 'movimiento' : 'movimientos'}
        </span>
        <span className={cn('tabular-nums', descuadre && 'text-destructive')}>{money(total)}</span>
      </div>
      {descuadre && (
        <p role="alert" className="mt-1 text-xs font-medium text-destructive">
          El detalle suma {money(total)} y la línea de arriba dice {money(linea.valor)}. Son la
          misma cuenta: que no coincidan es un BUG.
        </p>
      )}
    </>
  );
}

const FUENTE: Record<OwnerFinancingKey, string> = {
  designer: 'Diseñador',
  purchases: 'Compras y aportes',
  loanPayments: 'Cuotas del préstamo',
  equipment: 'Equipos',
};

/**
 * Las columnas de "Quién puso la plata", en orden. La primera es la etiqueta de
 * la fila; las otras tres son los números.
 */
const COLUMNAS_FINANCIAMIENTO = ['Puesto', 'Recuperado', 'Falta'] as const;

/**
 * Una fila ya resuelta: el texto de cada celda sale de acá, UNA sola vez.
 *
 * ⚠️ Las dos presentaciones (tabla desde `sm`, tarjetas en el teléfono) leen
 * esta lista; ninguna de las dos vuelve a llamar a `money()` ni a decidir qué
 * mostrar. Con dos fuentes, arreglar un número en una dejaría la otra mintiendo
 * en la misma pantalla.
 */
type FilaFinanciamiento = {
  key: string;
  fuente: string;
  /** Los tres montos ya formateados, en el orden de `COLUMNAS_FINANCIAMIENTO`. */
  valores: string[];
};

function FinanciamientoCard({ data }: { data: CashSummary }) {
  const { money } = useMoney();
  const f = data.financing;
  const nombre = data.counterparty.name;

  const filas: FilaFinanciamiento[] = [
    ...f.rows.map((r) => ({
      key: r.key,
      fuente: `${nombre} · ${FUENTE[r.key]}`,
      valores: [money(r.put), money(r.recovered), money(r.missing)],
    })),
    {
      key: 'lender',
      fuente: 'Prestamista · saldo',
      // Al prestamista se le paga con las cuotas, no con la caja: no hay nada
      // "recuperado" que mostrar, y un $0,00 ahí se leería como un dato.
      valores: [money(f.owedToLender), '—', money(f.owedToLender)],
    },
  ];
  const total = money(f.totalOwed);

  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <h2 className="font-display text-lg font-bold">Quién puso la plata</h2>

        {/* Teléfono: una tarjeta por fuente, con pares etiqueta-valor. La tabla
            de cuatro columnas obligaba a arrastrar la pantalla de lado. */}
        <div className="space-y-2 sm:hidden">
          {filas.map((fila) => (
            <div key={fila.key} className="rounded-lg border border-border/60 p-3">
              <p className="text-sm font-medium">{fila.fuente}</p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                {COLUMNAS_FINANCIAMIENTO.map((columna, i) => (
                  <div key={columna}>
                    <dt className="text-muted-foreground">{columna}</dt>
                    <dd className="tabular-nums">{fila.valores[i]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {/* Destacado: es el número que el dueño viene a buscar. */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-blue/45 bg-brand-blue/[0.10] p-3">
            <span className="text-sm font-semibold">Total por devolver</span>
            <span className="font-display text-lg font-bold tabular-nums">{total}</span>
          </div>
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[24rem] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Fuente</th>
                {COLUMNAS_FINANCIAMIENTO.map((columna) => (
                  <th key={columna} className="py-2 pr-3 text-right font-semibold last:pr-0">
                    {columna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.key} className="border-b border-border/40">
                  <td className="py-2 pr-3">{fila.fuente}</td>
                  {fila.valores.map((valor, i) => (
                    <td
                      key={COLUMNAS_FINANCIAMIENTO[i]}
                      className={cn(
                        'py-2 pr-3 text-right tabular-nums last:pr-0',
                        COLUMNAS_FINANCIAMIENTO[i] === 'Recuperado' && 'text-muted-foreground',
                      )}
                    >
                      {valor}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-3" colSpan={COLUMNAS_FINANCIAMIENTO.length}>
                  Total por devolver
                </td>
                <td className="py-2 text-right tabular-nums">{total}</td>
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

/**
 * Las cuatro líneas de una conciliación, en orden. La diferencia va aparte:
 * es la conclusión, no una quinta columna.
 */
const COLUMNAS_CONCILIACION = ['En la cuenta', 'Personal', 'Del negocio', 'Esperado'] as const;

/** Las que son contexto y van apagadas; las otras dos son las que se comparan. */
const CONCILIACION_APAGADAS: readonly string[] = ['Personal', 'Esperado'];

/**
 * Una conciliación ya resuelta para mostrar.
 *
 * ⚠️ Las dos presentaciones (tabla desde `sm`, tarjetas en el teléfono) leen
 * esta lista: los `money()`, las anotaciones y el botón de anular se arman UNA
 * sola vez. Con dos fuentes, el día que cambie una anotación la otra seguiría
 * mostrando la vieja, en la misma pantalla y sin que nada falle.
 */
type FilaConciliacion = {
  id: string;
  /** Anulada: se tacha y se apaga, pero no desaparece del historial. */
  anulada: boolean;
  fechaTxt: string;
  importado: boolean;
  borrador: boolean;
  estado: string;
  /** Los cuatro montos ya formateados, en el orden de `COLUMNAS_CONCILIACION`. */
  valores: string[];
  diferencia: string;
  /** El color de la diferencia; vacío si cuadró. */
  tonoDiferencia: string;
  note: string | null;
  explanation: string | null;
  /** El movimiento del ajuste, para poder saltar a él en los movimientos. */
  ajuste: { id: string; texto: string } | null;
  stale: string | null;
  /** Solo lo confirmado se anula: un borrador no movió nada todavía. */
  onAnular: (() => void) | null;
};

/** Lo que se dice de una conciliación debajo de su fecha, en las dos vistas. */
function Anotaciones({ fila }: { fila: FilaConciliacion }) {
  if (!fila.note && !fila.explanation && !fila.ajuste && !fila.stale) return null;
  return (
    <div className="space-y-0.5 text-xs">
      {fila.note && <p>{fila.note}</p>}
      {fila.explanation && <p>{fila.explanation}</p>}
      {fila.ajuste && (
        // El historial no decía dónde había quedado el ajuste; ahora salta a él.
        <p>
          <a
            href={`#mov-${fila.ajuste.id}`}
            className="rounded-sm underline decoration-dotted underline-offset-2 hover:text-brand-yellow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {fila.ajuste.texto}
          </a>
        </p>
      )}
      {fila.stale && <p>{fila.stale}</p>}
    </div>
  );
}

/** El botón de anular: con texto en el teléfono, solo el ícono en la tabla. */
function BotonAnular({ fila }: { fila: FilaConciliacion }) {
  if (!fila.onAnular) return null;
  return (
    <button
      type="button"
      aria-label={`Anular la conciliación del ${fila.fechaTxt}`}
      className="inline-flex items-center gap-1.5 rounded-md p-1 text-xs text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={fila.onAnular}
    >
      <Undo2 aria-hidden className="h-4 w-4" />
      <span className="sm:sr-only">Anular</span>
    </button>
  );
}

function ConciliacionesCard({ data, onNuevo }: { data: CashSummary; onNuevo: () => void }) {
  const { money } = useMoney();
  const confirm = useConfirm();
  const anular = useVoidReconciliation();
  const nombre = data.counterparty.name;

  const filas: FilaConciliacion[] = data.reconciliations.map((c) => ({
    id: c.id,
    anulada: c.status === 'VOID',
    fechaTxt: fecha(c.date),
    // Solo lo que vino del Excel: MIGRATION y RECONCILIATION no son
    // importaciones y una insignia de más vuelve ruido a todas.
    importado: c.source === 'EXCEL_IMPORT',
    borrador: c.status === 'DRAFT',
    estado: ESTADO[c.kind],
    valores: [
      money(c.totalUsd),
      money(c.personalUsd),
      money(c.businessActualUsd),
      money(c.expectedUsd),
    ],
    diferencia: money(c.differenceUsd),
    tonoDiferencia:
      c.kind === 'SHORT' ? 'text-destructive' : c.kind === 'FAVOR' ? 'text-success' : '',
    note: c.note,
    explanation: c.explanation,
    ajuste: c.adjustment
      ? { id: c.adjustment.id, texto: `Ajustada con ${money(c.adjustment.amount)}` }
      : null,
    stale: c.stale
      ? `Hoy daría ${money(c.expectedNow)}: entraron movimientos con fecha anterior.`
      : null,
    onAnular:
      c.status === 'CONFIRMED'
        ? async () => {
            const ok = await confirm({
              title: `¿Anular la conciliación del ${fecha(c.date)}?`,
              description: c.adjustment
                ? `Se borra el ajuste de ${money(c.adjustment.amount)} y sus aplicaciones a deudas. La conciliación queda en el historial.`
                : 'La conciliación queda en el historial, marcada como anulada.',
              confirmLabel: 'Anular',
              tone: 'destructive',
            });
            if (ok) {
              anular.mutate(c.id, { onSuccess: () => notify.success('Conciliación anulada') });
            }
          }
        : null,
  }));

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
        {filas.length === 0 ? (
          <EmptyState
            title="Todavía no conciliaste"
            description="Una vez por semana, antes de abrir. Si se te pasa, hacelo al otro día: lo grave es dejar pasar dos semanas."
            action={<Button onClick={onNuevo}>Primera conciliación</Button>}
          />
        ) : (
          <>
            {/* Teléfono: una tarjeta por conciliación. Ocho columnas con
                `min-w-[42rem]` obligaban a leer la caja de costado. */}
            <div className="space-y-2 sm:hidden">
              {filas.map((fila) => (
                <div
                  key={fila.id}
                  className={cn(
                    'rounded-lg border border-border/60 p-3',
                    fila.anulada && 'line-through opacity-50',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium tabular-nums">
                      {fila.fechaTxt}
                      {fila.importado && <Badge variant="outline">Importado</Badge>}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {fila.estado}
                      {fila.borrador && <Badge variant="warning">Borrador</Badge>}
                      {fila.anulada && <Badge variant="outline">Anulada</Badge>}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    {COLUMNAS_CONCILIACION.map((columna, i) => (
                      <div key={columna}>
                        <dt className="text-muted-foreground">{columna}</dt>
                        <dd className="tabular-nums">{fila.valores[i]}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/50 pt-2">
                    <span className="text-xs text-muted-foreground">Diferencia</span>
                    <span className={cn('font-semibold tabular-nums', fila.tonoDiferencia)}>
                      {fila.diferencia}
                    </span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    <Anotaciones fila={fila} />
                  </div>
                  <BotonAnular fila={fila} />
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[42rem] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Fecha</th>
                    {COLUMNAS_CONCILIACION.map((columna) => (
                      <th key={columna} className="py-2 pr-3 text-right font-semibold">
                        {columna}
                      </th>
                    ))}
                    <th className="py-2 pr-3 text-right font-semibold">Diferencia</th>
                    <th className="py-2 pr-3 font-semibold">Estado</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila) => (
                    <tr
                      key={fila.id}
                      className={cn(
                        'border-b border-border/40 last:border-0',
                        fila.anulada && 'line-through opacity-50',
                      )}
                    >
                      <td className="py-2 pr-3 align-top tabular-nums text-muted-foreground">
                        <span className="flex flex-wrap items-center gap-2">
                          {fila.fechaTxt}
                          {fila.importado && <Badge variant="outline">Importado</Badge>}
                        </span>
                        <Anotaciones fila={fila} />
                      </td>
                      {fila.valores.map((valor, i) => (
                        <td
                          key={COLUMNAS_CONCILIACION[i]}
                          className={cn(
                            'py-2 pr-3 text-right align-top tabular-nums',
                            CONCILIACION_APAGADAS.includes(COLUMNAS_CONCILIACION[i]) &&
                              'text-muted-foreground',
                          )}
                        >
                          {valor}
                        </td>
                      ))}
                      <td
                        className={cn(
                          'py-2 pr-3 text-right align-top font-semibold tabular-nums',
                          fila.tonoDiferencia,
                        )}
                      >
                        {fila.diferencia}
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <span className="flex flex-wrap items-center gap-2">
                          {fila.estado}
                          {fila.borrador && <Badge variant="warning">Borrador</Badge>}
                          {fila.anulada && <Badge variant="outline">Anulada</Badge>}
                        </span>
                      </td>
                      <td className="py-2 text-right align-top">
                        <BotonAnular fila={fila} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
                <li
                  key={m.id}
                  // El destino del enlace "Ajustada con" del historial. El
                  // `scroll-mt` existe porque el encabezado es `sticky top-0`:
                  // sin él, el salto deja la fila justo debajo y tapada.
                  id={`mov-${m.id}`}
                  className="flex items-center gap-3 rounded-md px-1 py-2.5 text-sm scroll-mt-24 target:bg-brand-yellow/10 target:ring-1 target:ring-brand-yellow/50"
                >
                  <Icono className={cn('h-4 w-4 shrink-0', sale ? 'text-destructive' : 'text-success')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{m.concept}</p>
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                      <span className="tabular-nums">{fecha(m.date)}</span> ·{' '}
                      <Badge variant="outline">{etiqueta}</Badge>
                      {/* Solo lo que vino del Excel: MIGRATION y RECONCILIATION no
                          son importaciones y una insignia de más vuelve ruido a
                          todas. */}
                      {m.source === 'EXCEL_IMPORT' && <Badge variant="outline">Importado</Badge>}
                      {m.note && <span className="min-w-0 truncate">· {m.note}</span>}
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
