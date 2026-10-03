import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { orderTotal, type OrderLineDto } from '@calc3d/shared';
import { Button, Input, NumberInput } from '@/components/ui';
import { useMoney } from '@/features/settings/useSettings';

/** Línea nueva en blanco (la unidad por defecto del pedido es la pieza). */
export const EMPTY_ORDER_LINE: OrderLineDto = {
  description: '',
  quantity: 1,
  unit: 'u',
  unitPrice: 0,
};

/**
 * EDITOR DE ARTÍCULOS de un encargo — el mismo en todos los formularios que
 * tienen líneas de pedido.
 *
 * Tres cosas que antes no estaban:
 * - **Los inputs se anuncian.** Cantidad y precio eran dos `spinbutton` sin
 *   etiqueta, sin placeholder y sin `aria-label`: un lector de pantalla decía
 *   "spinbutton, spinbutton". Ahora cada uno dice qué es y de qué artículo.
 * - **Los encabezados van UNA vez** en escritorio (`Descripción · Cant. ·
 *   Precio · Subtotal`). Debajo de 640 px se apilan, y ahí un encabezado de
 *   columna no significa nada: cada artículo pasa a ser un bloque con sus
 *   propias etiquetas visibles (duplican el `aria-label`, así que van
 *   `aria-hidden` para que no se anuncien dos veces).
 * - **Subtotal por línea y TOTAL en vivo.** Antes se creaba un encargo sin ver
 *   cuánto sumaba.
 */
export function OrderLinesEditor({
  lines,
  onChange,
  currencyLabel,
  extra,
}: {
  lines: OrderLineDto[];
  onChange: (lines: OrderLineDto[]) => void;
  /** Moneda elegida del documento: muestra el equivalente del total. */
  currencyLabel?: string | null;
  /** Acción propia del formulario al lado del título (p. ej. "+ Desde productos"). */
  extra?: ReactNode;
}) {
  const { money, moneyInRate, rateByLabel } = useMoney();

  const setLine = (i: number, patch: Partial<OrderLineDto>) =>
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => onChange(lines.filter((_, idx) => idx !== i));

  // El total se calcula con el MISMO helper del motor que usa el backend, para
  // que lo que se ve al crear sea lo que después muestra el encargo.
  // `unit` del DTO admite null y el helper no: solo hacen falta los tres campos.
  const total = orderTotal(
    lines.map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
  );
  const rate = rateByLabel(currencyLabel);

  // Escritorio: descripción elástica + tres columnas angostas + el tacho.
  const cols = 'sm:grid-cols-[minmax(0,1fr)_3.75rem_5rem_4rem_1.5rem]';

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Artículos
        </p>
        {extra}
      </div>

      {/* Encabezados: una sola vez, y solo cuando las columnas existen. */}
      <div
        aria-hidden
        className={`hidden gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid ${cols}`}
      >
        <span>Descripción</span>
        <span className="text-right">Cant.</span>
        <span className="text-right">Precio</span>
        <span className="text-right">Subtotal</span>
        <span />
      </div>

      <div className="space-y-2 sm:space-y-1.5">
        {lines.map((l, i) => {
          const subtotal = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
          const n = i + 1;
          return (
            <div
              key={i}
              className={`grid grid-cols-2 items-end gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 sm:items-center sm:gap-1.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 ${cols}`}
            >
              <div className="col-span-2 space-y-1 sm:col-span-1 sm:space-y-0">
                <span aria-hidden className="block text-xs text-muted-foreground sm:hidden">
                  Descripción
                </span>
                <Input
                  placeholder="Descripción"
                  aria-label={`Descripción del artículo ${n}`}
                  value={l.description}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                />
              </div>
              <div className="space-y-1 sm:space-y-0">
                <span aria-hidden className="block text-xs text-muted-foreground sm:hidden">
                  Cantidad
                </span>
                <NumberInput
                  aria-label={`Cantidad del artículo ${n}`}
                  value={l.quantity}
                  onChange={(v) => setLine(i, { quantity: v })}
                />
              </div>
              <div className="space-y-1 sm:space-y-0">
                <span aria-hidden className="block text-xs text-muted-foreground sm:hidden">
                  Precio
                </span>
                <NumberInput
                  step="0.01"
                  aria-label={`Precio unitario del artículo ${n}`}
                  value={l.unitPrice}
                  onChange={(v) => setLine(i, { unitPrice: v })}
                />
              </div>
              <div className="space-y-1 sm:space-y-0">
                <span aria-hidden className="block text-xs text-muted-foreground sm:hidden">
                  Subtotal
                </span>
                {/* Derivado, no editable: cantidad × precio. */}
                <p className="tabular truncate text-sm font-medium sm:text-right" title={money(subtotal)}>
                  {money(subtotal)}
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar el artículo ${n}`}
                  onClick={() => removeLine(i)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
        <Button variant="outline" size="sm" onClick={() => onChange([...lines, { ...EMPTY_ORDER_LINE }])}>
          <Plus className="h-4 w-4" /> Artículo
        </Button>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Total del encargo
          </p>
          <p className="tabular text-lg font-bold text-brand-yellow-ink">{money(total)}</p>
          {rate && (
            <p className="tabular text-xs text-muted-foreground">
              ≈ {moneyInRate(total, rate.rate, rate.currencyCode)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
