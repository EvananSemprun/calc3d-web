import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { type FilamentGroup, groupPurchases } from '@calc3d/shared';
import { Card, CardContent, EmptyState, PageSkeleton, Stat } from '@/components/ui';
import { useMoney } from '@/features/settings/useSettings';
import { DateRangePicker, useDateRange } from '@/features/finance/DateRange';
import { useFilamentPurchases } from '@/features/filament/api';

/**
 * ANÁLISIS DE FILAMENTO — la parte de la hoja "Resumen" del Excel que mira las
 * compras: en qué marca se va el dinero y qué colores se compran más.
 *
 * Agrega sobre las MISMAS compras que muestra la pestaña de al lado (el helper
 * puro `groupPurchases` de shared), no sobre una consulta aparte: dos fuentes
 * para el mismo total terminan discrepando, y acá no se notaría.
 */
export function AnalysisTab() {
  const range = useDateRange('ALL', 'filament-analysis');
  const { money } = useMoney();
  const { data: compras = [], isLoading } = useFilamentPurchases(range);

  const marcas = useMemo(() => groupPurchases(compras, 'brand'), [compras]);
  const colores = useMemo(() => groupPurchases(compras, 'color'), [compras]);
  const tipos = useMemo(() => groupPurchases(compras, 'type'), [compras]);

  const rollos = compras.reduce((s, c) => s + c.quantity, 0);
  const invertido = compras.reduce((s, c) => s + c.amount, 0);

  if (isLoading) return <PageSkeleton />;

  if (compras.length === 0) {
    return (
      <div className="space-y-5">
        <DateRangePicker range={range} />
        <EmptyState
          icon={BarChart3}
          title="Todavía no hay nada que analizar"
          description="Las compras de filamento se registran desde Gastos, con el tipo «Filamento»."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <DateRangePicker range={range} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Rollos comprados" value={String(rollos)} />
        <Stat label="Invertido en filamento" value={money(invertido)} accent="yellow" />
        <Stat
          label="Marcas distintas"
          value={String(marcas.length)}
          sub={marcas[0] && `La que más comprás: ${marcas[0].key}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Marca: la tabla completa. Es donde se decide a quién comprarle. */}
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <h2 className="border-b border-border/70 p-4 font-display text-base font-bold">
              Rollos e inversión por marca
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="p-3 font-semibold">Marca</th>
                    <th className="p-3 text-right font-semibold">Rollos</th>
                    <th className="p-3 text-right font-semibold">Compras</th>
                    <th className="p-3 text-right font-semibold">Invertido</th>
                    <th className="p-3 text-right font-semibold">Por rollo</th>
                    <th className="w-40 p-3 font-semibold">Del total</th>
                  </tr>
                </thead>
                <tbody>
                  {marcas.map((m) => (
                    <tr key={m.key} className="border-b border-border/40 last:border-0">
                      <td className="p-3 font-medium">{m.key}</td>
                      <td className="p-3 text-right tabular-nums">{m.rolls}</td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {m.purchases}
                      </td>
                      <td className="p-3 text-right tabular-nums">{money(m.invested)}</td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {money(m.rolls > 0 ? m.invested / m.rolls : 0)}
                      </td>
                      <td className="p-3">
                        <ShareBar share={m.share} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <RankCard
          title="Colores más comprados"
          hint="Por rollos: es lo que se agota."
          groups={colores}
          money={money}
        />
        <RankCard title="Por material" hint="PLA, PETG y compañía." groups={tipos} money={money} />
      </div>
    </div>
  );
}

/** Lista corta ordenada por rollos, con la barra proporcional al primero. */
function RankCard({
  title,
  hint,
  groups,
  money,
}: {
  title: string;
  hint: string;
  groups: FilamentGroup[];
  money: (n: number) => string;
}) {
  const top = groups.slice(0, 10);
  const mayor = top[0]?.rolls ?? 0;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h2 className="font-display text-base font-bold">{title}</h2>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <ul className="space-y-3">
          {top.map((g) => (
            <li key={g.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{g.key}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {g.rolls} {g.rolls === 1 ? 'rollo' : 'rollos'} · {money(g.invested)}
                </span>
              </div>
              <ShareBar share={mayor > 0 ? g.rolls / mayor : 0} />
            </li>
          ))}
        </ul>
        {groups.length > top.length && (
          <p className="text-xs text-muted-foreground">
            Y {groups.length - top.length} más con menos rollos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Barra proporcional. Decorativa: el número siempre está al lado. */
function ShareBar({ share }: { share: number }) {
  return (
    <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-brand-blue/25">
      <div
        className="h-full rounded-full bg-brand-yellow"
        style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
      />
    </div>
  );
}
