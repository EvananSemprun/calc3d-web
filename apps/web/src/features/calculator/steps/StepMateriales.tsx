import { Boxes, Puzzle, Trash2 } from 'lucide-react';
import { Button, Input, NumberInput, REQUIRED_INPUT, Section, Select } from '@/components/ui';
import { removeAt, updateAt, useCalculator } from '@/features/calculator/CalculatorProvider';
import { useMoney } from '@/features/settings/useSettings';
import { CatalogSelect, LineGroup, MiniField } from '@/features/calculator/parts';

export function StepMateriales() {
  const c = useCalculator();
  const { money } = useMoney();
  const r = c.result;
  // Material de UNA impresión (tanda): el material del pedido ÷ el multiplicador de tandas.
  const matPerTanda =
    r && r.production ? (r.breakdown.material * r.production.piecesPerBatch) / r.quantity : (r?.breakdown.material ?? 0);

  return (
    <div className="space-y-7">
      {r && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-brand-blue/30 bg-brand-blue/[0.05] p-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Material por impresión
            </div>
            <div className="tabular mt-1 font-display text-xl font-bold">{money(matPerTanda)}</div>
            <div className="text-xs text-muted-foreground">costo del filamento en una tanda</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Costo estimado por pieza
            </div>
            <div className="tabular mt-1 font-display text-xl font-bold text-brand-yellow-ink">
              {money(r.costPerUnit)}
            </div>
            <div className="text-xs text-muted-foreground">incluye todo lo cargado hasta ahora</div>
          </div>
        </div>
      )}
      <Section
        icon={Boxes}
        title="Materiales (filamento)"
        description="Elige el filamento y su precio. Los gramos que muestra el slicer (de una impresión) ya los pusiste en el primer paso; solo se reparten aquí si usas varios filamentos."
      >
        <LineGroup
          title="Filamentos"
          onAdd={() => c.setMaterials((m) => [...m, { name: '', rollPrice: 0, rollGrams: 1000, grams: 0 }])}
        >
          {c.materials.map((m, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <CatalogSelect
                  items={c.catalogs.materials.data}
                  onPick={(item) =>
                    updateAt(c.setMaterials, i, {
                      name: item.name,
                      rollPrice: Number(item.rollPrice),
                      rollGrams: item.rollGrams,
                    })
                  }
                />
                <Button variant="ghost" size="icon" onClick={() => removeAt(c.setMaterials, i)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <MiniField label="Nombre">
                  <Input value={m.name} onChange={(e) => updateAt(c.setMaterials, i, { name: e.target.value })} />
                </MiniField>
                <MiniField label="Precio rollo">
                  <NumberInput
                    step="0.01"
                    value={m.rollPrice}
                    onChange={(v) => updateAt(c.setMaterials, i, { rollPrice: v })}
                  />
                </MiniField>
                <MiniField label="Gramos rollo">
                  <NumberInput value={m.rollGrams} onChange={(v) => updateAt(c.setMaterials, i, { rollGrams: v })} />
                </MiniField>
                {/* Los gramos totales se ponen en el paso 1; aquí solo aparecen
                    cuando hay varios filamentos, para repartir el total. */}
                {c.materials.length > 1 && (
                  <MiniField label="Gramos de este filamento (lote)" required>
                    <NumberInput
                      step="0.1"
                      className={REQUIRED_INPUT}
                      value={m.grams}
                      onChange={(v) => updateAt(c.setMaterials, i, { grams: v })}
                    />
                  </MiniField>
                )}
              </div>
            </div>
          ))}
        </LineGroup>
      </Section>

      <Section
        icon={Puzzle}
        title="Insumos"
        description="Accesorios y empaques comprados por paquete (argollas, imanes, bolsas, cajas…). Por pieza o por pedido."
      >
        <LineGroup
          title="Insumos"
          empty="Sin insumos. Agrégalos si la pieza lleva accesorios o empaque."
          onAdd={() =>
            c.setInsumos((x) => [
              ...x,
              {
                name: '',
                packagePrice: 0,
                unitsPerPackage: 100,
                unitsPerPiece: 1,
                scope: 'PER_PIECE',
                prorationMode: c.proration,
              },
            ])
          }
        >
          {c.insumos.map((p, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <CatalogSelect
                  items={c.catalogs.components.data}
                  onPick={(item) =>
                    updateAt(c.setInsumos, i, {
                      name: item.name,
                      packagePrice: Number(item.packagePrice),
                      unitsPerPackage: item.unitsPerPackage,
                      scope: item.scope,
                    })
                  }
                />
                <Button variant="ghost" size="icon" onClick={() => removeAt(c.setInsumos, i)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniField label="Nombre">
                  <Input value={p.name} onChange={(e) => updateAt(c.setInsumos, i, { name: e.target.value })} />
                </MiniField>
                <MiniField label="Precio paq.">
                  <NumberInput
                    step="0.01"
                    value={p.packagePrice}
                    onChange={(v) => updateAt(c.setInsumos, i, { packagePrice: v })}
                  />
                </MiniField>
                <MiniField label="Uds/paquete">
                  <NumberInput
                    value={p.unitsPerPackage}
                    onChange={(v) => updateAt(c.setInsumos, i, { unitsPerPackage: v })}
                  />
                </MiniField>
                <MiniField label="Uds/pieza">
                  <NumberInput
                    value={p.unitsPerPiece}
                    onChange={(v) => updateAt(c.setInsumos, i, { unitsPerPiece: v })}
                  />
                </MiniField>
                <MiniField label="Aplica">
                  <Select
                    value={p.scope}
                    onChange={(e) => updateAt(c.setInsumos, i, { scope: e.target.value as 'PER_PIECE' | 'PER_ORDER' })}
                  >
                    <option value="PER_PIECE">Por pieza</option>
                    <option value="PER_ORDER">Por pedido</option>
                  </Select>
                </MiniField>
                <MiniField label="Prorrateo">
                  <Select
                    value={p.prorationMode}
                    onChange={(e) =>
                      updateAt(c.setInsumos, i, { prorationMode: e.target.value as 'USED' | 'FULL_PACKAGE' })
                    }
                  >
                    <option value="FULL_PACKAGE">Paquete completo</option>
                    <option value="USED">Solo usadas</option>
                  </Select>
                </MiniField>
              </div>
            </div>
          ))}
        </LineGroup>
      </Section>
    </div>
  );
}
