import type { ReactNode } from 'react';
import { Disc3 } from 'lucide-react';
import { AnalysisTab } from '@/features/filament/AnalysisTab';
import { PurchasesTab } from '@/features/filament/PurchasesTab';
import { StockTab } from '@/features/filament/StockTab';

/**
 * CONTROL DE FILAMENTO — las dos hojas que el dueño llevaba en el Excel:
 * "Inventario" (qué se compró y a cuánto) y "Stock mensual" (cuántos rollos hay).
 *
 * Vive aparte de Catálogos (que es el alta de fichas) y de Gastos (que es el
 * dinero que sale): acá se responde "cuánto me cuesta el filamento y cuánto me
 * queda".
 *
 * Desde el 2026-09-13 son TRES PÁGINAS con su propia dirección, agrupadas en la
 * categoría "Filamento" del menú (decisión del dueño). Antes eran pestañas de una
 * sola página: no se podía enlazar a una ni volver con "atrás".
 */
function FilamentShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
        <div>
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** `/filament/stock` — el conteo de rollos al cierre de cada mes. */
export function FilamentStockPage() {
  return (
    <FilamentShell
      title="Stock del mes"
      description="Lo que te queda en el estante: el conteo de rollos al cierre de cada mes."
    >
      <StockTab />
    </FilamentShell>
  );
}

/** `/filament/compras` — cada compra con su costo por rollo y por gramo. */
export function FilamentPurchasesPage() {
  return (
    <FilamentShell
      title="Compras de filamento"
      description="Lo que compraste y a cuánto te sale cada rollo y cada gramo."
    >
      <PurchasesTab />
    </FilamentShell>
  );
}

/** `/filament/analisis` — marcas, tipos y colores que más se compran. */
export function FilamentAnalysisPage() {
  return (
    <FilamentShell
      title="Análisis de filamento"
      description="Qué marcas, tipos y colores comprás más, y cuánto invertiste en cada uno."
    >
      <AnalysisTab />
    </FilamentShell>
  );
}

/** Ícono de la categoría del menú: el carrete. `Spool` no existe en esta versión de lucide. */
export const FilamentIcon = Disc3;
