import { useState } from 'react';
import { Box, Copy, Grid3x3, Boxes } from 'lucide-react';
import { Field, Input, NumberInput, REQUIRED_INPUT, Section, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useCalculator } from '@/features/calculator/CalculatorProvider';

/**
 * Paso 1 "quick-quote": captura los datos del trabajo (cantidad, piezas por
 * impresión, gramos y horas que muestra el slicer). Un selector inicial
 * "¿Qué estás cotizando?" adapta los campos y el microcopy para que sea obvio
 * qué poner. Los gramos escriben en `materials[0].grams` y las horas en
 * `printer.hours`; el resto se afina en los pasos siguientes.
 */
type QuoteMode = 'one' | 'perPrint' | 'sameBed';

const MODES: { key: QuoteMode; icon: typeof Box; title: string; hint: string }[] = [
  { key: 'one', icon: Box, title: 'Una pieza', hint: 'Un solo objeto' },
  { key: 'perPrint', icon: Copy, title: 'Varias piezas, una por impresión', hint: 'Se imprimen de a una' },
  { key: 'sameBed', icon: Grid3x3, title: 'Varias piezas en una misma cama', hint: 'Varias juntas por impresión' },
];

const MODE_COPY: Record<QuoteMode, string> = {
  one: 'Pon los gramos y el tiempo de esa única pieza, tal como los muestra el slicer.',
  perPrint:
    'Imprimes una pieza por vez. Pon los gramos y el tiempo de UNA impresión; el sistema los multiplica por el total de piezas.',
  sameBed:
    'Pones varias piezas juntas en la cama. Los gramos y el tiempo son los de esa cama completa; el costo se reparte entre las piezas que caben.',
};

export function StepLote() {
  const c = useCalculator();

  const totalGrams = c.materials[0]?.grams ?? 0;
  const setTotalGrams = (g: number) =>
    c.setMaterials((m) =>
      m.length === 0
        ? [{ name: '', rollPrice: 0, rollGrams: 1000, grams: g }]
        : m.map((line, i) => (i === 0 ? { ...line, grams: g } : line)),
    );

  // Modo inicial derivado del estado actual.
  const [mode, setMode] = useState<QuoteMode>(() => {
    const pieces = c.piecesPerBatch ?? 1;
    if (c.quantity <= 1 && pieces <= 1) return 'one';
    if (pieces <= 1) return 'perPrint';
    return 'sameBed';
  });

  const pickMode = (m: QuoteMode) => {
    setMode(m);
    if (m === 'one') {
      c.setQuantity(1);
      c.setPiecesPerBatch(1);
    } else if (m === 'perPrint') {
      c.setPiecesPerBatch(1);
      if (c.quantity < 2) c.setQuantity(2);
    } else {
      if ((c.piecesPerBatch ?? 1) < 2) c.setPiecesPerBatch(2);
      if (c.quantity < 2) c.setQuantity(2);
    }
  };

  const showTotal = mode !== 'one';
  const showPerPrint = mode === 'sameBed';

  return (
    <div className="space-y-6">
      <Section
        icon={Boxes}
        title="¿Qué estás cotizando?"
        description="Elige lo que más se parezca a tu trabajo. Así sabes exactamente qué poner en cada campo."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {MODES.map(({ key, icon: Icon, title, hint }) => {
            const active = mode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => pickMode(key)}
                className={cn(
                  'flex flex-col gap-1 rounded-2xl border p-4 text-left transition-all',
                  active
                    ? 'border-brand-yellow bg-brand-yellow/[0.06] shadow-glow-sm'
                    : 'border-border bg-background/40 hover:border-brand-yellow/50',
                )}
              >
                <span
                  className={cn(
                    'grid h-9 w-9 place-items-center rounded-lg',
                    active ? 'bg-brand-yellow text-brand-yellow-foreground' : 'bg-brand-blue text-white',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="mt-1 font-display text-sm font-bold leading-tight">{title}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        icon={Boxes}
        title="Datos del trabajo"
        description="Los datos que vienen del slicer. Con esto ya tienes tu precio; lo demás lo afinas en los pasos siguientes."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {showTotal && (
            <Field label="Total de piezas del pedido" required hint="Cuántas piezas necesitas en total">
              <NumberInput
                min={1}
                placeholder="1"
                className={cn('h-12 text-lg font-semibold', REQUIRED_INPUT)}
                value={c.quantity}
                onChange={(n) => c.setQuantity(n < 1 ? 1 : Math.floor(n))}
              />
            </Field>
          )}
          {showPerPrint && (
            <Field
              label="¿Cuántas piezas caben en una impresión?"
              required
              hint="Las que pones juntas en una sola cama"
            >
              <NumberInput
                min={1}
                placeholder="1"
                className={cn('h-12 text-lg font-semibold', REQUIRED_INPUT)}
                value={c.piecesPerBatch ?? 1}
                onChange={(v) => c.setPiecesPerBatch(v >= 1 ? Math.floor(v) : 1)}
              />
            </Field>
          )}
          <Field
            label="Gramos que muestra el slicer"
            required
            hint={mode === 'sameBed' ? 'De la cama completa' : 'De esa impresión'}
          >
            <NumberInput
              step="0.1"
              placeholder="0"
              className={cn('h-12 text-lg font-semibold', REQUIRED_INPUT)}
              value={totalGrams}
              onChange={setTotalGrams}
            />
          </Field>
          <Field
            label="Tiempo que muestra el slicer"
            required
            hint="En horas (8h 49m ≈ 8.82)"
          >
            <NumberInput
              step="0.1"
              placeholder="0"
              className={cn('h-12 text-lg font-semibold', REQUIRED_INPUT)}
              value={c.printer.hours}
              onChange={(v) => c.setPrinter((p) => ({ ...p, hours: v }))}
            />
          </Field>
        </div>

        <p className="mt-3 rounded-lg bg-brand-blue/[0.06] px-3 py-2 text-xs text-muted-foreground ring-1 ring-brand-blue/20">
          {MODE_COPY[mode]}
        </p>
      </Section>

      <Section icon={Boxes} title="Identificación (opcional)" description="Para guardar el presupuesto después.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre del presupuesto" hint="Opcional">
            <Input
              value={c.quoteName}
              onChange={(e) => c.setQuoteName(e.target.value)}
              placeholder="Ej. Llaveros personalizados"
            />
          </Field>
          <Field label="Cliente" hint="Opcional">
            <Select value={c.clientId} onChange={(e) => c.setClientId(e.target.value)}>
              <option value="">Sin cliente</option>
              {c.catalogs.clients.data?.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>
    </div>
  );
}
