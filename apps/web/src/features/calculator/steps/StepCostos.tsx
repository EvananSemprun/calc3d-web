import { Printer, Wrench, Zap, AlertTriangle, Trash2, Sparkles } from 'lucide-react';
import type { WasteCategory } from '@calc3d/shared';
import { Button, Checkbox, Input, NumberInput, Section, Select, Switch } from '@/components/ui';
import { removeAt, updateAt, useCalculator } from '@/features/calculator/CalculatorProvider';
import { CatalogSelect, LineGroup, MiniField } from '@/features/calculator/parts';

const WASTE_CATS: { value: WasteCategory; label: string }[] = [
  { value: 'MATERIAL', label: 'Material' },
  { value: 'WEAR', label: 'Desgaste' },
  { value: 'POWER', label: 'Luz' },
  // Los insumos (componentes + empaque) se calculan en la categoría PACKAGING.
  { value: 'PACKAGING', label: 'Insumos' },
  { value: 'LABOR', label: 'Mano de obra' },
];

/** Niveles de riesgo de merma (presets). El campo "personalizado" acepta cualquier valor. */
const RISK_LEVELS = [
  { key: 'BAJO', label: 'Bajo', hint: 'trabajo dominado', pct: 0.08 },
  { key: 'MEDIO', label: 'Medio', hint: '', pct: 0.15 },
  { key: 'ALTO', label: 'Alto', hint: 'material nuevo / nocturno', pct: 0.3 },
] as const;

/**
 * Paso 3: tres bloques compactos — "Costo de la máquina", "Riesgo y merma" y
 * "Extras de venta". Los datos de producción (tandas, gramos/horas totales) NO se
 * repiten aquí: ya se capturan en el paso 1 y se resumen en el paso final.
 */
