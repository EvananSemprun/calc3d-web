import { Disc3 } from 'lucide-react';
import { usePersistentState } from '@/lib/usePersistentState';
import { cn } from '@/lib/utils';
import { PurchasesTab } from '@/features/filament/PurchasesTab';
import { StockTab } from '@/features/filament/StockTab';

/**
 * CONTROL DE FILAMENTO — las dos hojas que el dueño llevaba en el Excel:
 * "Inventario" (qué se compró y a cuánto) y "Stock mensual" (cuántos rollos hay).
 *
 * Vive aparte de Catálogos (que es el alta de fichas) y de Gastos (que es el
 * dinero que sale): acá se responde "cuánto me cuesta el filamento y cuánto me
 * queda".
 */
const TABS = [
  { id: 'stock', label: 'Stock del mes', Component: StockTab },
  { id: 'compras', label: 'Compras', Component: PurchasesTab },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function FilamentPage() {
  const [tab, setTab] = usePersistentState<TabId>('filament:tab', 'stock');
  const actual = TABS.find((t) => t.id === tab) ?? TABS[0];
  const Actual = actual.Component;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
        <div>
          <h1 className="font-display text-2xl font-bold">Filamento</h1>
          <p className="text-sm text-muted-foreground">
            Lo que compraste y lo que te queda en el estante.
          </p>
        </div>
      </div>

      {TABS.length > 1 && (
        <div role="tablist" aria-label="Control de filamento" className="flex gap-1 border-b border-border/70">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={t.id === actual.id}
              onClick={() => setTab(t.id)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors',
                t.id === actual.id
                  ? 'border-brand-yellow text-brand-yellow-ink'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <Actual />
    </div>
  );
}

/** Ícono del menú: el carrete. `Spool` no existe en esta versión de lucide. */
export const FilamentIcon = Disc3;
