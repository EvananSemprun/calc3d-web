import { useEffect, useMemo, useState } from 'react';
import { Select } from '@/components/ui';
import { DateRangePicker, useDateRange, type RangePreset } from '@/features/finance/DateRange';
import { usePersistentState } from '@/lib/usePersistentState';
import { todayKey } from '@/lib/today';

/** Qué fecha del encargo se filtra. */
export type OrderDateField = 'deliveryDate' | 'createdAt';

const FIELD_LABELS: Record<OrderDateField, string> = {
  deliveryDate: 'Fecha de entrega',
  createdAt: 'Fecha de creación',
};

/** Los presets válidos: un valor guardado que no esté acá cae a "Todo". */
const PRESETS: RangePreset[] = [
  'TODAY',
  'YESTERDAY',
  'WEEK',
  'MONTH',
  'YEAR',
  'DAY',
  'RANGE',
  'ALL',
];

/** `AAAA-MM-DD`: lo que produce el filtro de rango. */
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Lo mínimo que necesita un encargo para poder filtrarse por fecha. */
export interface DatedOrder {
  deliveryDate: string | null;
  createdAt: string;
}

/**
 * El día de un encargo, como `AAAA-MM-DD`.
 *
 * ⚠️ Las dos fechas NO se leen igual (ver `lib/today.ts`):
 * - `deliveryDate` es un DÍA guardado a medianoche UTC → se corta en UTC; leerlo
 *   en la zona local devolvería el día anterior.
 * - `createdAt` es un INSTANTE real → se pasa al día LOCAL, que es el que ve
 *   quien mira la pantalla (en Venezuela, un encargo creado a las 21:00
 *   quedaría fechado mañana si se leyera en UTC).
 */
function dayOf(o: DatedOrder, field: OrderDateField): string | null {
  if (field === 'createdAt') return todayKey(new Date(o.createdAt));
  return o.deliveryDate ? o.deliveryDate.slice(0, 10) : null;
}

export interface OrdersDateFilter {
  field: OrderDateField;
  setField: (f: OrderDateField) => void;
  range: ReturnType<typeof useDateRange>;
  /** Encargos SIN fecha de entrega que el filtro está escondiendo (0 si no esconde nada). */
  undatedCount: number;
  showUndated: boolean;
  setShowUndated: (v: boolean) => void;
}

/**
 * Filtro de fecha de la pestaña Lista (y SOLO de ella: el calendario ya es una
 * vista por fecha y Por cobrar ordena por antigüedad).
 *
 * Arranca en "Todo" para que la pantalla abra igual que siempre, y el rango se
 * recuerda en localStorage. Un valor guardado que ya no sea válido cae a un
 * valor SEGURO ("Todo" / "Fecha de entrega"): si no, el select queda en blanco
 * y la lista vacía sin explicación.
 *
 * ⚠️ `deliveryDate` es opcional. Al filtrar por entrega, los encargos sin fecha
 * no pueden entrar en ningún rango, así que se esconden — pero nunca en
 * silencio: `undatedCount` alimenta el aviso clickeable.
 */
export function useOrdersDateFilter<T extends DatedOrder>(orders: T[]) {
  const [storedField, setField] = usePersistentState<OrderDateField>(
    'orders:dateField',
    'deliveryDate',
  );
  // Valor seguro: cualquier cosa que no sea "creación" es "entrega".
  const field: OrderDateField = storedField === 'createdAt' ? 'createdAt' : 'deliveryDate';
  const range = useDateRange('ALL', 'orders');
  const [showUndated, setShowUndated] = useState(false);

  // Valor seguro del preset guardado: si no es uno de los conocidos, "Todo".
  // (El hook ya devuelve from/to vacíos ante un preset raro, pero sin esto el
  // select quedaría en blanco mostrando un filtro que nadie puede leer.)
  useEffect(() => {
    if (!PRESETS.includes(range.preset)) range.setPreset('ALL');
  }, [range.preset, range.setPreset]);

  // Un rango guardado a mano podría traer basura: solo se aplica si es un día.
  const from = DAY_KEY.test(range.from ?? '') ? range.from : undefined;
  const to = DAY_KEY.test(range.to ?? '') ? range.to : undefined;
  const hasRange = !!(from || to);

  const rows = useMemo(() => {
    if (!hasRange) return orders;
    return orders.filter((o) => {
      const d = dayOf(o, field);
      if (!d) return showUndated; // sin fecha: solo si el usuario pidió verlos
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  }, [orders, field, from, to, hasRange, showUndated]);

  // El aviso solo aplica a la entrega: por creación siempre hay fecha.
  const undatedCount =
    field === 'deliveryDate' && hasRange ? orders.filter((o) => !o.deliveryDate).length : 0;

  return { rows, field, setField, range, undatedCount, showUndated, setShowUndated };
}

/**
 * El control: qué fecha + qué rango, AGRUPADOS en una sola caja para que se lean
 * como un control y no como dos filtros sueltos. Va dentro de `FilterBar`.
 */
export function OrdersDateFilterControl({ filter }: { filter: OrdersDateFilter }) {
  return (
    <div className="col-span-full flex w-full flex-col gap-2 rounded-lg border border-border/70 bg-card/50 p-2 sm:col-span-1 sm:w-auto sm:flex-row sm:items-center">
      <Select
        className="w-full sm:w-44"
        value={filter.field}
        onChange={(e) => filter.setField(e.target.value as OrderDateField)}
        aria-label="Qué fecha filtrar"
      >
        {(Object.keys(FIELD_LABELS) as OrderDateField[]).map((f) => (
          <option key={f} value={f}>
            {FIELD_LABELS[f]}
          </option>
        ))}
      </Select>
      <DateRangePicker range={filter.range} />
    </div>
  );
}

/**
 * «N encargos sin fecha de entrega» — clickeable. Nada puede desaparecer en
 * silencio: el encargo sin fecha no es un encargo que no exista.
 */
export function OrdersUndatedNotice({ filter }: { filter: OrdersDateFilter }) {
  if (filter.undatedCount === 0) return null;
  const n = filter.undatedCount;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      {filter.showUndated
        ? `Se ven también ${n} encargo(s) sin fecha de entrega, aunque el filtro sea por fecha.`
        : `${n} encargo(s) no tienen fecha de entrega: el filtro por entrega no los muestra.`}
      <button
        type="button"
        onClick={() => filter.setShowUndated(!filter.showUndated)}
        aria-pressed={filter.showUndated}
        className="font-medium text-foreground underline underline-offset-4"
      >
        {filter.showUndated ? 'Ocultarlos' : 'Mostrarlos'}
      </button>
    </p>
  );
}
