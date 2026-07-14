import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronLeft, ChevronRight, Save, Package } from 'lucide-react';
import { Button, Card, Stepper, type StepDef } from '@/components/ui';
import { NumberTicker } from '@/components/effects';
import { useMoney } from '@/features/settings/useSettings';
import { useCalculator } from '@/features/calculator/CalculatorProvider';
import { SaveQuoteModal } from '@/features/calculator/SaveQuoteModal';
import { SaveProductModal } from '@/features/calculator/SaveProductModal';
import { StepLote } from '@/features/calculator/steps/StepLote';
import { StepMateriales } from '@/features/calculator/steps/StepMateriales';
import { StepCostos } from '@/features/calculator/steps/StepCostos';
import { StepMargenes } from '@/features/calculator/steps/StepMargenes';
import { StepResultado } from '@/features/calculator/steps/StepResultado';

const STEPS: (StepDef & { Component: () => JSX.Element })[] = [
  { id: 'lote', label: 'Inicio', Component: StepLote },
  { id: 'materiales', label: 'Materiales e insumos', Component: StepMateriales },
  { id: 'costos', label: 'Costos y extras', Component: StepCostos },
  { id: 'margenes', label: 'Márgenes y mayoreo', Component: StepMargenes },
  { id: 'resultado', label: 'Resultados', Component: StepResultado },
];

export function Wizard() {
  const c = useCalculator();
  const { result } = c;
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);

  // Validación de los 3 datos del trabajo (todos viven en el paso 0 "Inicio").
  const totalGrams = c.materials.reduce((s, m) => s + (Number(m.grams) || 0), 0);
  const reqGrams = totalGrams > 0;
  const reqHours = !c.printerEnabled || c.printer.hours > 0;
  const reqQty = c.quantity >= 1;
  const allReqMet = reqQty && reqGrams && reqHours;
  const allMissing = [
    !reqQty && 'cantidad de piezas',
    !reqGrams && 'gramos totales',
    !reqHours && 'horas de impresión',
  ].filter(Boolean) as string[];
  // Solo el paso 0 (Inicio) bloquea avanzar; el resto es refinamiento libre.
  const canAdvance = current === 0 ? allReqMet : true;
  const stepMissing = current === 0 && allMissing.length > 0 ? allMissing.join(', ') : null;

  const go = (i: number) => {
    const n = Math.min(Math.max(i, 0), STEPS.length - 1);
    setCurrent(n);
    setMaxReached((m) => Math.max(m, n));
  };

  const Step = STEPS[current].Component;
  const isLast = current === STEPS.length - 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Calculadora</h1>
          <p className="text-sm text-muted-foreground">
            Cotiza una pieza impresa en 3D en 5 pasos.
          </p>
        </div>
        <LiveStrip />
      </div>

      <Card className="overflow-hidden">
        <div className="surface-grid border-b border-border/70 p-4 sm:px-6">
          <Stepper steps={STEPS} current={current} maxReached={maxReached} onSelect={go} />
        </div>

        <div className="p-5 sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <Step />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-muted/20 p-4 sm:px-6">
          <Button variant="outline" onClick={() => go(current - 1)} disabled={current === 0}>
            <ChevronLeft className="h-4 w-4" /> Atrás
          </Button>
          <span className="hidden flex-1 px-3 text-center text-xs text-amber-600 dark:text-amber-400 sm:block">
            {isLast
              ? allMissing.length > 0 && `Falta para guardar: ${allMissing.join(', ')}.`
              : stepMissing && `Completa los datos del trabajo: ${stepMissing}.`}
          </span>
          {isLast ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setProductOpen(true)}
                disabled={!result || !allReqMet}
                title={allMissing.length ? `Falta: ${allMissing.join(', ')}` : 'Guardar como producto reutilizable'}
              >
                <Package className="h-4 w-4" /> Guardar producto
              </Button>
              <Button
                variant="accent"
                onClick={() => setSaveOpen(true)}
                disabled={!result || !allReqMet}
                title={allMissing.length ? `Falta: ${allMissing.join(', ')}` : undefined}
              >
                <Save className="h-4 w-4" /> Guardar presupuesto
              </Button>
            </div>
          ) : (
            <Button onClick={() => go(current + 1)} disabled={!canAdvance}>
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </Card>

      {saveOpen && <SaveQuoteModal onClose={() => setSaveOpen(false)} />}
      {productOpen && <SaveProductModal onClose={() => setProductOpen(false)} />}
    </div>
  );
}

/** Barra-resumen compacta con KPIs en vivo (animados), visible en todos los pasos. */
function LiveStrip() {
  const { result, selectedRate } = useCalculator();
  const { money } = useMoney();
  if (!result) return null;
  const suggested =
    (selectedRate != null && result.prices.find((p) => p.marginPct === selectedRate)) ||
    result.prices[Math.min(1, Math.max(0, result.prices.length - 1))];
  return (
    <div className="flex w-full items-stretch divide-x divide-border/70 overflow-hidden rounded-xl glass sm:w-auto">
      <Chip label="Costo por pieza" value={result.costPerUnit} format={money} accent />
      <Chip label="Costo del pedido" value={result.costBatch} format={money} />
      {suggested && <Chip label="Precio sugerido" value={suggested.priceRounded} format={money} />}
    </div>
  );
}

function Chip({
  label,
  value,
  format,
  accent,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  accent?: boolean;
}) {
  return (
    <div className="flex-1 px-3 py-2 sm:flex-none sm:px-4">
      <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`font-display text-base font-bold tabular sm:text-lg ${accent ? 'text-brand-yellow-ink' : ''}`}>
        <NumberTicker value={value} format={format} />
      </div>
    </div>
  );
}
