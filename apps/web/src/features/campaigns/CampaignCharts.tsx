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
  /** El nombre corto que entra en el eje. */
  name: string;
  /** El nombre entero, para el tooltip. */
  fullName: string;
  Invertido: number;
  Vendido: number;
}

const tick = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };

/**
 * Barras HORIZONTALES: el nombre va a la izquierda, derecho y en su propio renglón.
 * En vertical los nombres se inclinaban y se encimaban en un teléfono. El alto
 * crece con la cantidad de filas en vez de apretarlas en un alto fijo.
 */
function Bars({ data, money }: { data: Datum[]; money: (n: number) => string }) {
  const alto = Math.max(160, data.length * 44 + 56);
  return (
    <div style={{ height: alto }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" tick={tick} />
          <YAxis
            type="category"
            dataKey="name"
            width={112}
            interval={0}
            // Tick propio en UN renglón: el de Recharts parte el texto al ancho del
            // eje y dejaba "Materializa tu / …" en dos líneas.
            tick={(props) => (
              <text x={props.x} y={props.y} dy={4} textAnchor="end" fontSize={tick.fontSize} fill={tick.fill}>
                {String(props.payload?.value ?? '')}
              </text>
            )}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v) => money(Number(v))}
            labelFormatter={(_label, payload) => (payload?.[0]?.payload as Datum | undefined)?.fullName ?? _label}
            cursor={{ fill: 'hsl(var(--accent) / 0.4)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Invertido" fill={GOLD} radius={[0, 4, 4, 0]} barSize={12} />
          <Bar dataKey="Vendido" fill={GREEN} radius={[0, 4, 4, 0]} barSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Nombre corto para el eje: entra en ~112 px a 11 px. */
const corto = (s: string) => (s.length > 16 ? `${s.slice(0, 15)}…` : s);

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
      name: corto(c.name),
      fullName: c.name,
      Invertido: c.stats.invested,
      Vendido: c.stats.revenue,
    }));

  const platMap = new Map<string, Datum>();
  for (const c of campaigns) {
    const k = PLATFORM_LABELS[c.platform];
    const e = platMap.get(k) ?? { name: corto(k), fullName: k, Invertido: 0, Vendido: 0 };
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
        <CardContent>
          <Bars data={byCampaign} money={money} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Por plataforma</CardTitle>
        </CardHeader>
        <CardContent>
          <Bars data={byPlatform} money={money} />
        </CardContent>
      </Card>
    </div>
  );
}
