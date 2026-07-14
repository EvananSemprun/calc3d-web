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
      case 'MONTH': {
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { from: iso(first), to: iso(last) };
      }
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
    <div className="flex flex-wrap items-center gap-2">
      <Select
        className="w-44"
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
          className="w-44"
          value={range.day}
          onChange={(e) => range.setDay(e.target.value)}
        />
      )}
      {range.preset === 'RANGE' && (
        <>
          <Input
            type="date"
            className="w-40"
            value={range.customFrom}
            onChange={(e) => range.setCustomFrom(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">a</span>
          <Input
            type="date"
            className="w-40"
            value={range.customTo}
            onChange={(e) => range.setCustomTo(e.target.value)}
          />
        </>
      )}
    </div>
  );
}
