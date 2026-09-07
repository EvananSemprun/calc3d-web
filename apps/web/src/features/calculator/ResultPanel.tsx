import { useState } from 'react';
import { ChevronDown, AlertTriangle, CheckCircle2, TrendingDown } from 'lucide-react';
import { PRICE_STATUS_LABEL, type CalcResult, type PriceStatus } from '@calc3d/shared';
import { Card, CardContent, CardHeader, CardTitle, NumberInput } from '@/components/ui';
import { BeamBorder, NumberTicker } from '@/components/effects';
import { useMoney } from '@/features/settings/useSettings';
import { cn } from '@/lib/utils';
import { ChargeEquivalentsCard } from './ChargeEquivalentsCard';

/** Cómo se ve cada estado. La paleta sigue estricta: rojo y verde SOLO acá. */
const STATUS_STYLE: Record<PriceStatus, { ring: string; text: string; icon: typeof CheckCircle2 }> = {
  LOSS: {
    ring: 'border-destructive/60 bg-destructive/10',
    text: 'text-destructive',
    icon: TrendingDown,
  },
  LOW: {
    ring: 'border-destructive/60 bg-destructive/10',
    text: 'text-destructive',
    icon: AlertTriangle,
  },
  BELOW_TARGET: {
    ring: 'border-brand-yellow/40 bg-brand-yellow/[0.06]',
    text: 'text-brand-yellow-ink',
    icon: AlertTriangle,
  },
  OK: {
    ring: 'border-success/50 bg-success/10',
    text: 'text-success',
    icon: CheckCircle2,
  },
};

/**
 * El precio a cobrar, primero y grande. Debajo, lo que hace falta para decidir:
 * margen real, ganancia, costo y el cobro en bolívares.
 *
 * En la calculadora el precio es EDITABLE (`onManualPrice`); en un documento
 * guardado se muestra tal como quedó.
 */
