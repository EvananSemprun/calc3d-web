import { AlertTriangle, Coins, Factory, Plus, Scale, Sparkles, Trash2 } from 'lucide-react';
import {
  PRICE_STATUS_LABEL,
  suggestTiers,
  TIER_WARNING_LABEL,
  tierRanges,
  type PriceStatus,
} from '@calc3d/shared';
import { useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { Button, Card, CardContent, CardHeader, CardTitle, NumberInput } from '@/components/ui';
import { useMoney } from '@/features/settings/useSettings';
import { cn } from '@/lib/utils';
import { useCalculator, removeAt, updateAt } from '@/features/calculator/CalculatorProvider';

/** Color del texto según el estado. Rojo y verde SOLO para pérdida y OK. */
const STATUS_TEXT: Record<PriceStatus, string> = {
  LOSS: 'text-destructive',
  LOW: 'text-destructive',
  BELOW_TARGET: 'text-brand-yellow-ink',
  OK: 'text-success',
};

/**
 * Comparador de redondeos: qué precio daría cada regla y con qué margen.
 * Es la tabla D52:F57 de la hoja, y sirve para decidir de un vistazo si conviene
 * subir a la cifra redonda de arriba.
 */
export function RoundingComparator() {
  const c = useCalculator();
  const { money, percent } = useMoney();
  const r = c.result;
  if (!r) return null;

  const current = `${c.roundingMode}|${c.roundingIncrement}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4 text-brand-yellow-ink" />
          Qué daría cada redondeo
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Toca una opción para aplicarla. No se ofrece redondear hacia abajo: regala margen.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 font-semibold">Regla</th>
                <th className="pb-2 text-right font-semibold">Precio</th>
                <th className="pb-2 text-right font-semibold">Margen</th>
              </tr>
            </thead>
            <tbody>
              {r.roundingOptions.map((o) => {
                const key = `${o.mode}|${o.increment}`;
                const active = key === current;
                return (
                  <tr
                    key={key}
                    onClick={() => {
                      c.setRoundingMode(o.mode);
                      c.setRoundingIncrement(o.increment);
                      c.setManualPrice(null);
                    }}
                    className={cn(
                      'cursor-pointer border-b border-border/40 transition-colors last:border-0 hover:bg-brand-blue/10',
                      active && 'bg-brand-yellow/[0.07]',
                    )}
                  >
                    <td className="py-2">
                      {ROUNDING_LABEL[key] ?? key}
                      {active && (
                        <span className="ml-2 text-[10px] font-bold uppercase text-brand-yellow-ink">
                          en uso
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">{money(o.price)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {percent(o.marginReal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

const ROUNDING_LABEL: Record<string, string> = {
  'NEAREST|1': 'Al entero más cercano',
  'NEAREST|0.5': 'A los 0,50 más cercanos',
  'UP|1': 'Hacia arriba al entero',
  'UP|0.5': 'Hacia arriba a 0,50',
  'NONE|1': 'Sin redondeo',
};

/**
 * Mayoreo por DESCUENTO sobre el precio final, como la hoja. Cada tramo muestra
 * el margen real que queda: es lo que evita regalar el trabajo por volumen.
 */
export function WholesaleTable() {
  const c = useCalculator();
  const { money, percent } = useMoney();
  const confirm = useConfirm();
  const calcTiers = c.result?.wholesale?.tiers ?? [];
  // Ordenados y con hasta dónde llega cada uno: "desde 5" suelto no dice nada.
  const ranges = tierRanges(c.tiers);
  const sinDatos = !c.result || c.missing.length > 0;

  /** Pide al motor los tramos que no rompen el piso de margen. */
  const sugerir = async () => {
    const s = suggestTiers(c.input);
    if (s.tiers.length === 0) {
      notify.info(
        'No hay margen para descontar',
        `Con este precio, cualquier descuento baja el margen del piso (${percent(c.minMarginPct)}).`,
      );
      return;
    }
    if (
      c.tiers.length > 0 &&
      !(await confirm({
        title: `¿Reemplazar tus ${c.tiers.length} tramos?`,
        description: `Se proponen ${s.tiers.length}, con hasta ${percent(s.maxDiscountPct)} de descuento sin bajar del piso de margen.`,
        confirmLabel: 'Reemplazar',
      }))
    ) {
      return;
    }
    c.setTiers(s.tiers);
    notify.success(
      'Tramos sugeridos',
      `Hasta ${percent(s.maxDiscountPct)} de descuento sin bajar del piso de margen.`,
    );
  };

  /** Un tramo nuevo arranca DESPUÉS del último y descuenta más: nunca "desde 1". */
  const agregar = () =>
    c.setTiers((t) => {
      if (t.length === 0) {
        return [{ minQty: c.piecesPerBatch > 1 ? c.piecesPerBatch : 5, discountPct: 0.05 }];
      }
      const ultimo = Math.max(...t.map((x) => x.minQty));
      const mayor = Math.max(...t.map((x) => x.discountPct));
      return [
        ...t,
        { minQty: ultimo * 2, discountPct: Math.min(0.99, Math.round((mayor + 0.05) * 100) / 100) },
      ];
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="h-4 w-4 text-brand-yellow-ink" />
              Mayoreo
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Descuento sobre el precio final, según las unidades del pedido.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={sugerir}
              disabled={sinDatos}
              title={
                sinDatos
                  ? 'Completá los datos del trabajo para sugerir tramos'
                  : 'El mayor descuento que respeta tu piso de margen, en tres escalones'
              }
            >
              <Sparkles className="h-4 w-4" /> Sugerir
            </Button>
            <Button size="sm" variant="outline" onClick={agregar}>
              <Plus className="h-4 w-4" /> Tramo
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {ranges.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            Sin tramos. Usá «Sugerir» para que la app proponga unos que respeten tu piso de margen, o
            agregá uno a mano.
          </p>
        ) : (
          <div className="space-y-2">
            {ranges.map((t) => {
              const calc = calcTiers.find((x) => x.minQty === t.minQty);
              const rango =
                t.maxQty == null
                  ? `${t.minQty} u o más`
                  : t.maxQty === t.minQty
                    ? `${t.minQty} u`
                    : `De ${t.minQty} a ${t.maxQty} u`;
              return (
                <div
                  key={t.index}
                  className={cn(
                    'space-y-3 rounded-lg border p-3',
                    calc?.applies
                      ? 'border-brand-yellow/50 bg-brand-yellow/[0.05]'
                      : 'border-border/60 bg-background/40',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-sm font-semibold">
                      {rango}
                      <span className="font-sans font-normal text-muted-foreground">
                        {` · ${percent(t.discountPct)} de descuento`}
                      </span>
                    </span>
                    {calc?.applies && (
                      <span className="text-[10px] font-bold uppercase text-brand-yellow-ink">
                        aplica a este pedido
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[7rem_7rem_1fr_auto]">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Desde (u)</label>
                      <NumberInput
                        className="h-9"
                        min={1}
                        value={t.minQty}
                        onChange={(n) =>
                          updateAt(c.setTiers, t.index, { minQty: Math.max(1, Math.round(n)) })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Descuento %</label>
                      <NumberInput
                        className="h-9"
                        value={Math.round(t.discountPct * 1000) / 10}
                        onChange={(n) =>
                          updateAt(c.setTiers, t.index, { discountPct: Math.min(99, n) / 100 })
                        }
                      />
                    </div>
                    <div className="text-sm">
                      {calc ? (
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="font-display text-base font-bold tabular-nums">
                            {money(calc.unitPrice)}
                          </span>
                          <span className="text-muted-foreground">
                            margen {percent(calc.marginReal)}
                          </span>
                          <span className={cn('text-xs font-semibold', STATUS_TEXT[calc.status])}>
                            {PRICE_STATUS_LABEL[calc.status]}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAt(c.setTiers, t.index)}
                      className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive"
                      aria-label={`Quitar el tramo desde ${t.minQty}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {t.warnings.length > 0 && (
                    <ul className="space-y-1">
                      {t.warnings.map((w) => (
                        <li key={w} className="flex items-start gap-1.5 text-xs text-brand-yellow-ink">
                          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                          {TIER_WARNING_LABEL[w]}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {c.result?.wholesale?.appliedTier && (
              <div className="flex items-center justify-between rounded-lg bg-brand-blue/10 px-3 py-2 text-sm ring-1 ring-inset ring-brand-blue/25">
                <span className="text-muted-foreground">Total del pedido con el tramo aplicado</span>
                <span className="font-display font-bold tabular-nums">
                  {money(c.result.wholesale.orderTotal)}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Tandas, gramos, horas de máquina y entrega estimada. */
export function ProductionCard() {
  const c = useCalculator();
  const r = c.result;
  if (!r) return null;
  const p = r.production;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Factory className="h-4 w-4 text-brand-yellow-ink" />
          Producción
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Las horas de máquina son las que cuestan; la entrega es lo que le prometes al cliente.
        </p>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Metric label="Tandas" value={String(p.batches)} hint={`${p.piecesPerBatch} pzs c/u`} />
          <Metric label="Filamento total" value={`${p.totalGrams} g`} />
          <Metric label="Horas de máquina" value={formatHM(p.machineHours)} hint="lo que desgasta" />
          <Metric
            label="Entrega estimada"
            value={formatHM(p.deliveryHours)}
            hint={c.parallelPrinters > 1 ? `${c.parallelPrinters} impresoras` : undefined}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="font-display text-lg font-bold tabular-nums">{value}</dd>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Formatea horas decimales como "44 h 05 min". */
function formatHM(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${hh} h ${String(mm).padStart(2, '0')} min`;
}
