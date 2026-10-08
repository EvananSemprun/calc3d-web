import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import { LineChart as LineIcon, AlertTriangle, Megaphone } from 'lucide-react';
import {
  breakEvenLevels,
  breakEvenProgress,
  fixedCostsTotal,
  monthlyLoanPayments,
  campaignHealth,
} from '@calc3d/shared';
import { paraEquilibrio, useLoans } from '@/features/loans/api';
import { useGoalForMonth } from '@/features/goals/api';
import { useEquipmentRecovery } from '@/features/equipment/api';
import { useCash } from '@/features/cash/api';
import { currentMonthKey } from '@/lib/today';
import { Card, CardContent, CardHeader, CardTitle, ProgressBar, Select, Stat, TableSkeleton } from '@/components/ui';
import { usePersistentState } from '@/lib/usePersistentState';
import { cn } from '@/lib/utils';
import { NumberTicker } from '@/components/effects';
import { useMoney, useSettings } from '@/features/settings/useSettings';
import { useOrderPayments } from '@/features/orders/api';
import { useCampaigns, isCampaignVigente } from '@/features/campaigns/api';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { DateRangePicker, useDateRange } from '@/features/finance/DateRange';
import { storeProductsBelowMargin, useStoreProducts } from '@/features/store/api';
import {
  LINK_KIND_LABELS,
  SALE_KIND_LABELS,
  expenseLink,
  useExpenses,
  useSales,
} from '@/features/finance/api';

/** Canal de los gráficos: todo, solo mostrador o solo abonos de encargos. */
type Canal = 'ALL' | 'COUNTER' | 'ORDERS';

const GOLD = '#FFC300';
const BLUE = '#3b82c4';
const GREEN = '#22c55e';
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const tooltipStyle = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 10,
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
};