export function ResultPanel({
  result,
  onManualPrice,
  frozenRate,
}: {
  result: CalcResult;
  /** si se pasa, el precio final se puede escribir a mano */
  onManualPrice?: (n: number | null) => void;
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

  // Un documento guardado antes de shared 0.7.0 no tiene `price`: se avisa en
  // vez de romper la pantalla. No se recalcula: el snapshot es el precio que se
  // le cotizó al cliente ese día y no debe cambiar solo.
  if (!result.price) {
    return (
      <Card className="border-brand-yellow/40">
        <CardContent className="space-y-2 pt-5 text-sm">
          <p className="font-semibold text-brand-yellow-ink">
            Guardado con una versión anterior de la calculadora
          </p>
          <p className="text-muted-foreground">
            Este documento no trae el precio en el formato actual. El costo por unidad era{' '}
            <strong className="tabular-nums">{money(result.costPerUnit ?? 0)}</strong>. Para
            trabajarlo de nuevo, vuelve a calcularlo y guárdalo.
          </p>
        </CardContent>
      </Card>
    );
  }

  const p = result.price;
  // El semáforo juzga lo que se COBRA: con un tramo de mayoreo aplicado, el
  // precio de lista puede estar OK y el cobrado no.
  const o = result.order;
  // Sin costo todavía no hay margen que juzgar: el semáforo diría "margen bajo"
  // sobre un formulario en blanco, que es ruido y no información.
  const sinDatos = result.costPerUnit <= 0;
  const style = STATUS_STYLE[o.status];
  const StatusIcon = style.icon;
  const editable = !!onManualPrice;

  return (
    <div className="space-y-4">
      <BeamBorder className="rounded-2xl">
        <Card className="border-0">
          <CardContent className="space-y-4 pt-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Precio final por pieza
              </div>
              {editable ? (
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-2xl font-bold text-muted-foreground">
                    {result.currency === 'USD' ? '$' : ''}
                  </span>
                  <NumberInput
                    className="h-14 border-0 bg-transparent px-0 font-display text-4xl font-bold shadow-none focus-visible:ring-0"
                    value={Math.round(p.final * 100) / 100}
                    onChange={(n) => onManualPrice?.(n > 0 ? n : null)}
                    aria-label="Precio final por pieza"
                  />
                </div>
              ) : (
                <div className="font-display text-4xl font-bold tabular-nums">
                  <NumberTicker value={p.final} format={money} />
                </div>
              )}
              {moneyAlt && (
                <div className="text-sm text-muted-foreground">{moneyAlt(p.final)}</div>
              )}
            </div>

            {sinDatos ? (
              <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                Carga el trabajo para ver tu margen.
              </div>
            ) : (
              <div
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold',
                  style.ring,
                  style.text,
                )}
              >
                <StatusIcon className="h-4 w-4 shrink-0" />
                <span>{PRICE_STATUS_LABEL[o.status]}</span>
                <span className="ml-auto tabular-nums">{percent(o.marginReal)}</span>
              </div>
            )}

            {o.status === 'LOW' && !sinDatos && (
              <p className="rounded-xl border border-destructive/50 bg-destructive/[0.07] px-3 py-2 text-xs text-destructive">
                Estás por debajo de tu piso de margen. Se puede vender igual, pero sabiendo
                que a este precio el trabajo casi no deja.
              </p>
            )}

            {o.fromTier && (
              <div className="rounded-xl border border-brand-yellow/40 bg-brand-yellow/[0.06] px-3 py-2 text-sm">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Descuento por cantidad · {o.units} u
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground line-through">
                    {money(o.listUnitPrice)}
                  </span>
                  <span className="font-display text-lg font-bold tabular-nums">
                    {money(o.unitPrice)}
                  </span>
                  <span className="text-xs font-semibold text-brand-yellow-ink">
                    −{percent(o.discountPct)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Es el precio que va en la cotización del cliente.
                </p>
              </div>
            )}

            {editable && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Sugerido {money(p.suggested)} · redondeado {money(p.rounded)}
                </span>
                {p.isManual && (
                  <button
                    type="button"
                    onClick={() => onManualPrice?.(null)}
                    className="font-semibold text-brand-yellow-ink underline-offset-2 hover:underline"
                  >
                    Usar el sugerido
                  </button>
                )}
              </div>
            )}

            <dl className="grid gap-2 border-t border-border/70 pt-3 text-sm">
              <Line label="Costo por pieza" value={money(result.costPerUnit)} />
              <Line label="Ganancia por pieza" value={money(o.unitPrice - result.costPerUnit)} accent />
              <Line label="Costo del pedido" value={money(result.costBatch)} />
              <Line label="Ganancia del pedido" value={money(o.profit)} accent />
            </dl>

            <div className="rounded-xl bg-brand-blue/10 px-3 py-3 ring-1 ring-inset ring-brand-blue/25">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total del pedido · {o.units} u
              </div>
              <div className="font-display text-2xl font-bold tabular-nums">
                <NumberTicker value={o.total} format={money} />
              </div>
              {moneyAlt && <div className="text-xs text-muted-foreground">{moneyAlt(o.total)}</div>}
            </div>
          </CardContent>
        </Card>
      </BeamBorder>

      {frozenRate === undefined && (
        <ChargeEquivalentsCard orderUsd={o.total} unitUsd={o.unitPrice} />
      )}

      <Card>
        <CardHeader className="pb-0">
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <CardTitle className="text-base">Desglose del costo</CardTitle>
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', showBreakdown && 'rotate-180')}
            />
          </button>
        </CardHeader>
        {showBreakdown && (
          <CardContent className="pt-4">
            <dl className="space-y-2 text-sm">
              <Line label="Filamento" value={money(result.breakdown.material)} />
              <Line label="Desgaste de la máquina" value={money(result.breakdown.wear)} />
              <Line label="Electricidad" value={money(result.breakdown.power)} />
              <Line label="Insumos" value={money(result.breakdown.supplies)} />
              <Line label="Tu tiempo" value={money(result.breakdown.labor)} />
              <Line label="Empaque y otros" value={money(result.breakdown.extras)} />
              <Line label="Merma" value={money(result.breakdown.wasteAmount)} />
              <div className="flex items-center justify-between border-t border-border/70 pt-2 font-semibold">
                <dt>Costo del pedido</dt>
                <dd className="tabular-nums">{money(result.costBatch)}</dd>
              </div>
            </dl>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function Line({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <dt className="min-w-0 text-muted-foreground">{label}</dt>
      <dd className={cn('shrink-0 tabular-nums font-semibold', accent && 'text-brand-yellow-ink')}>
        {value}
      </dd>
    </div>
  );
}
