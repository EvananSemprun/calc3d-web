import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { PLATFORM_LABELS, type Campaign } from './api';

const GOLD = '#FFC300';
const GREEN = '#22c55e';
const tooltipStyle = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 10,
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
};

interface Datum {
  name: string;
  Invertido: number;
  Vendido: number;
}

function Bars({ data, money }: { data: Datum[]; money: (n: number) => string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          interval={0}
          angle={-12}
          textAnchor="end"
          height={46}
        />
        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={44} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(Number(v))} cursor={{ fill: 'hsl(var(--accent) / 0.4)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Invertido" fill={GOLD} radius={[4, 4, 0, 0]} />
        <Bar dataKey="Vendido" fill={GREEN} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Comparador visual: inversión vs vendido por campaña y por plataforma. */
export function CampaignCharts({
  campaigns,
  money,
}: {
  campaigns: Campaign[];
  money: (n: number) => string;
}) {
  const byCampaign: Datum[] = [...campaigns]
    .filter((c) => c.stats.invested > 0 || c.stats.revenue > 0)
    .sort((a, b) => b.stats.revenue - a.stats.revenue)
    .slice(0, 8)
    .map((c) => ({
      name: c.name.length > 14 ? `${c.name.slice(0, 13)}…` : c.name,
      Invertido: c.stats.invested,
      Vendido: c.stats.revenue,
    }));

  const platMap = new Map<string, Datum>();
  for (const c of campaigns) {
    const k = PLATFORM_LABELS[c.platform];
    const e = platMap.get(k) ?? { name: k, Invertido: 0, Vendido: 0 };
    e.Invertido += c.stats.invested;
    e.Vendido += c.stats.revenue;
    platMap.set(k, e);
  }
  const byPlatform = [...platMap.values()].filter((e) => e.Invertido > 0 || e.Vendido > 0);

  if (byCampaign.length === 0) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Inversión vs vendido por campaña</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <Bars data={byCampaign} money={money} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Por plataforma</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <Bars data={byPlatform} money={money} />
        </CardContent>
      </Card>
    </div>
  );
}
