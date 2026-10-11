import * as React from 'react';
import { Input, Select } from '@/components/ui';
import { usePersistentState } from '@/lib/usePersistentState';

export type RangePreset =
  | 'TODAY'
  | 'YESTERDAY'
  | 'WEEK'
  | 'MONTH'
  | 'YEAR'
  | 'DAY'
  | 'RANGE'
  | 'ALL';

const PRESET_LABELS: Record<RangePreset, string> = {
  TODAY: 'Hoy',
  YESTERDAY: 'Ayer',
  WEEK: 'Esta semana',
  MONTH: 'Este mes',
  YEAR: 'Este año',
  DAY: 'Día específico',
  RANGE: 'Rango de fechas',
  ALL: 'Todo',
};

/** Fecha local a `yyyy-mm-dd` (sin desfase de zona horaria). */
function iso(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

/**
 * El rango de un mes `AAAA-MM`: su primer y su ÚLTIMO día REALES.
 *
 * ⚠️ El Dashboard lo armaba a mano como `${mes}-01` .. `${mes}-31`, y el 31
 * **no existe en cinco meses del año**. La API hace
 * `new Date(`${to}T23:59:59.999Z`)`, así que `2026-02-31` se corría al **3 de
 * marzo**: la tarjeta del punto de equilibrio contaba hasta tres días del mes
 * siguiente como ingresos "del mes", con un número que seguía siendo
 * plausible. Y desde que `RangoQuerySchema` valida el calendario, ese `-31` es
 * directamente un **400**.
 *
 * ⚠️ El día 0 del mes siguiente ES el último del mes pedido: es el mismo
 * truco que ya usaba el preset "Este mes", y por eso ese preset ahora llama
 * acá. Dos definiciones del rango de un mes terminan diciendo dos cosas.
 */
export function rangoDeMes(mes: string): { from: string; to: string } {
  const [anio, m] = mes.split('-').map(Number);
  return { from: iso(new Date(anio, m - 1, 1)), to: iso(new Date(anio, m, 0)) };
}

/**
 * El rango de un AÑO entero, de enero a diciembre.
 *
 * ⚠️ **Sale de `rangoDeMes`, no de `${anio}-01-01`..`${anio}-12-31` escrito a
 * mano** (2026-10-11). El literal no estaba mal —diciembre tiene 31 días
 * siempre—, y por eso justamente es peligroso: funciona, así que invita a
 * copiarlo para "el rango de marzo" o "el del trimestre", donde el 31 no
 * existe. Es exactamente el camino por el que el punto de equilibrio terminó
 * contando tres días de marzo como ingresos de febrero.
 *
 * Con esto queda **una sola definición** de dónde empieza y dónde termina un
 * periodo en este panel.
 */
export function rangoDeAnio(anio: number): { from: string; to: string } {
  return { from: rangoDeMes(`${anio}-01`).from, to: rangoDeMes(`${anio}-12`).to };
}

export interface DateRange {
  preset: RangePreset;
  from?: string;
  to?: string;
}

/**
 * Calcula [from, to] (ISO `yyyy-mm-dd`) del preset; `undefined` = sin límite.
 * `persistKey` (opcional) recuerda el filtro en localStorage al volver a la página.
 */
export function useDateRange(initial: RangePreset = 'MONTH', persistKey?: string) {
  const k = (s: string) => (persistKey ? `daterange:${persistKey}:${s}` : null);
  const [preset, setPreset] = usePersistentState<RangePreset>(k('preset'), initial);
  const [customFrom, setCustomFrom] = usePersistentState(k('from'), '');
  const [customTo, setCustomTo] = usePersistentState(k('to'), '');
  const [day, setDay] = usePersistentState(k('day'), iso(new Date()));

  const { from, to } = React.useMemo(() => {
    const now = new Date();
    const startOfDay = (d: Date) => iso(d);
    switch (preset) {
      case 'TODAY':
        return { from: startOfDay(now), to: startOfDay(now) };
      case 'YESTERDAY': {
        const y = new Date(now);
        y.setDate(y.getDate() - 1);
        return { from: startOfDay(y), to: startOfDay(y) };
      }
      case 'WEEK': {
        const d = new Date(now);
        const dow = (d.getDay() + 6) % 7; // lunes = 0
        const monday = new Date(d);
        monday.setDate(d.getDate() - dow);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { from: iso(monday), to: iso(sunday) };
      }
      case 'MONTH':
        // La MISMA definicion que usa el Dashboard para "el mes en curso".
        return rangoDeMes(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
      case 'YEAR':
        return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(new Date(now.getFullYear(), 11, 31)) };
      case 'DAY':
        return { from: day, to: day };
      case 'RANGE':
        return { from: customFrom || undefined, to: customTo || undefined };
      case 'ALL':
      default:
        return { from: undefined, to: undefined };
    }
  }, [preset, customFrom, customTo, day]);

  return {
    preset,
    setPreset,
    from,
    to,
    customFrom,
    setCustomFrom,
    customTo,
    setCustomTo,
    day,
    setDay,
  };
}

export function DateRangePicker({ range }: { range: ReturnType<typeof useDateRange> }) {
  return (
    // En el teléfono cada control ocupa el ancho disponible (y el rango, las dos
    // fechas repartidas en una fila); desde `sm` vuelven a su ancho fijo en línea.
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <Select
        className="w-full sm:w-44"
        value={range.preset}
        onChange={(e) => range.setPreset(e.target.value as RangePreset)}
      >
        {(Object.keys(PRESET_LABELS) as RangePreset[]).map((p) => (
          <option key={p} value={p}>
            {PRESET_LABELS[p]}
          </option>
        ))}
      </Select>
      {range.preset === 'DAY' && (
        <Input
          type="date"
          className="w-full sm:w-44"
          value={range.day}
          onChange={(e) => range.setDay(e.target.value)}
        />
      )}
      {range.preset === 'RANGE' && (
        <>
          <Input
            type="date"
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            value={range.customFrom}
            onChange={(e) => range.setCustomFrom(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">a</span>
          <Input
            type="date"
            className="min-w-0 flex-1 sm:w-40 sm:flex-none"
            value={range.customTo}
            onChange={(e) => range.setCustomTo(e.target.value)}
          />
        </>
      )}
    </div>
  );
}
