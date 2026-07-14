import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, TrendingUp, PauseCircle, Search, CheckCircle2, Clock } from 'lucide-react';
import {
  roas,
  roi,
  costPer,
  netAfterAds,
  campaignHealth,
  campaignRecommendation,
  type CampaignAction,
  type CampaignHealth,
} from '@calc3d/shared';
import { useMoney } from '@/features/settings/useSettings';
import {
  useCampaign,
  CAMPAIGN_STATUS,
  PLATFORM_LABELS,
  OBJECTIVE_LABELS,
} from '@/features/campaigns/api';
import { apiErrorMessage, downloadFile } from '@/lib/api';
import { notify } from '@/components/toast';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, PageSkeleton, Stat } from '@/components/ui';

const HEALTH: Record<CampaignHealth, { label: string; variant: 'success' | 'warning' | 'outline'; note: string }> = {
  PROFITABLE: { label: 'Rentable', variant: 'success', note: 'La ganancia supera lo invertido en publicidad.' },
  AT_RISK: { label: 'En riesgo', variant: 'warning', note: 'Vendió, pero la ganancia no cubre la publicidad.' },
  LOSS: { label: 'Pérdida', variant: 'outline', note: 'La publicidad cuesta más de lo que deja.' },
  NO_DATA: { label: 'Sin datos', variant: 'outline', note: 'Aún no hay ventas ni pedidos atribuidos.' },
};

/** Estilo del banner de recomendación por acción sugerida. */
const REC_META: Record<CampaignAction, { icon: typeof TrendingUp; classes: string; iconClass: string }> = {
  SCALE: { icon: TrendingUp, classes: 'border-success/50 bg-success/10', iconClass: 'text-success' },
  KEEP: { icon: CheckCircle2, classes: 'border-success/40 bg-success/5', iconClass: 'text-success' },
  REVIEW: { icon: Search, classes: 'border-amber-500/50 bg-amber-500/10', iconClass: 'text-amber-600 dark:text-amber-400' },
  PAUSE: { icon: PauseCircle, classes: 'border-destructive/50 bg-destructive/10', iconClass: 'text-destructive' },
  WAIT: { icon: Clock, classes: 'border-border bg-background/30', iconClass: 'text-muted-foreground' },
};

const fmtRoas = (r: number | null) => (r == null ? '—' : `${r.toLocaleString('es-VE', { maximumFractionDigits: 2 })}×`);
const fmtPct = (r: number | null) =>
  r == null ? '—' : `${(r * 100).toLocaleString('es-VE', { maximumFractionDigits: 0 })}%`;

