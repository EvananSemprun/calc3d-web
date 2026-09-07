import { useMemo } from 'react';
import { ShoppingCart } from 'lucide-react';
import { Card, CardContent, EmptyState, SearchInput, Stat, TableSkeleton } from '@/components/ui';
import { useMoney } from '@/features/settings/useSettings';
import { DateRangePicker, useDateRange } from '@/features/finance/DateRange';
import { usePersistentState } from '@/lib/usePersistentState';
import { useFilamentPurchases } from '@/features/filament/api';

/**
 * COMPRAS DE FILAMENTO — la hoja "Inventario" del Excel.
 *
 * El costo por rollo y por gramo los deriva el servidor. El **por gramo usa los
 * gramos reales del rollo**, no el ÷1000 fijo de la hoja: para un rollo de 1 kg
 * da lo mismo, para uno de 250 g la hoja miente.
 */
export function PurchasesTab() {
  const range = useDateRange('ALL', 'filament-purchases');
  const { money } = useMoney();
  const [q, setQ] = usePersistentState('filament:purchases:q', '');
  const { data: compras = [], isLoading } = useFilamentPurchases(range);

  const filtradas = useMemo(() => {
    const t = norm(q);
    if (!t) return compras;
    return compras.filter(
      (c) => norm(c.materialName ?? '').includes(t) || norm(c.providerName ?? '').includes(t),
    );
  }, [compras, q]);

  const rollos = filtradas.reduce((s, c) => s + c.quantity, 0);
  const invertido = filtradas.reduce((s, c) => s + c.amount, 0);
  const promedio = rollos > 0 ? invertido / rollos : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangePicker range={range} />
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Buscar filamento o proveedor…"
          className="w-full sm:w-72"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Rollos comprados" value={String(rollos)} />
        <Stat label="Invertido en filamento" value={money(invertido)} />
        <Stat label="Costo promedio por rollo" value={money(promedio)} />
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : filtradas.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Sin compras de filamento"
          description={
            compras.length === 0
              ? 'Las compras se registran desde Gastos, con el tipo "Filamento".'
              : 'Ninguna compra coincide con la búsqueda.'
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Escritorio: tabla. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="p-3 font-semibold">Fecha</th>
                    <th className="p-3 font-semibold">Filamento</th>
                    <th className="p-3 text-right font-semibold">Rollos</th>
                    <th className="p-3 text-right font-semibold">Costo total</th>
                    <th className="p-3 text-right font-semibold">Por rollo</th>
                    <th className="p-3 text-right font-semibold">Por gramo</th>
                    <th className="p-3 font-semibold">Proveedor</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((c) => (
                    <tr key={c.id} className="border-b border-border/40 last:border-0">
                      <td className="p-3 tabular-nums text-muted-foreground">{fecha(c.date)}</td>
                      <td className="p-3">
                        <div className="font-medium">{c.materialName ?? '—'}</div>
                        {c.note && <div className="text-xs text-muted-foreground">{c.note}</div>}
                      </td>
                      <td className="p-3 text-right tabular-nums">{c.quantity}</td>
                      <td className="p-3 text-right tabular-nums">{money(c.amount)}</td>
                      <td className="p-3 text-right font-semibold tabular-nums">
                        {money(c.costPerRoll)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {porGramo(c.costPerGram)}
                      </td>
                      <td className="p-3 text-muted-foreground">{c.providerName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil: tarjetas apiladas. */}
            <div className="divide-y divide-border/50 md:hidden">
              {filtradas.map((c) => (
                <div key={c.id} className="space-y-1 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{c.materialName ?? '—'}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{money(c.amount)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>{fecha(c.date)}</span>
                    <span>{c.quantity} rollo(s)</span>
                    <span>{money(c.costPerRoll)}/rollo</span>
                    <span>{porGramo(c.costPerGram)}/g</span>
                  </div>
                  {c.providerName && (
                    <div className="text-xs text-muted-foreground">{c.providerName}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** El costo por gramo son centavos: con 2 decimales se ve siempre "$0.02". */
function porGramo(n: number): string {
  return `$${n.toFixed(4)}`;
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', { timeZone: 'UTC' });
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
