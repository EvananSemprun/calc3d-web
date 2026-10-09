import { useMemo, useState } from 'react';
import { Pencil, Plus, ShoppingCart } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardContent, EmptyState, FilterBar, Select, Stat, TableSkeleton } from '@/components/ui';
import { ExpenseModal } from '@/features/finance/ExpenseModal';
import { EditarCompra } from '@/features/filament/EditarCompra';
import { Tooltip } from '@/components/overlays';
import type { FilamentPurchase } from '@calc3d/shared';
import { useMoney } from '@/features/settings/useSettings';
import { DateRangePicker, useDateRange } from '@/features/finance/DateRange';
import { usePersistentState } from '@/lib/usePersistentState';
import { uniqueSorted } from '@/lib/utils';
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
  // La compra se registra ACÁ, que es donde está la lista. Antes había que ir a
  // Gastos y volver a decir "filamento", un dato que esta pantalla ya sabe.
  const [registrando, setRegistrando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState<FilamentPurchase | null>(null);
  const qc = useQueryClient();
  const { money } = useMoney();
  const [materialF, setMaterialF] = usePersistentState('filament:purchases:material', '');
  const [proveedorF, setProveedorF] = usePersistentState('filament:purchases:provider', '');
  const { data: compras = [], isLoading } = useFilamentPurchases(range);

  // Las opciones salen de las compras del rango: un valor guardado que no está cae a "todos".
  const materiales = useMemo(() => uniqueSorted(compras.map((c) => c.materialName)), [compras]);
  const proveedores = useMemo(() => uniqueSorted(compras.map((c) => c.providerName)), [compras]);
  const materialSeguro = materiales.includes(materialF) ? materialF : '';
  const proveedorSeguro = proveedores.includes(proveedorF) ? proveedorF : '';
  const filtradas = useMemo(
    () =>
      compras.filter(
        (c) =>
          (!materialSeguro || c.materialName === materialSeguro) &&
          (!proveedorSeguro || c.providerName === proveedorSeguro),
      ),
    [compras, materialSeguro, proveedorSeguro],
  );

  const rollos = filtradas.reduce((s, c) => s + c.quantity, 0);
  const invertido = filtradas.reduce((s, c) => s + c.amount, 0);
  const promedio = rollos > 0 ? invertido / rollos : 0;

  return (
    <div className="space-y-5">
      <FilterBar className="sm:justify-between">
        <div className="col-span-full sm:col-span-1">
          <DateRangePicker range={range} />
        </div>
        <Select className="w-full sm:w-56" value={materialSeguro} onChange={(e) => setMaterialF(e.target.value)}>
          <option value="">Filamento: todos</option>
          {materiales.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Select className="w-full sm:w-48" value={proveedorSeguro} onChange={(e) => setProveedorF(e.target.value)}>
          <option value="">Proveedor: todos</option>
          {proveedores.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Button
          variant="accent"
          className="col-span-full w-full sm:ml-auto sm:w-auto"
          onClick={() => setRegistrando(true)}
        >
          <Plus className="h-4 w-4" /> Registrar compra
        </Button>
      </FilterBar>

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
              ? 'Todavía no registraste ninguna. Usá "Registrar compra" acá arriba.'
              : 'Ninguna compra coincide con los filtros.'
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
                    <th className="p-3" />
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
                      <td className="p-3 text-right">
                        <Tooltip label="Corregir esta compra">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Corregir la compra de ${c.materialName ?? 'filamento'} del ${fecha(c.date)}`}
                            onClick={() => setCorrigiendo(c)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Tooltip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil: tarjetas apiladas. */}
            <div className="divide-y divide-border/50 md:hidden">
              {filtradas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCorrigiendo(c)}
                  className="w-full space-y-1 p-4 text-left transition-colors hover:bg-brand-blue/10"
                  aria-label={`Corregir la compra de ${c.materialName ?? 'filamento'} del ${fecha(c.date)}`}
                >
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
                  <span className="flex items-center gap-1 text-xs text-brand-blue-bright">
                    <Pencil className="h-3 w-3" /> Tocá para corregir
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {corrigiendo && (
        <EditarCompra compra={corrigiendo} onClose={() => setCorrigiendo(null)} />
      )}
      {registrando && (
        <ExpenseModal
          tipoFijo="filament"
          onClose={() => setRegistrando(false)}
          onSaved={() => {
            setRegistrando(false);
            qc.invalidateQueries({ queryKey: ['expenses'] });
          }}
        />
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
