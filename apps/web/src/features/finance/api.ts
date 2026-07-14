import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DateRange } from '@/features/finance/DateRange';

export interface SaleRow {
  id: string;
  date: string;
  amount: number;
  kind: 'COUNTER' | 'ENCARGO';
  note?: string | null;
  clientId?: string | null;
  quoteId?: string | null;
  client?: { id: string; name: string } | null;
}

export interface ExpenseLink {
  id: string;
  name: string;
}

export interface ExpenseRow {
  id: string;
  date: string;
  category: 'EQUIPMENT' | 'CONSUMABLE' | 'MAINTENANCE' | 'SHIPPING' | 'OTHER' | 'ADVERTISING';
  description: string;
  amount: number;
  isInvestment: boolean;
  quantity?: number | null;
  endDate?: string | null;
  materialId?: string | null;
  printerId?: string | null;
  componentId?: string | null;
  providerId?: string | null;
  material?: ExpenseLink | null;
  printer?: ExpenseLink | null;
  component?: ExpenseLink | null;
  provider?: ExpenseLink | null;
}

/** Tipo de recurso al que se enlaza un gasto (o ninguno). */
export type LinkKind = 'material' | 'printer' | 'component' | null;

/** Devuelve el recurso enlazado de un gasto (tipo + nombre), o null. */
export function expenseLink(e: ExpenseRow): { kind: Exclude<LinkKind, null>; name: string } | null {
  if (e.material) return { kind: 'material', name: e.material.name };
  if (e.printer) return { kind: 'printer', name: e.printer.name };
  if (e.component) return { kind: 'component', name: e.component.name };
  return null;
}

/** Los Decimal de Prisma llegan como string en JSON: hay que convertir a número. */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function params(range: Pick<DateRange, 'from' | 'to'>) {
  const p: Record<string, string> = {};
  if (range.from) p.from = range.from;
  if (range.to) p.to = range.to;
  return p;
}

export function useSales(range: Pick<DateRange, 'from' | 'to'>) {
  return useQuery({
    queryKey: ['sales', range.from ?? null, range.to ?? null],
    queryFn: async () => {
      const { data } = await api.get<SaleRow[]>('/sales', { params: params(range) });
      return data.map((s) => ({ ...s, amount: num(s.amount) }));
    },
  });
}

export function useExpenses(range: Pick<DateRange, 'from' | 'to'>) {
  return useQuery({
    queryKey: ['expenses', range.from ?? null, range.to ?? null],
    queryFn: async () => {
      const { data } = await api.get<ExpenseRow[]>('/expenses', { params: params(range) });
      return data.map((e) => ({ ...e, amount: num(e.amount) }));
    },
  });
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseRow['category'], string> = {
  EQUIPMENT: 'Equipo',
  CONSUMABLE: 'Consumible',
  MAINTENANCE: 'Mantenimiento',
  SHIPPING: 'Envío',
  OTHER: 'Otro',
  ADVERTISING: 'Publicidad',
};

export const LINK_KIND_LABELS: Record<Exclude<LinkKind, null>, string> = {
  material: 'Filamento',
  printer: 'Impresora',
  component: 'Insumo',
};

export const SALE_KIND_LABELS: Record<SaleRow['kind'], string> = {
  COUNTER: 'Mostrador',
  ENCARGO: 'Encargo',
};
