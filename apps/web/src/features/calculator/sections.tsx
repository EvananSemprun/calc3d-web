import * as React from 'react';
import { Boxes, Layers, Package, Printer, Clock, Box, Percent, Trash2 } from 'lucide-react';
import {
  Field,
  Input,
  NumberInput,
  REQUIRED_INPUT,
  Select,
  Switch,
} from '@/components/ui';
import { useMoney } from '@/features/settings/useSettings';
import { useCalculator, removeAt, updateAt } from '@/features/calculator/CalculatorProvider';
import { CatalogSelect, LineGroup, MiniField } from '@/features/calculator/parts';

/**
 * Las secciones de entrada, en el MISMO orden que la hoja "Costeo" del Excel.
 * Cada bloque muestra a la derecha lo que aporta al costo, que es lo que hace
 * legible la hoja: se ve al instante qué partida pesa.
 */

/** Encabezado de sección numerado, con su aporte al costo del pedido. */
function CostSection({
  n,
  title,
  hint,
  icon: Icon,
  amount,
  amountLabel = 'en el pedido',
  action,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  amount?: number;
  amountLabel?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { money } = useMoney();
  return (
    <section className="rounded-2xl border border-border/70 bg-background/40 p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-blue/15 text-brand-blue-bright ring-1 ring-inset ring-brand-blue/30">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-base font-semibold leading-tight">
              <span className="text-muted-foreground">{n}.</span> {title}
            </h3>
            {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
          </div>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:shrink-0">
          {action}
          {amount != null && (
            <div className="text-right">
              <div className="font-display text-base font-bold tabular-nums">{money(amount)}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {amountLabel}
              </div>
            </div>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

/** 1. LA PIEZA — qué se cotiza y cuántas caben por impresión. */
export function SectionPieza() {
  const c = useCalculator();
  return (
    <CostSection
      n={1}
      icon={Boxes}
      title="La pieza"
      hint="Qué cotizas y cuántas salen en cada impresión."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <Field label="Nombre del trabajo">
            <Input
              value={c.quoteName}
              onChange={(e) => c.setQuoteName(e.target.value)}
              placeholder="Ej. Stand modular — 1 piso"
            />
          </Field>
        </div>
        <Field label="Unidades del pedido" required>
          <NumberInput
            className={REQUIRED_INPUT}
            min={1}
            value={c.quantity}
            onChange={(n) => c.setQuantity(Math.max(1, Math.round(n)))}
          />
        </Field>
        <Field
          label="Piezas por tanda"
          hint="Cuántas entran en UNA impresión."
        >
          <NumberInput
            min={1}
            value={c.piecesPerBatch}
            onChange={(n) => c.setPiecesPerBatch(Math.max(1, Math.round(n)))}
          />
        </Field>
      </div>
    </CostSection>
  );
}

/** 2. FILAMENTO — el rollo, los gramos de la tanda y la merma. */
export function SectionFilamento() {
  const c = useCalculator();
  const r = c.result;
  return (
    <CostSection
      n={2}
      icon={Layers}
      title="Filamento"
      hint="Lo que pesa la tanda según el laminador."
      amount={r ? r.breakdown.material + r.breakdown.wasteAmount : undefined}
      action={
        <div className="w-full sm:w-44">
          <CatalogSelect
            items={c.catalogs.materials.data}
            onPick={(m) =>
              c.setFilament((f) => ({
                ...f,
                name: m.name,
                rollPrice: Number(m.rollPrice),
                rollGrams: m.rollGrams,
              }))
            }
          />
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Precio del rollo" required>
          <NumberInput
            className={REQUIRED_INPUT}
            value={c.filament.rollPrice}
            onChange={(n) => c.setFilament((f) => ({ ...f, rollPrice: n }))}
          />
        </Field>
        <Field label="Peso del rollo (g)">
          <NumberInput
            value={c.filament.rollGrams}
            onChange={(n) => c.setFilament((f) => ({ ...f, rollGrams: n || 1000 }))}
          />
        </Field>
        <Field
          label="Gramos de la tanda"
          required
          hint="Lo que dice el laminador para la placa completa."
        >
          <NumberInput
            className={REQUIRED_INPUT}
            value={c.filament.grams}
            onChange={(n) => c.setFilament((f) => ({ ...f, grams: n }))}
          />
        </Field>
        <Field
          label="Merma y fallos (%)"
          hint="Soportes, purga y reimpresiones."
        >
          <NumberInput
            value={Math.round(c.waste * 1000) / 10}
            onChange={(n) => c.setWaste(n / 100)}
          />
        </Field>
      </div>
    </CostSection>
  );
}

/** 3. INSUMOS — argollas, bolsitas, imanes: cantidad por pieza y costo unitario. */
export function SectionInsumos() {
  const c = useCalculator();
  return (
    <CostSection
      n={3}
      icon={Package}
      title="Insumos"
      hint="Lo que lleva cada pieza además del filamento."
      amount={c.result?.breakdown.supplies}
    >
      <LineGroup
        title="Insumos por pieza"
        hint="La cantidad es POR PIEZA."
        onAdd={() => c.setSupplies((s) => [...s, { name: '', qty: 1, unitCost: 0 }])}
        empty="Sin insumos. Agrega una línea si la pieza lleva argollas, bolsitas o imanes."
      >
        {c.supplies.map((s, i) => (
          <div
            key={i}
            className="grid grid-cols-2 items-end gap-3 rounded-lg border border-border/60 bg-background/40 p-3 sm:grid-cols-[1fr_7rem_8rem_auto]"
          >
            <MiniField label="Insumo">
              <Input
                className="h-9"
                value={s.name}
                onChange={(e) => updateAt(c.setSupplies, i, { name: e.target.value })}
                placeholder="Ej. Argolla"
              />
            </MiniField>
            <MiniField label="Cant./pieza">
              <NumberInput
                className="h-9"
                value={s.qty}
                onChange={(n) => updateAt(c.setSupplies, i, { qty: n })}
              />
            </MiniField>
            <MiniField label="Costo unitario">
              <NumberInput
                className="h-9"
                value={s.unitCost}
                onChange={(n) => updateAt(c.setSupplies, i, { unitCost: n })}
              />
            </MiniField>
            <div className="flex items-center gap-1">
              <div className="w-36">
                <CatalogSelect
                  items={c.catalogs.components.data}
                  onPick={(comp) =>
                    updateAt(c.setSupplies, i, {
                      name: comp.name,
                      // El catálogo guarda el PAQUETE; el motor usa la unidad.
                      unitCost: Number(comp.packagePrice) / comp.unitsPerPackage,
                    })
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => removeAt(c.setSupplies, i)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/60 hover:text-destructive"
                aria-label={`Quitar ${s.name || 'insumo'}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </LineGroup>
    </CostSection>
  );
}

/** 4. MÁQUINA Y ENERGÍA — desgaste, luz y las impresoras que trabajan a la vez. */
export function SectionMaquina() {
  const c = useCalculator();
  const r = c.result;
  return (
    <CostSection
      n={4}
      icon={Printer}
      title="Máquina y energía"
      hint="Desgaste del equipo y electricidad de la tanda."
      amount={r ? r.breakdown.wear + r.breakdown.power : undefined}
      action={
        <div className="flex items-center gap-2">
          {c.printerEnabled && (
            <div className="w-full sm:w-40">
              <CatalogSelect
                items={c.catalogs.printers.data}
                onPick={(p) =>
                  c.setPrinter((prev) => ({
                    ...prev,
                    name: p.name,
                    price: Number(p.price),
                    lifetimeHours: p.lifetimeHours,
                    powerKw: Number(p.powerKw),
                    maintPerHour: Number(p.maintPerHour),
                  }))
                }
              />
            </div>
          )}
          <Switch checked={c.printerEnabled} onChange={c.setPrinterEnabled} />
        </div>
      }
    >
      {c.printerEnabled ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Inversión en el equipo">
              <NumberInput
                value={c.printer.price}
                onChange={(n) => c.setPrinter((p) => ({ ...p, price: n }))}
              />
            </Field>
            <Field label="Vida útil (horas)">
              <NumberInput
                value={c.printer.lifetimeHours}
                onChange={(n) => c.setPrinter((p) => ({ ...p, lifetimeHours: n || 1 }))}
              />
            </Field>
            <Field label="Horas de la tanda" required>
              <NumberInput
                className={REQUIRED_INPUT}
                value={c.printer.hours}
                onChange={(n) => c.setPrinter((p) => ({ ...p, hours: n }))}
              />
            </Field>
            <Field label="Mantenimiento / hora" hint="Boquillas, correas.">
              <NumberInput
                value={c.printer.maintPerHour}
                onChange={(n) => c.setPrinter((p) => ({ ...p, maintPerHour: n }))}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Consumo (kW)">
              <NumberInput
                value={c.printer.powerKw}
                onChange={(n) => c.setPrinter((p) => ({ ...p, powerKw: n }))}
              />
            </Field>
            <Field label="Tarifa eléctrica / kWh">
              <NumberInput
                value={c.electricity.kwhPrice}
                onChange={(n) => c.setElectricity((e) => ({ ...e, kwhPrice: n }))}
                disabled={!c.electricity.enabled}
              />
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch
                  checked={c.electricity.enabled}
                  onChange={(v) => c.setElectricity((e) => ({ ...e, enabled: v }))}
                />
                <span className="text-muted-foreground">Cobrar la luz</span>
              </label>
            </div>
            <Field
              label="Impresoras en paralelo"
              hint="Solo acorta la entrega, no el costo."
            >
              <NumberInput
                min={1}
                value={c.parallelPrinters}
                onChange={(n) => c.setParallelPrinters(Math.max(1, Math.round(n)))}
              />
            </Field>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
          Sin impresora: no se cobra desgaste ni electricidad.
        </p>
      )}
    </CostSection>
  );
}

/** 5. TU TIEMPO — el postprocesado, la partida que más se olvida. */
export function SectionTiempo() {
  const c = useCalculator();
  return (
    <CostSection
      n={5}
      icon={Clock}
      title="Tu tiempo"
      hint="Lijar, pintar, armar. La partida que más se olvida."
      amount={c.result?.breakdown.labor}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Minutos por pieza">
          <NumberInput
            value={c.labor.minutes}
            onChange={(n) => c.setLabor((l) => ({ ...l, minutes: n }))}
          />
        </Field>
        <Field label="Valor de tu hora">
          <NumberInput
            value={c.labor.hourlyRate}
            onChange={(n) => c.setLabor((l) => ({ ...l, hourlyRate: n }))}
          />
        </Field>
      </div>
    </CostSection>
  );
}

/** 6. EMPAQUE Y OTROS. */
export function SectionExtras() {
  const c = useCalculator();
  return (
    <CostSection
      n={6}
      icon={Box}
      title="Empaque y otros"
      hint="El empaque va por pieza; “otros” es un cargo único del pedido."
      amount={c.result?.breakdown.extras}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Empaque por pieza">
          <NumberInput
            value={c.extras.packagingPerPiece}
            onChange={(n) => c.setExtras((e) => ({ ...e, packagingPerPiece: n }))}
          />
        </Field>
        <Field
          label="Otros (todo el pedido)"
          hint="Diseño, envío… se reparte entre las unidades."
        >
          <NumberInput
            value={c.extras.otherPerOrder}
            onChange={(n) => c.setExtras((e) => ({ ...e, otherPerOrder: n }))}
          />
        </Field>
      </div>
    </CostSection>
  );
}

const ROUNDING_OPTIONS: { value: string; label: string }[] = [
  { value: 'NONE|1', label: 'Sin redondeo' },
  { value: 'NEAREST|1', label: 'Al entero más cercano' },
  { value: 'NEAREST|0.5', label: 'A los 0,50 más cercanos' },
  { value: 'UP|1', label: 'Hacia arriba al entero' },
  { value: 'UP|0.5', label: 'Hacia arriba a 0,50' },
  { value: 'DOWN|1', label: 'Hacia abajo al entero' },
];

/** 7. MARGEN Y REDONDEO — de dónde sale el precio sugerido. */
export function SectionMargen() {
  const c = useCalculator();
  const value = `${c.roundingMode}|${c.roundingIncrement}`;
  const known = ROUNDING_OPTIONS.some((o) => o.value === value);
  return (
    <CostSection
      n={7}
      icon={Percent}
      title="Margen y redondeo"
      hint="Tu ganancia sobre el costo, y cómo se redondea el precio."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Margen objetivo (%)" hint="Ganancia sobre el costo: 100 % = el doble.">
          <NumberInput
            value={Math.round(c.markup * 1000) / 10}
            onChange={(n) => c.setMarkup(n / 100)}
          />
        </Field>
        <Field label="Tipo de redondeo">
          <Select
            value={known ? value : 'NONE|1'}
            onChange={(e) => {
              const [mode, inc] = e.target.value.split('|');
              c.setRoundingMode(mode as typeof c.roundingMode);
              c.setRoundingIncrement(Number(inc));
            }}
          >
            {ROUNDING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </CostSection>
  );
}

/** Las 7 secciones de entrada, en orden. */
export function CalculatorForm() {
  return (
    <div className="space-y-4">
      <SectionPieza />
      <SectionFilamento />
      <SectionInsumos />
      <SectionMaquina />
      <SectionTiempo />
      <SectionExtras />
      <SectionMargen />
    </div>
  );
}

export { CostSection };
