import { Link } from 'react-router-dom';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import { computeChargeEquivalents, DEFAULT_PROTECTION_LABEL, formatMoney } from '@calc3d/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useMoney, useSettings } from '@/features/settings/useSettings';
import { useExchangeRates } from '@/features/settings/useExchangeRates';
import { cn } from '@/lib/utils';

/** Formatea un monto en bolívares (sin decimales; los Bs se manejan en enteros). */
function bs(v: number, code = 'VES'): string {
  return formatMoney(v, code, 'es-VE').replace(/[,.]00$/, '');
}

/**
 * "Cómo cobrar en bolívares sin perder margen": traduce el precio recomendado en
 * USD a los bolívares a cobrar según la tasa de REFERENCIA (el dólar real), y
 * muestra el precio equivalente a cotizar en las demás tasas. Se calcula EN VIVO
 * (reactivo al precio elegido y a la tasa vigente); nada congelado aquí.
 */
export function ChargeEquivalentsCard({
  orderUsd,
  unitUsd,
}: {
  /** precio recomendado del pedido completo, en USD. */
  orderUsd: number;
  /** precio recomendado por pieza, en USD. */
  unitUsd: number;
}) {
  const { data: settings } = useSettings();
  const { money } = useMoney();
  // La protección NO depende de la tasa ambiental (defaultRateLabel): se consultan
  // las tasas siempre, para que la tarjeta funcione aunque no haya moneda por defecto.
  const { data: ratesData } = useExchangeRates({ enabled: true });
  const rates = ratesData?.rates ?? [];

  // Solo tasas en bolívares participan de la protección de margen.
  const vesRates = rates.filter((r) => r.currencyCode === 'VES');
  if (vesRates.length === 0) return null;

  const referenceLabel = settings?.protectionRateLabel ?? DEFAULT_PROTECTION_LABEL;

  const order = computeChargeEquivalents({
    baseUsd: orderUsd,
    referenceLabel,
    rates: vesRates,
  });
  const unit = computeChargeEquivalents({
    baseUsd: unitUsd,
    referenceLabel,
    rates: vesRates,
  });

  const ref = order.profiles.find((p) => p.isReference) ?? null;
  const others = order.profiles.filter((p) => !p.isReference && p.available);
  const unitTarget = unit.targetVes;

  return (
    <Card className="border-brand-blue/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-brand-yellow-ink" />
          Cómo cobrar en bolívares sin perder margen
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Costeas en dólares, pero cobras en bolívares. Estos montos protegen tu ganancia según la tasa
          que uses.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!ref || order.targetVes == null ? (
          <div className="flex items-start gap-2 rounded-lg border border-brand-yellow/40 bg-brand-yellow/[0.06] p-3 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand-yellow-ink" />
            <span>
              No hay una <strong>tasa de referencia</strong> configurada (tu “dólar real”). Defínela en{' '}
              <Link to="/settings" className="font-semibold text-brand-yellow-ink underline">
                Configuración → Moneda
              </Link>
              .
            </span>
          </div>
        ) : (
          <>
            {/* Monto objetivo (el piso a recibir) */}
            <div className="rounded-xl border border-brand-yellow/30 bg-brand-yellow/[0.05] p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cobra este monto para no perder margen
              </div>
              <div className="mt-1 font-display text-3xl font-bold tabular text-brand-yellow-ink">
                {bs(order.targetVes, ref.currencyCode)}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Equivale a <strong>{money(order.baseUsd)}</strong> al dólar real{' '}
                <span className="font-semibold">{ref.label}</span> ({ref.rate.toLocaleString('es-VE')} Bs/USD)
                {unitTarget != null && (
                  <>
                    {' '}
                    · {bs(unitTarget, ref.currencyCode)} por pieza
                  </>
                )}
              </div>
            </div>

            {/* Si cotizas en dólares a otra tasa: cuánto poner */}
            {others.length > 0 && (
              <div>
                <p className="mb-2 text-sm text-muted-foreground">
                  ¿Vas a cotizar en dólares pero a otra tasa? Pon <strong>este</strong> precio para recibir
                  lo mismo:
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[440px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">Tasa</th>
                        <th className="px-3 py-2 text-right font-semibold">Bs por USD</th>
                        <th className="px-3 py-2 text-right font-semibold">Precio a cotizar</th>
                        <th className="px-3 py-2 text-right font-semibold">Pérdida evitada</th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {others.map((p) => (
                        <tr key={p.label} className="border-b border-border/70 last:border-0">
                          <td className="px-3 py-2.5 font-medium">{p.label}</td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">
                            {p.rate.toLocaleString('es-VE')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-display font-bold text-brand-yellow-ink">
                            {money(p.adjustedBaseUsd)}
                          </td>
                          <td
                            className={cn(
                              'px-3 py-2.5 text-right',
                              p.shortfallVes > 0 ? 'text-success' : 'text-muted-foreground',
                            )}
                          >
                            {p.shortfallVes > 0 ? `+${bs(p.shortfallVes, p.currencyCode)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                  <strong>Pérdida evitada</strong> = lo que dejarías de recibir si cobraras el precio
                  recomendado ({money(order.baseUsd)}) directo a esa tasa, en vez del precio ajustado.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