export function StepCostos() {
  const c = useCalculator();
  return (
    <div className="space-y-7">
      {/* ═══ Bloque 1 · Costo de la máquina ═══ */}
      <Section
        icon={Printer}
        title="Costo de la máquina"
        description="Lo que te cuesta tener la impresora corriendo: desgaste y electricidad."
        action={<Switch checked={c.printerEnabled} onChange={c.setPrinterEnabled} label="Incluir" />}
      >
        {c.printerEnabled && (
          <div className="space-y-4">
            <CatalogSelect
              items={c.catalogs.printers.data}
              onPick={(item) =>
                c.setPrinter((p) => ({
                  ...p,
                  name: item.name,
                  price: Number(item.price),
                  lifetimeHours: item.lifetimeHours,
                  powerKw: Number(item.powerKw),
                  maintPerHour: Number(item.maintPerHour),
                }))
              }
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniField label="Precio de la impresora">
                <NumberInput step="0.01" value={c.printer.price} onChange={(v) => c.setPrinter({ ...c.printer, price: v })} />
              </MiniField>
              <MiniField label="Vida útil (horas)">
                <NumberInput value={c.printer.lifetimeHours} onChange={(v) => c.setPrinter({ ...c.printer, lifetimeHours: v })} />
              </MiniField>
              <MiniField label="Potencia (kW)">
                <NumberInput step="0.01" value={c.printer.powerKw} onChange={(v) => c.setPrinter({ ...c.printer, powerKw: v })} />
              </MiniField>
              <MiniField label="Mantenimiento/hora">
                <NumberInput step="0.01" value={c.printer.maintPerHour} onChange={(v) => c.setPrinter({ ...c.printer, maintPerHour: v })} />
              </MiniField>
            </div>

            <div className="flex flex-wrap items-center gap-4 border-t border-border pt-3">
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4" /> Electricidad
              </span>
              <Switch
                checked={c.electricity.enabled}
                onChange={(v) => c.setElectricity({ ...c.electricity, enabled: v })}
                label="Contar luz"
              />
              {c.electricity.enabled && (
                <div className="w-40">
                  <MiniField label="Precio del kWh">
                    <NumberInput step="0.01" value={c.electricity.kwhPrice} onChange={(v) => c.setElectricity({ ...c.electricity, kwhPrice: v })} />
                  </MiniField>
                </div>
              )}
              <div className="w-44 sm:ml-auto">
                <MiniField label="Arranque por tanda">
                  <NumberInput step="0.01" value={c.setupCost} onChange={c.setSetupCost} />
                </MiniField>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              El arranque es lo que cuesta preparar la placa en cada tanda. Solo suma si el trabajo necesita varias tandas.
            </p>
          </div>
        )}
      </Section>

      {/* ═══ Bloque 2 · Riesgo y merma ═══ */}
      <Section
        icon={AlertTriangle}
        title="Riesgo y merma"
        description="Un colchón sobre el costo para cubrir las impresiones que salen mal. Elige el riesgo del trabajo."
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {RISK_LEVELS.map((r) => (
              <Button
                key={r.key}
                variant={Math.abs(c.waste.pct - r.pct) < 1e-9 ? 'accent' : 'outline'}
                size="sm"
                onClick={() => c.setWaste((w) => ({ ...w, pct: r.pct }))}
                title={r.hint || undefined}
              >
                {r.label} · {Math.round(r.pct * 100)}%
              </Button>
            ))}
            <div className="w-40">
              <MiniField label="Otro (0.08 = 8 %)">
                <NumberInput step="0.01" value={c.waste.pct} onChange={(v) => c.setWaste({ ...c.waste, pct: v })} />
              </MiniField>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm text-muted-foreground">¿A qué se le aplica la merma?</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {WASTE_CATS.map((cat) => (
                <Checkbox
                  key={cat.value}
                  label={cat.label}
                  checked={c.waste.appliesTo.includes(cat.value)}
                  onChange={(on) =>
                    c.setWaste((w) => ({
                      ...w,
                      appliesTo: on ? [...w.appliesTo, cat.value] : w.appliesTo.filter((x) => x !== cat.value),
                    }))
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ═══ Bloque 3 · Extras de venta ═══ */}
      <Section
        icon={Sparkles}
        title="Extras de venta"
        description="Tu tiempo de trabajo y cobros adicionales. Opcionales."
      >
        <div className="space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Wrench className="h-4 w-4 text-muted-foreground" /> Mano de obra
              <span className="text-xs font-normal text-muted-foreground">— diseño, lijado, pintado, ensamble…</span>
            </div>
            <LineGroup
              title="Tareas"
              empty="Sin mano de obra."
              onAdd={() => c.setLabor((l) => [...l, { name: '', hourlyRate: 0, hours: 0, scope: 'PER_PIECE' }])}
            >
              {c.labor.map((l, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-end">
                    <Button variant="ghost" size="icon" onClick={() => removeAt(c.setLabor, i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <MiniField label="Tarea">
                      <Input value={l.name} onChange={(e) => updateAt(c.setLabor, i, { name: e.target.value })} />
                    </MiniField>
                    <MiniField label="Tarifa/hora">
                      <NumberInput step="0.01" value={l.hourlyRate} onChange={(v) => updateAt(c.setLabor, i, { hourlyRate: v })} />
                    </MiniField>
                    <MiniField label="Horas">
                      <NumberInput step="0.1" value={l.hours} onChange={(v) => updateAt(c.setLabor, i, { hours: v })} />
                    </MiniField>
                    <MiniField label="Aplica">
                      <Select
                        value={l.scope}
                        onChange={(e) => updateAt(c.setLabor, i, { scope: e.target.value as 'PER_PIECE' | 'PER_ORDER' })}
                      >
                        <option value="PER_PIECE">Por pieza</option>
                        <option value="PER_ORDER">Por pedido</option>
                      </Select>
                    </MiniField>
                  </div>
                </div>
              ))}
            </LineGroup>
          </div>

          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <div>
              <MiniField label="Tarifa de diseño (única)">
                <NumberInput step="0.01" value={c.designFee} onChange={c.setDesignFee} />
              </MiniField>
              <p className="mt-1 text-xs text-muted-foreground">Cobro único, repartido entre las piezas.</p>
            </div>
            <div>
              <MiniField label="Recargo por urgencia (0.5 = 50 %)">
                <NumberInput step="0.05" value={c.rushPct} onChange={c.setRushPct} />
              </MiniField>
              <p className="mt-1 text-xs text-muted-foreground">Se suma sobre el precio final de venta.</p>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