export function DashboardPage() {
  const range = useDateRange('MONTH', 'dashboard');
  const { money, moneyAlt } = useMoney();
  const { data: settings } = useSettings();
  // Canal de los gráficos. Se recuerda como el resto de los filtros de la app.
  const [canal, setCanal] = usePersistentState<Canal>('dashboard:canal', 'ALL');
  const verCanal = (c: Exclude<Canal, 'ALL'>) => canal === 'ALL' || canal === c;
  const sales = useSales(range);
  const expenses = useExpenses(range);
  const payments = useOrderPayments(range);

  const loading = sales.isLoading || expenses.isLoading;
  const saleRows = sales.data ?? [];
  const expenseRows = expenses.data ?? [];
  const paymentRows = payments.data ?? [];

  const agg = React.useMemo(() => {
    /**
     * ⚠️ LAS 25 VENTAS `ENCARGO` SON TOTALES SEMANALES DEL EXCEL, no ventas de
     * un día: se importaron **todas fechadas el lunes** porque la hoja no
     * registraba el día (`docs/excel-vs-app.md`). Metidas en un gráfico DIARIO
     * solo pueden mentir: el lunes parecía el mejor día del negocio por $1.323
     * que en realidad son 25 semanas enteras. Y en el ticket promedio contaban
     * como 25 "ventas" de ~$53, inflando el promedio.
     *
     * Se excluyen de todo lo que mira el DÍA (ingresos por día, día de la
     * semana, ticket). NO se excluyen de los totales de plata, que son reales,
     * ni de los gráficos MENSUALES: una semana sí cae dentro de un mes.
     */
    const mostradorRows = saleRows.filter((r) => r.kind === 'COUNTER');
    const historicoRows = saleRows.filter((r) => r.kind === 'ENCARGO');
    const historicoTotal = historicoRows.reduce((s, r) => s + r.amount, 0);

    const ventas = saleRows.reduce((s, r) => s + r.amount, 0);
    // Abonos de pedidos: dinero que entra por encargos, flujo SEPARADO de las
    // ventas mostrador (no se genera un Sale por abono, así no hay doble conteo).
    const abonos = paymentRows.reduce((s, r) => s + r.amount, 0);
    const ingresos = ventas + abonos;
    const gastos = expenseRows.reduce((s, r) => s + r.amount, 0);
    const inversion = expenseRows.filter((e) => e.isInvestment).reduce((s, r) => s + r.amount, 0);
    // ⚠️ La UTILIDAD se mide contra los gastos OPERATIVOS, no contra todo lo que
    // salió. Comprar una impresora no es perder ese dinero: es inversión que el
    // negocio devuelve, y por eso la tarjeta de Reposición de equipos la excluye
    // (`ganancia acumulada = ingresos − gastos operativos`, definición del dueño).
    // Restándola acá, la misma pantalla decía dos ganancias distintas: el KPI
    // contaba las impresoras como gasto y el texto de abajo afirmaba lo contrario.
    const gastosOperativos = gastos - inversion;
    const utilidad = ingresos - gastosOperativos;

    /**
     * Ingresos por día, SEPARADOS POR CANAL (2026-10-02). Saber si la plata de
     * un día entró por mostrador o por abonos de encargos dice más que el total
     * solo. Sin el histórico semanal, que no es diario (ver arriba).
     */
    const byDayMap = new Map<string, { mostrador: number; encargos: number }>();
    const atDay = (d: string) => {
      let v = byDayMap.get(d);
      if (!v) {
        v = { mostrador: 0, encargos: 0 };
        byDayMap.set(d, v);
      }
      return v;
    };
    for (const r of mostradorRows) atDay(r.date.slice(0, 10)).mostrador += r.amount;
    for (const r of paymentRows) atDay(r.date.slice(0, 10)).encargos += r.amount;
    const byDay = [...byDayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, v]) => ({
        label: `${d.slice(8, 10)}/${d.slice(5, 7)}`,
        mostrador: v.mostrador,
        encargos: v.encargos,
      }));

    // Mostrador vs Encargo
    const kindMap = new Map<string, number>();
    for (const r of saleRows) kindMap.set(r.kind, (kindMap.get(r.kind) ?? 0) + r.amount);
    const byKind = [...kindMap.entries()].map(([k, v]) => ({
      kind: k as 'COUNTER' | 'ENCARGO',
      name: SALE_KIND_LABELS[k as 'COUNTER' | 'ENCARGO'],
      value: v,
    }));

    /**
     * Gasto por tipo de recurso. ⚠️ SIN la inversión en equipos: el KPI de
     * arriba ya la excluye (`gastosOperativos`), y tenerla acá hacía que la
     * misma pantalla usara dos definiciones de "gasto" — una impresora de $600
     * dominaba el gráfico mientras el KPI afirmaba que no era gasto. Los
     * equipos tienen su propia tarjeta de Reposición.
     */
    const resMap = new Map<string, number>();
    for (const r of expenseRows) {
      if (r.isInvestment) continue;
      const link = expenseLink(r);
      const label = link ? LINK_KIND_LABELS[link.kind] : 'General';
      resMap.set(label, (resMap.get(label) ?? 0) + r.amount);
    }
    const byResource = [...resMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([recurso, v]) => ({ recurso, gasto: v }));

    // Ventas por día de la semana (lunes primero). Las fechas se guardan como
    // medianoche UTC; el día se deriva del string YYYY-MM-DD con aritmética UTC
    // para que coincida con "Ventas por día" (que usa r.date.slice(0,10)). Con
    // new Date(r.date).getDay() (día LOCAL), al oeste de UTC toda venta date-only
    // caería en el día de semana anterior (el lunes se graficaría como domingo).
    const diaDeLaSemana = (iso: string) => {
      const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
      return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // lunes = 0
    };
    const wdMostrador = Array(7).fill(0) as number[];
    const wdEncargos = Array(7).fill(0) as number[];
    for (const r of mostradorRows) wdMostrador[diaDeLaSemana(r.date)] += r.amount;
    for (const r of paymentRows) wdEncargos[diaDeLaSemana(r.date)] += r.amount;
    const byWeekday = WEEKDAYS.map((d, i) => ({
      dia: d,
      mostrador: wdMostrador[i],
      encargos: wdEncargos[i],
    }));

    return {
      ventas,
      abonos,
      ingresos,
      gastos,
      gastosOperativos,
      utilidad,
      inversion,
      // Ticket promedio SOLO de mostrador: las 25 filas del histórico son
      // semanas, no ventas, y dividir entre ellas inflaba el promedio.
      ticket: mostradorRows.length ? mostradorRows.reduce((s, r) => s + r.amount, 0) / mostradorRows.length : 0,
      numVentas: mostradorRows.length,
      // Para la nota al pie de los gráficos diarios: cuánto quedó afuera y por qué.
      historicoCount: historicoRows.length,
      historicoTotal,
      byDay,
      byKind,
      byResource,
      byWeekday,
    };
  }, [saleRows, expenseRows, paymentRows]);

  const hasData = saleRows.length > 0 || expenseRows.length > 0 || paymentRows.length > 0;
  const { data: recovery } = useEquipmentRecovery();
  // Caja y deuda son de TODA la historia: no dependen del filtro de fechas.
  const { data: caja } = useCash();

  // Punto de equilibrio: cuánto hay que vender al mes para cubrir los costos
  // fijos, dado el margen de contribución declarado (Configuración → Costos fijos).
  const fijosMensuales = fixedCostsTotal(settings?.fixedCosts ?? []);
  // La cuota se DERIVA de los préstamos abiertos: no se escribe en Configuración,
  // o el mismo número en dos lugares termina diciendo dos cosas.
  const { data: loans = [] } = useLoans();
  const niveles = breakEvenLevels({
    fixedMonthly: fijosMensuales,
    marginPct: settings?.breakEvenMarginPct ?? 0,
    loanPayment: monthlyLoanPayments(paraEquilibrio(loans)),
    equipmentReserve: settings?.equipmentReserve ?? 0,
  });
  const breakEven = niveles.survive;

  // La meta del mes EN CURSO: el filtro de fechas del Dashboard puede estar en
  // cualquier rango, pero una meta mensual solo significa algo contra su mes.
  const mesEnCurso = currentMonthKey();
  const { data: meta } = useGoalForMonth(mesEnCurso);

  /**
   * INGRESOS DEL MES EN CURSO, aparte del filtro de arriba.
   *
   * ⚠️ El punto de equilibrio es MENSUAL (costos fijos del mes, cuota del mes,
   * reserva del mes) y hasta el 2026-10-02 se comparaba contra el rango elegido:
   * con "Todo" seleccionado la tarjeta decía que lo habías cumplido al 400 %,
   * que no significa nada. Es el mismo problema que Metas ya resolvió mirando
   * siempre el mes en curso, así que se resuelve igual.
   */
  const rangoDelMes = { from: `${mesEnCurso}-01`, to: `${mesEnCurso}-31` };
  const ventasDelMes = useSales(rangoDelMes);
  const abonosDelMes = useOrderPayments(rangoDelMes);
  const ingresosDelMes =
    (ventasDelMes.data ?? []).reduce((s, r) => s + r.amount, 0) +
    (abonosDelMes.data ?? []).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Ventas, gastos y resultado de caja de tu taller.</p>
          </div>
        </div>
        <DateRangePicker range={range} />
      </div>

      <OnboardingChecklist />
      <ProfitabilityAlert />
      <CampaignAlert />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Ventas"
          value={<NumberTicker value={agg.ventas} format={money} />}
          accent="yellow"
          sub={`${agg.numVentas} de mostrador`}
        />
        <Stat
          label="Cobrado de encargos"
          value={<NumberTicker value={agg.abonos} format={money} />}
          sub={moneyAlt ? `≈ ${moneyAlt(agg.abonos)}` : 'abonos del periodo'}
        />
        <Stat
          label="Gastos"
          value={<NumberTicker value={agg.gastosOperativos} format={money} />}
          sub={
            agg.inversion > 0
              ? `+ ${money(agg.inversion)} de inversión en equipos`
              : moneyAlt
                ? `≈ ${moneyAlt(agg.gastosOperativos)}`
                : 'filamento + generales'
          }
        />
        {/* ⚠️ NO es "utilidad" (2026-10-02). Incluye abonos de encargos que
            todavía no se entregaron, cuyo costo se va a registrar después: es
            un resultado de CAJA, no una ganancia contable. La cuenta no cambió
            —es la que sirve para saber si el mes alcanza— pero el nombre sí,
            porque decía algo que no era. */}
        <Stat
          label="Resultado de caja"
          value={<NumberTicker value={agg.utilidad} format={money} />}
          accent={agg.utilidad >= 0 ? 'success' : 'plain'}
          sub={
            moneyAlt
              ? `≈ ${moneyAlt(agg.utilidad)} · cobrado − gastos operativos`
              : 'cobrado (ventas + abonos) − gastos operativos'
          }
        />
      </div>

      {caja && (
        <Link
          to="/cash"
          aria-label="Ver la caja"
          className="grid grid-cols-2 gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-4"
        >
          <Stat
            label="Saldo en caja"
            value={money(caja.balance.balance)}
            sub={
              // La lista viene por fecha descendente: la primera confirmada en
              // contra es la más reciente.
              caja.reconciliations.find((c) => c.status === 'CONFIRMED' && c.kind === 'SHORT')
                ? 'la última conciliación dio de MENOS'
                : 'lo que es del negocio en la cuenta'
            }
            accent="blue"
          />
          <Stat
            label={`Le debe a ${caja.counterparty.name}`}
            value={money(caja.financing.owedToOwner)}
          />
          <Stat label="Le debe al prestamista" value={money(caja.financing.owedToLender)} />
          <Stat
            label="Total por devolver"
            value={money(caja.financing.totalOwed)}
            sub="detalle en Caja"
          />
        </Link>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <TableSkeleton rows={4} cols={2} />
          </Card>
          <Card>
            <TableSkeleton rows={4} cols={2} />
          </Card>
        </div>
      ) : !hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-blue/15 text-brand-blue-bright ring-1 ring-inset ring-brand-blue/30">
              <LineIcon className="h-6 w-6" />
            </span>
            <p className="text-sm text-muted-foreground">
              Sin datos en este periodo. Registra ventas y gastos para ver tus estadísticas.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {breakEven != null && fijosMensuales > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Punto de equilibrio del mes</CardTitle>
                <span className="text-sm text-muted-foreground">
                  Ingresos cobrados este mes: {money(ingresosDelMes)}
                </span>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    titulo: 'No perder dinero',
                    meta: niveles.survive,
                    detalle: `Cubre ${money(fijosMensuales)} de costos fijos al mes.`,
                  },
                  {
                    titulo: 'Además pagar la cuota',
                    meta: niveles.withDebt,
                    detalle: `Suma ${money(monthlyLoanPayments(paraEquilibrio(loans)))} de préstamos al mes.`,
                    oculto: monthlyLoanPayments(paraEquilibrio(loans)) <= 0,
                  },
                  {
                    titulo: 'Además reservar para equipos',
                    meta: niveles.withReserve,
                    detalle: `Aparta ${money(settings?.equipmentReserve ?? 0)} al mes para reponerlos.`,
                    oculto: (settings?.equipmentReserve ?? 0) <= 0,
                  },
                ]
                  .filter((n) => !n.oculto && n.meta != null)
                  .map((n, i) => {
                    // Los INGRESOS DEL MES EN CURSO (ventas + abonos), no los
                    // del rango elegido: los niveles son mensuales. Y los abonos
                    // cuentan porque también pagan los costos fijos — con solo
                    // las ventas de mostrador, esta tarjeta y la de Metas decían
                    // números distintos para lo mismo ($5,00 contra $68,50).
                    const pct = breakEvenProgress(ingresosDelMes, n.meta) ?? 0;
                    const logrado = ingresosDelMes >= n.meta!;
                    return (
                      <div key={n.titulo}>
                        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                          <span className="font-medium">
                            <span className="mr-1.5 text-muted-foreground">{i + 1}.</span>
                            {n.titulo}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {money(n.meta!)} al mes · {(pct * 100).toFixed(0)} %
                          </span>
                        </div>
                        <ProgressBar value={pct} tone={logrado ? 'success' : 'gold'} />
                        <p className="mt-1 text-xs text-muted-foreground">{n.detalle}</p>
                      </div>
                    );
                  })}
                <p className="text-xs text-muted-foreground">
                  Con {Math.round((settings?.breakEvenMarginPct ?? 0) * 100)} % de margen de
                  contribución. Los tres números son MENSUALES, así que esta tarjeta mira
                  siempre el mes en curso y no cambia con el filtro de arriba.
                </p>
              </CardContent>
            </Card>
          )}

          {meta && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Meta de este mes</CardTitle>
                <Link to="/goals" className="text-sm text-brand-yellow-ink hover:underline">
                  Ver todas
                </Link>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                {[
                  { t: 'Ventas', real: money(meta.sales), meta: money(meta.salesTarget), p: meta.salesProgress },
                  { t: 'Encargos', real: String(meta.orders), meta: String(meta.ordersTarget), p: meta.ordersProgress },
                  { t: 'Clientes nuevos', real: String(meta.newClients), meta: String(meta.newClientsTarget), p: meta.newClientsProgress },
                ].map((r) => (
                  <div key={r.t}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{r.t}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {r.real} de {r.meta}
                        {r.p != null && ` · ${(r.p * 100).toFixed(0)} %`}
                      </span>
                    </div>
                    <ProgressBar value={r.p ?? 0} tone={r.p != null && r.p >= 1 ? 'success' : 'gold'} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {recovery && recovery.rows.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle>Reposición de los equipos</CardTitle>
                <span className="text-sm text-muted-foreground">
                  {money(recovery.totalRecovered)} de {money(recovery.totalCost)}
                </span>
              </CardHeader>
              <CardContent className="space-y-4">
                {recovery.rows.map((e) => (
                  <div key={e.name}>
                    <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{e.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {money(e.recovered)} de {money(e.cost)} · faltan {money(e.missing)}
                      </span>
                    </div>
                    <ProgressBar value={e.progress} tone={e.progress >= 1 ? 'success' : 'gold'} />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Las impresoras no son gasto: son inversión que el negocio devuelve con su
                  ganancia. Acumulado de toda la historia ({money(recovery.income)} de ingresos
                  menos {money(recovery.operatingExpenses)} de gastos operativos), sin contar la
                  compra de los equipos ni los pagos del préstamo.{' '}
                  {recovery.accumulatedProfit < 0 && (
                    <strong className="text-destructive">
                      Hoy la ganancia acumulada es {money(recovery.accumulatedProfit)}: hasta que
                      no sea positiva, no hay con qué reponer.
                    </strong>
                  )}
                </p>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">Gráficos</h2>
            {/* UN solo selector para toda la sección: con un control por gráfico
                se puede terminar comparando dos tarjetas filtradas distinto. */}
            <Select
              className="w-full sm:w-48"
              aria-label="Canal de los gráficos"
              value={canal}
              onChange={(e) => setCanal(e.target.value as Canal)}
            >
              <option value="ALL">Canal: todos</option>
              <option value="COUNTER">Solo mostrador</option>
              <option value="ORDERS">Solo encargos</option>
            </Select>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Ingresos por día">
              <BarChart data={agg.byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={40} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} cursor={{ fill: 'hsl(var(--accent) / 0.4)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {verCanal('COUNTER') && (
                  <Bar dataKey="mostrador" name="Mostrador" stackId="canal" fill={GOLD} radius={verCanal('ORDERS') ? undefined : [4, 4, 0, 0]} />
                )}
                {verCanal('ORDERS') && (
                  <Bar dataKey="encargos" name="Encargos" stackId="canal" fill={BLUE} radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ChartCard>

            <ChartCard title="Mostrador vs encargo">
              <PieChart>
                <Pie data={agg.byKind} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {agg.byKind.map((entry) => (
                    // Se colorea por la CLAVE (`kind`), no por el texto visible.
                    // Comparaba contra 'Encargo' y la etiqueta pasó a ser
                    // 'Encargo anterior' el 2026-09-14: la condición dejó de
                    // dar verdadera y la dona salía toda azul, sin fallar ni
                    // avisar. El texto cambia cuando cambia el negocio; la
                    // clave no.
                    <Cell key={entry.kind} fill={entry.kind === 'ENCARGO' ? GOLD : BLUE} stroke="hsl(var(--card))" />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ChartCard>

            <ChartCard title="Gasto por tipo de recurso">
              <BarChart data={agg.byResource} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="category" dataKey="recurso" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={90} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} cursor={{ fill: 'hsl(var(--accent) / 0.4)' }} />
                <Bar dataKey="gasto" fill={BLUE} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard
              title="Ingresos por día de la semana"
              footnote={
                agg.historicoCount > 0
                  ? `No incluye ${agg.historicoCount} registro(s) del Excel (${money(agg.historicoTotal)}): son totales SEMANALES fechados todos el lunes, no ventas de un día.`
                  : undefined
              }
            >
              <BarChart data={agg.byWeekday}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={40} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} cursor={{ fill: 'hsl(var(--accent) / 0.4)' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {verCanal('COUNTER') && (
                  <Bar dataKey="mostrador" name="Mostrador" stackId="canal" fill={GOLD} radius={verCanal('ORDERS') ? undefined : [4, 4, 0, 0]} />
                )}
                {verCanal('ORDERS') && (
                  <Bar dataKey="encargos" name="Encargos" stackId="canal" fill={BLUE} radius={[4, 4, 0, 0]} />
                )}
              </BarChart>
            </ChartCard>
          </div>
        </>
      )}

      {/* Vista ANUAL: tiene su propio selector de año y NO responde al filtro
          de arriba, igual que Metas, el punto de equilibrio y Reposición. */}
      <AnnualIncome />
    </div>
  );
}

/** Aviso proactivo: productos cuyo margen cayó por debajo del mínimo (devaluación). */
function ProfitabilityAlert() {
  const { data: products } = useStoreProducts();
  const alerts = storeProductsBelowMargin(products);
  if (alerts.length === 0) return null;
  return (
    <Link
      to="/store"
      className="flex items-center gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 transition-colors hover:bg-amber-500/15"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1 text-sm">
        <span className="font-semibold text-amber-600 dark:text-amber-400">
          {alerts.length} {alerts.length === 1 ? 'producto ya no da' : 'productos ya no dan'} el margen esperado.
        </span>{' '}
        <span className="text-muted-foreground">
          Los costos subieron: {alerts.slice(0, 3).map((p) => p.name).join(', ')}
          {alerts.length > 3 ? '…' : ''}. Revísalos y ajusta precios.
        </span>
      </div>
    </Link>
  );
}

/**
 * Aviso proactivo: campañas en pérdida o en riesgo (la publicidad no rinde).
 *
 * ⚠️ Solo las VIGENTES. Hasta el 2026-10-02 avisaba de campañas terminadas el
 * 23/09 pidiendo "revisalas antes de seguir invirtiendo": una orden imposible
 * de cumplir sobre algo que ya cerró. Pedir una acción que no se puede hacer es
 * peor que no avisar — enseña a ignorar el aviso.
 */
function CampaignAlert() {
  const { data: campaigns } = useCampaigns();
  const alerts = (campaigns ?? []).filter((c) => {
    if (!isCampaignVigente(c)) return false;
    const h = campaignHealth(c.stats);
    return c.stats.invested > 0 && (h === 'LOSS' || h === 'AT_RISK');
  });
  if (alerts.length === 0) return null;
  return (
    <Link
      to="/campaigns"
      className="flex items-center gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 transition-colors hover:bg-amber-500/15"
    >
      <Megaphone className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1 text-sm">
        <span className="font-semibold text-amber-600 dark:text-amber-400">
          {alerts.length} {alerts.length === 1 ? 'campaña no está rindiendo' : 'campañas no están rindiendo'}.
        </span>{' '}
        <span className="text-muted-foreground">
          Gastas más de lo que dejan: {alerts.slice(0, 3).map((c) => c.name).join(', ')}
          {alerts.length > 3 ? '…' : ''}. Revísalas antes de seguir invirtiendo.
        </span>
      </div>
    </Link>
  );
}

function ChartCard({
  title,
  footnote,
  children,
}: {
  title: string;
  /** Qué quedó FUERA del gráfico y por qué. Un dato excluido en silencio es peor que uno mal dibujado. */
  footnote?: string;
  children: React.ReactElement;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        </div>
        {footnote && <p className="mt-2 text-xs text-muted-foreground">{footnote}</p>}
      </CardContent>
    </Card>
  );
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/**
 * INGRESOS POR MES — la tabla "Ingresos por mes" del Excel del dueño, con el
 * año como filtro propio.
 *
 * ⚠️ Esta tarjeta NO responde al filtro de fechas de arriba: un año es su
 * propia pregunta. Es la misma regla que ya siguen Metas y el punto de
 * equilibrio (que miran el mes en curso) y Reposición de equipos (toda la
 * historia), por eso va al final y bajo un título que lo anuncia.
 *
 * Acá el histórico semanal del Excel SÍ cuenta: una semana cae dentro de un
 * mes, así que a esta granularidad el dato es válido (a diferencia de los
 * gráficos por día, donde todas esas filas caen falsamente en lunes).
 */
function AnnualIncome() {
  const { money } = useMoney();
  const anioActual = new Date().getFullYear();
  const mesActual = new Date().getMonth(); // 0..11, en día LOCAL
  const [anio, setAnio] = usePersistentState<number>('dashboard:anio', anioActual);
  const [orden, setOrden] = usePersistentState<'MES' | 'MONTO'>('dashboard:anio:orden', 'MES');

  const rango = { from: `${anio}-01-01`, to: `${anio}-12-31` };
  const sales = useSales(rango);
  const payments = useOrderPayments(rango);
  // Para saber qué años ofrecer hace falta mirar TODA la historia, no el año elegido.
  const todasLasVentas = useSales({ from: undefined, to: undefined });

  const anios = React.useMemo(() => {
    const set = new Set<number>([anioActual]);
    for (const v of todasLasVentas.data ?? []) set.add(Number(v.date.slice(0, 4)));
    return [...set].sort((a, b) => b - a);
  }, [todasLasVentas.data, anioActual]);

  const filas = React.useMemo(() => {
    const mostrador = Array(12).fill(0) as number[];
    const encargos = Array(12).fill(0) as number[];
    for (const v of sales.data ?? []) mostrador[Number(v.date.slice(5, 7)) - 1] += v.amount;
    for (const pago of payments.data ?? []) encargos[Number(pago.date.slice(5, 7)) - 1] += pago.amount;
    return MESES.map((mes, i) => ({
      mes,
      indice: i,
      mostrador: mostrador[i],
      encargos: encargos[i],
      total: mostrador[i] + encargos[i],
    }));
  }, [sales.data, payments.data]);

  const total = filas.reduce((s, f) => s + f.total, 0);
  const ordenadas = orden === 'MES' ? filas : [...filas].sort((a, b) => b.total - a.total);

  /**
   * El gráfico se corta en el mes ACTUAL. Dibujar noviembre y diciembre en $0
   * hace que la línea se desplome y se lea como un derrumbe del negocio, cuando
   * en realidad esos meses todavía no pasaron. En la TABLA sí se listan los 12
   * (decisión del dueño): ahí un 0 se entiende, en una línea no.
   */
  const datosGrafico = anio === anioActual ? filas.slice(0, mesActual + 1) : filas;

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Ingresos por mes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Año completo, independiente del filtro de arriba. Total {anio}: {money(total)}.
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Select
            className="w-full sm:w-28"
            aria-label="Año"
            value={String(anio)}
            onChange={(e) => setAnio(Number(e.target.value))}
          >
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Select
            className="w-full sm:w-40"
            aria-label="Orden de los meses"
            value={orden}
            onChange={(e) => setOrden(e.target.value as 'MES' | 'MONTO')}
          >
            <option value="MES">Orden: por mes</option>
            <option value="MONTO">Orden: mayor a menor</option>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2">
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={datosGrafico}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(m: string) => m.slice(0, 3)}
              />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={40} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} cursor={{ fill: 'hsl(var(--accent) / 0.4)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="mostrador" name="Mostrador" stackId="canal" fill={GOLD} />
              <Bar dataKey="encargos" name="Encargos" stackId="canal" fill={BLUE} radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="total" name="Total" stroke={GREEN} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 font-semibold">Mes</th>
                <th className="py-2 text-right font-semibold">Ingresos</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((f) => {
                const futuro = anio === anioActual && f.indice > mesActual;
                return (
                  <tr key={f.mes} className="border-b border-border/70 last:border-0">
                    <td className={cn('py-1.5', futuro && 'text-muted-foreground/60')}>
                      {f.mes}
                      {futuro && <span className="ml-1.5 text-xs">(no llegó)</span>}
                    </td>
                    <td className={cn('py-1.5 text-right tabular', f.total === 0 && 'text-muted-foreground')}>
                      {money(f.total)}
                    </td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular">{money(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
