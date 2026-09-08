import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import { useLoans } from '@/features/loans/api';
import { useGoalForMonth } from '@/features/goals/api';
import { useEquipmentRecovery } from '@/features/equipment/api';
import { currentMonthKey } from '@/lib/today';
import { Card, CardContent, CardHeader, CardTitle, ProgressBar, Stat, TableSkeleton } from '@/components/ui';
import { NumberTicker } from '@/components/effects';
import { useMoney, useSettings } from '@/features/settings/useSettings';
import { useOrderPayments } from '@/features/orders/api';
import { useProducts, productsBelowMargin } from '@/features/products/api';
import { useCampaigns } from '@/features/campaigns/api';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { DateRangePicker, useDateRange } from '@/features/finance/DateRange';
import {
  LINK_KIND_LABELS,
  SALE_KIND_LABELS,
  expenseLink,
  useExpenses,
  useSales,
} from '@/features/finance/api';

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
  const sales = useSales(range);
  const expenses = useExpenses(range);
  const payments = useOrderPayments(range);

  const loading = sales.isLoading || expenses.isLoading;
  const saleRows = sales.data ?? [];
  const expenseRows = expenses.data ?? [];
  const paymentRows = payments.data ?? [];

  const agg = React.useMemo(() => {
    const ventas = saleRows.reduce((s, r) => s + r.amount, 0);
    // Abonos de pedidos: dinero que entra por encargos, flujo SEPARADO de las
    // ventas mostrador (no se genera un Sale por abono, así no hay doble conteo).
    const abonos = paymentRows.reduce((s, r) => s + r.amount, 0);
    const ingresos = ventas + abonos;
    const gastos = expenseRows.reduce((s, r) => s + r.amount, 0);
    const utilidad = ingresos - gastos;
    const inversion = expenseRows.filter((e) => e.isInvestment).reduce((s, r) => s + r.amount, 0);

    // Ingresos por día (ventas + abonos), asc
    const byDayMap = new Map<string, number>();
    for (const r of saleRows) {
      const d = r.date.slice(0, 10);
      byDayMap.set(d, (byDayMap.get(d) ?? 0) + r.amount);
    }
    for (const r of paymentRows) {
      const d = r.date.slice(0, 10);
      byDayMap.set(d, (byDayMap.get(d) ?? 0) + r.amount);
    }
    const byDay = [...byDayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, v]) => ({ label: `${d.slice(8, 10)}/${d.slice(5, 7)}`, ventas: v }));

    // Mostrador vs Encargo
    const kindMap = new Map<string, number>();
    for (const r of saleRows) kindMap.set(r.kind, (kindMap.get(r.kind) ?? 0) + r.amount);
    const byKind = [...kindMap.entries()].map(([k, v]) => ({
      name: SALE_KIND_LABELS[k as 'COUNTER' | 'ENCARGO'],
      value: v,
    }));

    // Gasto por tipo de recurso (Filamento/Impresora/Componente/Empaque/General)
    const resMap = new Map<string, number>();
    for (const r of expenseRows) {
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
    const wd = Array(7).fill(0) as number[];
    for (const r of saleRows) {
      const [y, m, d] = r.date.slice(0, 10).split('-').map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dom..6=Sáb
      const idx = (dow + 6) % 7; // lunes = 0
      wd[idx] += r.amount;
    }
    const byWeekday = WEEKDAYS.map((d, i) => ({ dia: d, ventas: wd[i] }));

    return {
      ventas,
      abonos,
      ingresos,
      gastos,
      utilidad,
      inversion,
      ticket: saleRows.length ? ventas / saleRows.length : 0,
      numVentas: saleRows.length,
      byDay,
      byKind,
      byResource,
      byWeekday,
    };
  }, [saleRows, expenseRows, paymentRows]);

  const hasData = saleRows.length > 0 || expenseRows.length > 0 || paymentRows.length > 0;
  const { data: recovery } = useEquipmentRecovery();

  // Punto de equilibrio: cuánto hay que vender al mes para cubrir los costos
  // fijos, dado el margen de contribución declarado (Configuración → Costos fijos).
  const fijosMensuales = fixedCostsTotal(settings?.fixedCosts ?? []);
  // La cuota se DERIVA de los préstamos abiertos: no se escribe en Configuración,
  // o el mismo número en dos lugares termina diciendo dos cosas.
  const { data: loans = [] } = useLoans();
  const niveles = breakEvenLevels({
    fixedMonthly: fijosMensuales,
    marginPct: settings?.breakEvenMarginPct ?? 0,
    loanPayment: monthlyLoanPayments(loans),
    equipmentReserve: settings?.equipmentReserve ?? 0,
  });
  const breakEven = niveles.survive;

  // La meta del mes EN CURSO: el filtro de fechas del Dashboard puede estar en
  // cualquier rango, pero una meta mensual solo significa algo contra su mes.
  const mesEnCurso = currentMonthKey();
  const { data: meta } = useGoalForMonth(mesEnCurso);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Ventas, gastos y utilidad de tu taller.</p>
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
          sub={`${agg.numVentas} mostrador/encargo`}
        />
        <Stat
          label="Abonos de pedidos"
          value={<NumberTicker value={agg.abonos} format={money} />}
          sub={moneyAlt ? `≈ ${moneyAlt(agg.abonos)}` : 'dinero de encargos'}
        />
        <Stat
          label="Gastos"
          value={<NumberTicker value={agg.gastos} format={money} />}
          sub={moneyAlt ? `≈ ${moneyAlt(agg.gastos)}` : 'filamento + generales'}
        />
        <Stat
          label="Utilidad"
          value={<NumberTicker value={agg.utilidad} format={money} />}
          accent={agg.utilidad >= 0 ? 'success' : 'plain'}
          sub={moneyAlt ? `≈ ${moneyAlt(agg.utilidad)} · ingresos − gastos` : 'ventas + abonos − gastos'}
        />
      </div>

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
                <CardTitle>Punto de equilibrio</CardTitle>
                <span className="text-sm text-muted-foreground">
                  Vendiste {money(agg.ingresos)} este periodo
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
                    detalle: `Suma ${money(monthlyLoanPayments(loans))} de préstamos al mes.`,
                    oculto: monthlyLoanPayments(loans) <= 0,
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
                    // INGRESOS, no solo las ventas de mostrador: los abonos de
                    // pedidos también pagan los costos fijos, y la tarjeta de Metas
                    // de acá abajo ya los cuenta. Con `ventas` las dos se
                    // contradecían en la misma pantalla ($5,00 contra $68,50).
                    const pct = breakEvenProgress(agg.ingresos, n.meta) ?? 0;
                    const logrado = agg.ingresos >= n.meta!;
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
                  contribución. Compará con el rango “Mes”: los tres números son mensuales.
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

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Ingresos por día">
              <BarChart data={agg.byDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={40} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} cursor={{ fill: 'hsl(var(--accent) / 0.4)' }} />
                <Bar dataKey="ventas" fill={GOLD} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Mostrador vs encargo">
              <PieChart>
                <Pie data={agg.byKind} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {agg.byKind.map((entry, i) => (
                    <Cell key={i} fill={entry.name === 'Encargo' ? GOLD : BLUE} stroke="hsl(var(--card))" />
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

            <ChartCard title="Ventas por día de la semana">
              <BarChart data={agg.byWeekday}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={40} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} cursor={{ fill: 'hsl(var(--accent) / 0.4)' }} />
                <Bar dataKey="ventas" fill={GREEN} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

/** Aviso proactivo: productos cuyo margen cayó por debajo del mínimo (devaluación). */
function ProfitabilityAlert() {
  const { data: products } = useProducts();
  const alerts = productsBelowMargin(products);
  if (alerts.length === 0) return null;
  return (
    <Link
      to="/products"
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

/** Aviso proactivo: campañas en pérdida o en riesgo (la publicidad no rinde). */
function CampaignAlert() {
  const { data: campaigns } = useCampaigns();
  const alerts = (campaigns ?? []).filter((c) => {
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

function ChartCard({ title, children }: { title: string; children: React.ReactElement }) {
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
      </CardContent>
    </Card>
  );
}
