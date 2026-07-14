import { Coins, Plus, Receipt, Tags, Trash2 } from 'lucide-react';
import { Badge, Button, Field, NumberInput, Section, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useCalculator } from '@/features/calculator/CalculatorProvider';
import { useMoney } from '@/features/settings/useSettings';

/** Nombre comercial de un nivel de ganancia según su posición (menor→Económico, mayor→Premium). */
function tierName(rate: number, rates: number[]): string {
  if (rates.length <= 1) return 'Recomendado';
  const sorted = [...rates].sort((a, b) => a - b);
  if (rate <= sorted[0]) return 'Económico';
  if (rate >= sorted[sorted.length - 1]) return 'Premium';
  return 'Recomendado';
}

export function StepMargenes() {
  const c = useCalculator();
  const { money } = useMoney();
  const result = c.result;

  // --- Niveles de ganancia (Económico / Recomendado / Premium) ---
  const setRate = (i: number, pct: number) =>
    c.setProfitRates((rs) => rs.map((r, idx) => (idx === i ? pct / 100 : r)));
  const addRate = () => c.setProfitRates((rs) => [...rs, 0.3]);
  const removeRate = (i: number) => c.setProfitRates((rs) => rs.filter((_, idx) => idx !== i));

  // --- Precios por cantidad ---
  const ordered = c.tiers
    .map((t, originalIndex) => ({ t, originalIndex }))
    .sort((a, b) => a.t.minQty - b.t.minQty);
  const setTier = (originalIndex: number, patch: Partial<{ minQty: number; marginPct: number }>) =>
    c.setTiers((ts) => ts.map((t, idx) => (idx === originalIndex ? { ...t, ...patch } : t)));
  const removeTier = (originalIndex: number) => c.setTiers((ts) => ts.filter((_, idx) => idx !== originalIndex));
  const addTier = () => c.setTiers((ts) => [...ts, { minQty: 1, marginPct: 0.3 }]);

  return (
    <div className="space-y-7">
      {/* 1) Niveles de precio */}
      <Section
        icon={Coins}
        title="¿Cuánto quieres ganar?"
        description="Tus niveles de precio para vender. En los resultados podrás elegir con cuál cobrar."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {c.profitRates.map((rate, i) => {
            const name = tierName(rate, c.profitRates);
            const priced = result?.prices.find((p) => Math.abs(p.marginPct - rate) < 1e-9);
            const isReco = name === 'Recomendado';
            return (
              <div
                key={i}
                className={cn(
                  'relative rounded-2xl border p-4',
                  isReco ? 'border-brand-yellow/60 bg-brand-yellow/[0.05]' : 'border-border bg-background/40',
                )}
              >
                <div className="flex items-center justify-between">
                  <Badge variant={isReco ? 'brand' : 'outline'}>{name}</Badge>
                  {c.profitRates.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeRate(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="mt-3">
                  <label className="text-xs text-muted-foreground">Ganancia sobre el costo</label>
                  <div className="relative mt-1 w-28">
                    <NumberInput className="pr-7" value={Math.round(rate * 1000) / 10} onChange={(v) => setRate(i, v)} />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
                {priced && (
                  <div className="mt-3 border-t border-border/70 pt-2 text-sm">
                    <span className="text-muted-foreground">Precio por pieza: </span>
                    <span className="tabular font-display font-bold">{money(priced.priceRounded)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={addRate}>
            <Plus className="h-4 w-4" /> Agregar nivel
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Ejemplo: si producir cuesta $5 y pones 50 % de ganancia, el precio es $7.50.
        </p>
      </Section>

      {/* 2) Redondeo */}
      <Section
        icon={Receipt}
        title="Redondeo del precio"
        description="Deja precios “bonitos” (por ejemplo, terminados en .50 o en números enteros)."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="¿Cómo redondear?">
            <Select
              value={c.roundingMode}
              onChange={(e) => c.setRoundingMode(e.target.value as 'NONE' | 'NEAREST' | 'UP' | 'DOWN')}
            >
              <option value="NONE">No redondear</option>
              <option value="NEAREST">Al más cercano</option>
              <option value="UP">Siempre hacia arriba</option>
              <option value="DOWN">Siempre hacia abajo</option>
            </Select>
          </Field>
          <Field label="Redondear a múltiplos de" hint="Ej. 0.50, 1, 5 o 10">
            <NumberInput step="0.5" value={c.roundingIncrement} onChange={(v) => c.setRoundingIncrement(v)} />
          </Field>
          <Field label="Precio mínimo de pedido" hint="0 = sin mínimo">
            <NumberInput step="0.01" value={c.minOrderPrice} onChange={(v) => c.setMinOrderPrice(v)} />
          </Field>
        </div>
      </Section>

      {/* 3) Precios por cantidad */}
      <Section
        icon={Tags}
        title="Precios por cantidad"
        description="En pedidos grandes bajas la ganancia para dar mejor precio."
        action={
          <Button variant="outline" size="sm" onClick={addTier}>
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        }
      >
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">Desde cantidad</th>
                <th className="px-3 py-2.5 font-semibold">Ganancia</th>
                <th className="px-3 py-2.5 text-right font-semibold">Precio por unidad</th>
                <th className="px-3 py-2.5 text-right font-semibold">Total a cobrar</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {ordered.map(({ t, originalIndex }) => {
                const resTier = result?.wholesale?.tiers.find((rt) => rt.minQty === t.minQty);
                return (
                  <tr
                    key={originalIndex}
                    className={cn('border-b border-border last:border-0', resTier?.applies && 'bg-brand-blue/[0.06]')}
                  >
                    <td className="px-3 py-2.5">
                      <div className="w-24">
                        <NumberInput value={t.minQty} onChange={(v) => setTier(originalIndex, { minQty: v })} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="relative w-24">
                        <NumberInput
                          className="pr-7"
                          value={Math.round(t.marginPct * 1000) / 10}
                          onChange={(v) => setTier(originalIndex, { marginPct: v / 100 })}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          %
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-display font-bold tabular">
                      {resTier ? money(resTier.unitPriceRounded) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular">{resTier ? money(resTier.lotTotal) : '—'}</td>
                    <td className="px-3 py-2.5 text-right">
                      {c.tiers.length > 1 && (
                        <Button variant="ghost" size="icon" onClick={() => removeTier(originalIndex)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          El precio y el total se calculan para las {c.quantity} piezas del pedido actual.
        </p>
      </Section>
    </div>
  );
}