export function CampaignDetailPage() {
  const { id = '' } = useParams();
  const { money } = useMoney();
  const { data: c, isLoading } = useCampaign(id);

  if (isLoading || !c) return <PageSkeleton />;

  const s = c.stats;
  const health = campaignHealth(s);
  const h = HEALTH[health];
  const net = netAfterAds(s.profit, s.invested);
  const rec = campaignRecommendation(s);
  const recMeta = REC_META[rec.action];
  const RecIcon = recMeta.icon;

  return (
    <div className="space-y-5">
      <Link to="/campaigns" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Publicidad
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-9 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">{c.name}</h1>
            <p className="text-sm text-muted-foreground">
              {PLATFORM_LABELS[c.platform]} · <span className={CAMPAIGN_STATUS[c.status].tone}>{CAMPAIGN_STATUS[c.status].label}</span>
              {c.objective ? ` · ${OBJECTIVE_LABELS[c.objective]}` : ''}
              {' · '}
              {new Date(c.startDate).toLocaleDateString('es-VE')}
              {c.endDate ? ` → ${new Date(c.endDate).toLocaleDateString('es-VE')}` : ' → en curso'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={h.variant} className="text-sm">
            {h.label}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadFile(`/campaigns/${c.id}/report.pdf`, `calc3d-${c.name}.pdf`).catch((e) =>
                notify.error(apiErrorMessage(e)),
              )
            }
          >
            <Download className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <p className="rounded-lg border border-border bg-background/30 px-4 py-2 text-sm text-muted-foreground">
        {h.note}
      </p>

      {/* Recomendación automática (Fase 3) */}
      <div className={`flex items-start gap-3 rounded-xl border p-4 ${recMeta.classes}`}>
        <RecIcon className={`mt-0.5 h-5 w-5 shrink-0 ${recMeta.iconClass}`} />
        <div className="text-sm">
          <span className="font-semibold">Recomendación: {rec.title}.</span>{' '}
          <span className="text-muted-foreground">{rec.reason}</span>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Invertido" value={money(s.invested)} accent="yellow" sub={c.budget != null ? `de ${money(c.budget)} presup.` : undefined} />
        <Stat label="Vendido (atribuido)" value={money(s.revenue)} accent="success" sub={`${s.sales} venta${s.sales === 1 ? '' : 's'}`} />
        <Stat label="ROAS" value={fmtRoas(roas(s.revenue, s.invested))} sub="ingresos ÷ inversión" />
        <Stat
          label="Ganancia atribuida"
          value={s.hasCost ? money(s.profit) : '—'}
          accent={s.hasCost && s.profit > 0 ? 'success' : undefined}
          sub={s.hasCost ? 'solo ventas con costo' : 'sin costo conocido'}
        />
      </div>

      {/* Detalle */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rendimiento</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2.5 text-sm tabular">
              <Row label="Total invertido" value={money(s.invested)} />
              <Row label="Total vendido" value={money(s.revenue)} strong />
              <Row label="ROAS (retorno sobre inversión publicitaria)" value={fmtRoas(roas(s.revenue, s.invested))} />
              <Row
                label="ROI"
                value={s.hasCost ? fmtPct(roi(s.profit, s.invested)) : '—'}
                hint={s.hasCost ? undefined : 'requiere costo de las ventas'}
              />
              <Row
                label="Margen neto después de publicidad"
                value={s.hasCost ? money(net) : '—'}
                strong
                positive={s.hasCost ? net >= 0 : undefined}
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Volumen y costo de captación</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2.5 text-sm tabular">
              <Row label="Ventas atribuidas" value={String(s.sales)} />
              <Row label="Ticket promedio" value={s.sales > 0 ? money(s.revenue / s.sales) : '—'} />
              <Row label="Pedidos atribuidos" value={`${s.orders}  (${money(s.ordersTotal)})`} />
              <Row label="Cotizaciones atribuidas" value={String(s.quotes)} />
              <Row label="Costo por pedido" value={costPer(s.invested, s.orders) == null ? '—' : money(costPer(s.invested, s.orders)!)} />
              <Row
                label="Costo por cotización"
                value={costPer(s.invested, s.quotes) == null ? '—' : money(costPer(s.invested, s.quotes)!)}
              />
            </dl>
          </CardContent>
        </Card>
      </div>

      {c.period && (
        <Card>
          <CardHeader>
            <CardTitle>Vista por período (estimación)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Todas las ventas del negocio <strong>dentro de las fechas</strong> de la campaña, sin importar la
              atribución. Es una referencia del efecto total mientras estuvo activa — no reemplaza los números
              atribuidos de arriba.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Ventas en el período" value={String(c.period.sales)} />
              <Stat label="Ingresos en el período" value={money(c.period.revenue)} />
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        La <strong>ganancia</strong> y el <strong>ROI</strong> solo se calculan con las ventas que traen costo
        (las que vienen de una cotización/producto). Las ventas de mostrador sueltas cuentan para ingresos y ROAS,
        pero no para ganancia. Para atribuir una venta o pedido a esta campaña, elige el origen al crearlos.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  hint,
  positive,
}: {
  label: string;
  value: string;
  strong?: boolean;
  hint?: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-xs opacity-70">({hint})</span>}
      </dt>
      <dd
        className={
          strong
            ? `font-display font-bold ${positive === true ? 'text-success' : positive === false ? 'text-destructive' : ''}`
            : 'font-medium'
        }
      >
        {value}
      </dd>
    </div>
  );
}
