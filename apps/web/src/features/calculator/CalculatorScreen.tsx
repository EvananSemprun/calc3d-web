import { useState } from 'react';
import { Package } from 'lucide-react';
import { Button, Card, CardContent } from '@/components/ui';
import { useCalculator } from '@/features/calculator/CalculatorProvider';
import { CalculatorForm } from '@/features/calculator/sections';
import { ResultPanel } from '@/features/calculator/ResultPanel';
import { ProductionCard, RoundingComparator, WholesaleTable } from '@/features/calculator/analysis';
import { SaveProductModal } from '@/features/calculator/SaveProductModal';

/**
 * La calculadora en UNA pantalla, con el mismo orden que la hoja "Costeo" del
 * Excel: las secciones de entrada ARRIBA y a todo el ancho, y el precio DEBAJO.
 * Después, lo que se consulta al decidir: redondeos, mayoreo y producción.
 *
 * Hasta el 2026-09-13 el precio iba en una columna fija a la derecha. El
 * dueño lo pasó abajo para que el formulario aproveche el ancho en PC: con la
 * columna, cada campo quedaba de ~150 px. Esa columna era `sticky`, pero no
 * servía: con el cobro en bolívares y el desglose el panel mide más que la
 * pantalla, y un elemento fijo más alto que la ventana igual obliga a volver a
 * subir. En móvil el precio sigue PRIMERO.
 */
export function CalculatorScreen() {
  const c = useCalculator();
  const [productOpen, setProductOpen] = useState(false);
  const listo = c.missing.length === 0 && !!c.result;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Calculadora</h1>
          <p className="text-sm text-muted-foreground">
            Todo en una pantalla. El precio se recalcula mientras escribes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="accent"
            onClick={() => setProductOpen(true)}
            disabled={!listo}
            title={c.missing.length ? `Falta: ${c.missing.join(', ')}` : 'Guardar en el catálogo'}
          >
            <Package className="h-4 w-4" /> Guardar producto
          </Button>
        </div>
      </header>

      {c.calcError && (
        <Card className="border-destructive/50">
          <CardContent className="pt-5 text-sm text-destructive">{c.calcError}</CardContent>
        </Card>
      )}

      {c.missing.length > 0 && (
        <p className="rounded-xl border border-brand-yellow/40 bg-brand-yellow/[0.06] px-4 py-3 text-sm text-brand-yellow-ink">
          Para que el precio signifique algo, falta: <strong>{c.missing.join(', ')}</strong>.
        </p>
      )}

      <div className="grid gap-5">
        {/* En móvil el precio va PRIMERO: es lo que se mira mientras se ajusta.
            En PC va debajo del formulario, que así ocupa todo el ancho. */}
        <div className="order-2 min-w-0 lg:order-1">
          <CalculatorForm />
        </div>
        <div className="order-1 min-w-0 lg:order-2">
          {c.result ? (
            <ResultPanel result={c.result} onManualPrice={c.setManualPrice} />
          ) : (
            <Card>
              <CardContent className="pt-5 text-sm text-muted-foreground">
                Completa los datos del trabajo para ver el precio.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {c.result && (
        <div className="grid gap-5 lg:grid-cols-2">
          <RoundingComparator />
          <ProductionCard />
          <div className="lg:col-span-2">
            <WholesaleTable />
          </div>
        </div>
      )}

      {productOpen && <SaveProductModal onClose={() => setProductOpen(false)} />}
    </div>
  );
}
