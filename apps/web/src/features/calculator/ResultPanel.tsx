import { useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import type { CalcResult, PriceResult } from '@calc3d/shared';
import { priceFinalPerUnit, priceJobTotal } from '@calc3d/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { BeamBorder, NumberTicker } from '@/components/effects';
import { useMoney } from '@/features/settings/useSettings';
import { cn } from '@/lib/utils';
import { ChargeEquivalentsCard } from './ChargeEquivalentsCard';

/** Formatea horas decimales como "44 h 05 min". */
function formatHM(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh} h ${String(mm).padStart(2, '0')} min`;
}

/** Las 3 opciones comerciales, con lenguaje de vendedor (no de finanzas). */
type TierKey = 'eco' | 'reco' | 'premium';
const TIER_META: Record<TierKey, { label: string; hint: string }> = {
  eco: { label: 'Económico', hint: 'Para cerrar rápido o clientes que cuidan el bolsillo.' },
  reco: { label: 'Recomendado', hint: 'El equilibrio entre ganar bien y vender fácil.' },
  premium: { label: 'Premium', hint: 'Trabajos exclusivos o urgentes: máxima ganancia.' },
};

/** Elige hasta 3 precios (menor / medio / mayor ganancia) de los márgenes configurados. */
function pickTiers(prices: PriceResult[]): { key: TierKey; price: PriceResult }[] {
  const s = [...prices].sort((a, b) => a.marginPct - b.marginPct);
  if (s.length === 0) return [];
  if (s.length === 1) return [{ key: 'reco', price: s[0] }];
  if (s.length === 2) return [
    { key: 'eco', price: s[0] },
    { key: 'premium', price: s[1] },
  ];
  const mid = Math.floor(s.length / 2);
  return [
    { key: 'eco', price: s[0] },
    { key: 'reco', price: s[mid] },
    { key: 'premium', price: s[s.length - 1] },
  ];
}

/**
 * Pantalla de resultados orientada a la DECISIÓN de venta: el precio a cobrar es
 * lo primero; el costo y el detalle técnico quedan como información secundaria.
 */
export function ResultPanel({
  result,
  selectedRate,
  onSelectRate,
  frozenRate,
}: {
  result: CalcResult;
  /** Ganancia elegida (fracción). Si no se pasa, se usa la "Recomendada" (la del medio). */
  selectedRate?: number | null;
  /** Si se pasa, las opciones son seleccionables como precio final. */
  onSelectRate?: (rate: number) => void;
  /**
   * Tasa CONGELADA para los equivalentes en Bs (documentos históricos).
   * `undefined` (cálculo en vivo) usa la tasa vigente; `null` (documento SIN
   * snapshot) suprime el equivalente.
   */
  frozenRate?: { rate: number; currencyCode: string } | null;
}) {
  const { money, percent, moneyAlt: liveAlt, moneyAtRate } = useMoney();
  const moneyAlt =
    frozenRate === undefined
      ? liveAlt
      : frozenRate
        ? (n: number) => moneyAtRate(n, frozenRate.rate, frozenRate.currencyCode)
        : null;
  const [showBreakdown, setShowBreakdown] = useState(false);

  const selectable = !!onSelectRate;
  const tiers = pickTiers(result.prices);
  const recoTier = tiers.find((t) => t.key === 'reco') ?? tiers[Math.floor(tiers.length / 2)] ?? tiers[0];
  // Precio elegido: el seleccionado por el usuario, o el "Recomendado" por defecto.
  const chosen =
    (selectedRate != null && result.prices.find((p) => p.marginPct === selectedRate)) ||
    recoTier?.price ||
    result.prices[0];
  const chosenTier = tiers.find((t) => t.price.marginPct === chosen?.marginPct) ?? recoTier;

  // Total a cobrar / precio por pieza / ganancia CON extras (diseño, urgencia, mínimo).
  const jobTotal = chosen ? priceJobTotal(chosen, result.quantity) : 0;
  const finalUnit = chosen
    ? chosen.hitMinimum
      ? jobTotal / result.quantity
      : priceFinalPerUnit(chosen)
    : 0;
  const hasExtras = !!chosen && (!!chosen.designPerUnit || !!chosen.rushAmount);
  const profitTotal = chosen ? jobTotal - result.costBatch : 0;
  const profitUnit = chosen ? finalUnit - result.costPerUnit : 0;

  const insumos = [...result.components, ...result.packaging];

  return (
    <div className="space-y-5">
      {/* ═══ 1 · PRECIO RECOMENDADO PARA COBRAR (lo más importante) ═══ */}
      {chosen && (
        <BeamBorder>
          <div className="relative overflow-hidden rounded-2xl glass p-5 sm:p-7">
            <span
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-brand-yellow/20 blur-3xl"
            />
            <div className="relative">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Precio recomendado para cobrar
                {chosenTier && (
                  <span className="rounded-full bg-brand-yellow/15 px-2 py-0.5 text-brand-yellow-ink ring-1 ring-brand-yellow/30">
                    {TIER_META[chosenTier.key].label}
                  </span>
                )}
              </div>

              <div className="mt-2 font-display text-4xl font-bold tabular text-brand-yellow-ink sm:text-6xl">
                <NumberTicker value={jobTotal} format={money} />
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Total a cobrar por {result.quantity} {result.quantity === 1 ? 'pieza' : 'piezas'}
                {moneyAlt && <span className="font-mono"> · ≈ {moneyAlt(jobTotal)}</span>}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-background/40 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Precio por pieza
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold tabular">{money(finalUnit)}</div>
                </div>
                <div className="rounded-xl border border-success/30 bg-success/[0.06] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Ganancia estimada
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold tabular text-success">
                    {money(profitTotal)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {money(profitUnit)} por pieza · {percent(chosen.marginPct, 0)} sobre el costo
                  </div>
                </div>
              </div>

              {(hasExtras || chosen.hitMinimum) && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {chosen.hitMinimum && 'Se aplicó el precio mínimo de pedido. '}
                  {hasExtras && (
                    <>
                      Incluye precio base {money(chosen.priceRounded)}
                      {chosen.designPerUnit ? ` + diseño ${money(chosen.designPerUnit)}/pieza` : ''}
                      {chosen.rushAmount ? ` + urgencia ${money(chosen.rushAmount)}/pieza` : ''}.
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        </BeamBorder>
      )}

      {/* ═══ 2 · TRES OPCIONES DE PRECIO ═══ */}
      {tiers.length > 0 && (
        <div>
          {selectable && (
            <p className="mb-2 text-sm text-muted-foreground">
              Elige el precio con el que vas a vender. Puedes cambiarlo cuando quieras.
            </p>
          )}
          <div className={cn('grid gap-3', tiers.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
            {tiers.map(({ key, price }) => {
              const isChosen = price.marginPct === chosen?.marginPct;
              const unit = priceFinalPerUnit(price);
              const total = priceJobTotal(price, result.quantity);
              const gan = total - result.costBatch;
              const isReco = key === 'reco';
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!selectable}
                  onClick={selectable ? () => onSelectRate?.(price.marginPct) : undefined}
                  className={cn(
                    'relative rounded-2xl border p-4 text-left transition-all',
                    selectable && 'hover:border-brand-yellow/60 hover:shadow-glow-sm',
                    isChosen
                      ? 'border-brand-yellow bg-brand-yellow/[0.06] shadow-glow-sm'
                      : 'border-border bg-background/40',
                    !selectable && 'cursor-default',
                  )}
                >
                  {isReco && (
                    <span className="absolute -top-2.5 right-3 rounded-full bg-brand-yellow px-2 py-0.5 text-[10px] font-bold text-brand-yellow-foreground">
                      Sugerido
                    </span>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="font-display text-base font-bold">{TIER_META[key].label}</span>
                    {isChosen ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-yellow-ink">
                        <Check className="h-3.5 w-3.5" /> Elegido
                      </span>
                    ) : (
                      selectable && <span className="text-xs text-muted-foreground">Elegir</span>
                    )}
                  </div>
                  <div className="mt-2 font-display text-2xl font-bold tabular">{money(unit)}</div>
                  <div className="text-xs text-muted-foreground">por pieza · {percent(price.marginPct, 0)} de ganancia</div>
                  <div className="mt-3 space-y-0.5 border-t border-border/70 pt-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total a cobrar</span>
                      <span className="tabular font-semibold">{money(total)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ganancia</span>
                      <span className="tabular font-semibold text-success">{money(gan)}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{TIER_META[key].hint}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ 2.5 · CÓMO COBRAR EN BOLÍVARES SIN PERDER MARGEN (en vivo) ═══ */}
      {chosen && frozenRate === undefined && (
        <ChargeEquivalentsCard orderUsd={jobTotal} unitUsd={finalUnit} />
      )}

      {/* ═══ 3 · COSTO (información secundaria) ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-xl border border-border bg-background/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          Costo de producir · <span className="font-semibold text-foreground">{money(result.costPerUnit)}</span> por pieza
        </span>
        <span className="text-muted-foreground">
          Costo de producir el pedido ·{' '}
          <span className="tabular font-semibold text-foreground">{money(result.costBatch)}</span>
          {moneyAlt && <span className="font-mono"> (≈ {moneyAlt(result.costBatch)})</span>}
        </span>
      </div>

      {/* ═══ 4 · PRECIOS POR CANTIDAD (mayoreo simplificado) ═══ */}
      {result.wholesale && result.wholesale.tiers.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Precios por cantidad</CardTitle>
            <p className="text-sm text-muted-foreground">
              Mientras más piezas, mejor precio por unidad. Precios calculados para {result.quantity} piezas.
            </p>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[460px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Desde cantidad</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Precio por unidad</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total a cobrar</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Ganancia estimada</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {result.wholesale.tiers.map((t, i) => {
                  const gan = Math.max(0, (t.unitPriceRounded - result.costPerUnit) * result.quantity);
                  return (
                    <tr
                      key={i}
                      className={cn(
                        'border-b border-border/70 last:border-0',
                        t.applies && 'bg-brand-blue/[0.06]',
                      )}
                    >
                      <td className="px-4 py-3">
                        {t.minQty}+ {t.applies && <span className="text-xs text-brand-yellow-ink">· aplica ahora</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-display font-bold">{money(t.unitPriceRounded)}</td>
                      <td className="px-4 py-3 text-right">{money(t.lotTotal)}</td>
                      <td className="px-4 py-3 text-right text-success">{money(gan)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ═══ 5 · PRODUCCIÓN POR TANDAS (se conserva) ═══ */}
      {result.production && (
        <Card>
          <CardHeader>
            <CardTitle>Producción por tandas</CardTitle>
            <p className="text-sm text-muted-foreground">
              Los gramos y el tiempo que ingresaste son los de <strong>una impresión</strong>. Esto es lo que
              realmente lleva todo el pedido.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <ProdCell label="Piezas por impresión" value={String(result.production.piecesPerBatch)} />
              <ProdCell label="Tandas necesarias" value={String(result.production.batches)} />
              <ProdCell
                label="Gramos totales reales"
                value={`${Math.round(result.production.totalGrams).toLocaleString('es-VE')} g`}
              />
              <ProdCell label="Tiempo total real" value={formatHM(result.production.totalHours)} />
              <ProdCell label="Costo por tanda" value={money(result.production.costPerBatch)} />
              <ProdCell label="Costo por pieza" value={money(result.production.costPerUnit)} accent />
            </div>
            {result.batches && result.batches.partialPieces > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                La última tanda es parcial ({result.batches.partialPieces} pzs). El costo se reparte por pieza
                según lo realmente producido.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ 6 · DETALLE DEL COSTO (colapsable, secundario) ═══ */}
      <div className="rounded-2xl border border-border bg-card/40">
        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          aria-expanded={showBreakdown}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <span className="font-display text-base font-bold">Ver desglose del costo</span>
          <ChevronDown
            className={cn('h-5 w-5 text-muted-foreground transition-transform', showBreakdown && 'rotate-180')}
          />
        </button>
        {showBreakdown && (
          <div className="space-y-5 border-t border-border px-5 py-5">
            <div>
              <p className="mb-3 text-sm text-muted-foreground">Detalle del costo del pedido completo.</p>
              <BreakdownBars
                total={result.costBatch}
                money={money}
                items={[
                  { label: 'Material', value: result.breakdown.material },
                  { label: 'Desgaste de impresora', value: result.breakdown.wear },
                  { label: 'Electricidad', value: result.breakdown.power },
                  { label: 'Insumos', value: result.breakdown.components + result.breakdown.packaging },
                  { label: 'Mano de obra', value: result.breakdown.labor },
                  ...((result.breakdown.setup ?? 0) > 0
                    ? [{ label: 'Arranque de tandas', value: result.breakdown.setup }]
                    : []),
                  { label: 'Merma', value: result.breakdown.wasteAmount },
                ]}
              />
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 font-display font-bold tabular">
                <span>Costo de producir el pedido</span>
                <span>{money(result.costBatch)}</span>
              </div>
            </div>

            {insumos.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold">Compra de insumos</p>
                <div className="space-y-2 text-sm">
                  {insumos.map((c, i) => (
                    <div key={i} className="rounded-lg border border-border bg-background/30 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium">{c.name ?? 'Insumo'}</span>
                        <span className="tabular font-semibold">{money(c.appliedCost)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                        <span>Unidades: {c.totalUnits}</span>
                        <span>Paquetes: {c.packagesToBuy}</span>
                        <span>Sobran: {c.leftover}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Celda de la tarjeta "Producción por tandas". */
function ProdCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background/30 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn('tabular mt-1 font-display text-lg font-bold', accent && 'text-brand-yellow-ink')}>
        {value}
      </div>
    </div>
  );
}

/** Detalle del costo con barras proporcionales al total (en paleta de marca). */
function BreakdownBars({
  items,
  total,
  money,
}: {
  items: { label: string; value: number }[];
  total: number;
  money: (n: number) => string;
}) {
  const max = Math.max(total, ...items.map((i) => i.value), 1);
  return (
    <dl className="space-y-2.5 text-sm tabular">
      {items.map((it) => {
        const pct = Math.max(0, Math.min(100, (it.value / max) * 100));
        const isWaste = it.label === 'Merma';
        return (
          <div key={it.label}>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">{it.label}</dt>
              <dd className="font-medium">{money(it.value)}</dd>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/60">
              <div
                className={cn('h-full rounded-full', isWaste ? 'bg-amber-400/70' : 'bg-brand-blue-bright')}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </dl>
  );
}
