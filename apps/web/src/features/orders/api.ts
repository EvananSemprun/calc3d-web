import { useQuery } from '@tanstack/react-query';
import type { OrderLineDto, OrderStatusDto } from '@calc3d/shared';
import { api } from '@/lib/api';

export interface Payment {
  id: string;
  date: string;
  amount: number;
  note: string | null;
  /** Tasa congelada al pagar (Bs por USD) + su moneda/nombre. Null si el pedido es solo USD.
   *  Los Decimal de Prisma llegan como string; se convierten con Number() al usarlos. */
  rate?: string | number | null;
  currencyCode?: string | null;
  currencyLabel?: string | null;
}

export interface OrderClient {
  id: string;
  name: string;
  phone?: string | null;
  rif?: string | null;
  address?: string | null;
}

export interface Order {
  id: string;
  code: number;
  clientId: string;
  client: OrderClient;
  deliveryDate: string | null;
  status: OrderStatusDto;
  notes: string | null;
  lines: OrderLineDto[];
  currencyLabel?: string | null;
  exchangeRates?: Record<string, { rate: number; source: string; at: string; label?: string }> | null;
  /** Cerrado en Bs: null = Bs en vivo; fecha = Bs congelados desde ese momento. */
  settledAt?: string | null;
  /** Qué máquina lo imprimió (atribuye los fallos, no las horas). */
  printerId?: string | null;
  /** 0 es un dato (se imprimió sin fallas); null es "no se midió". */
  reprints?: number | null;
  payments: Payment[];
  createdAt: string;
  updatedAt: string;
  // Derivados por el backend:
  total: number;
  paid: number;
  balance: number;
}

/** Etiquetas y color de cada estado del pedido. */
export const ORDER_STATUS: Record<OrderStatusDto, { label: string; tone: string }> = {
  QUOTED: { label: 'Cotizado', tone: 'text-muted-foreground' },
  CONFIRMED: { label: 'Confirmado', tone: 'text-brand-blue-bright' },
  IN_PRODUCTION: { label: 'En producción', tone: 'text-brand-yellow-ink' },
  READY: { label: 'Listo', tone: 'text-brand-yellow-ink' },
  DELIVERED: { label: 'Entregado', tone: 'text-success' },
  CANCELLED: { label: 'Cancelado', tone: 'text-destructive' },
};

export const ORDER_STATUS_OPTIONS = Object.entries(ORDER_STATUS).map(([value, v]) => ({
  value: value as OrderStatusDto,
  label: v.label,
}));

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: async () => (await api.get<Order[]>('/orders')).data,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: async () => (await api.get<Order>(`/orders/${id}`)).data,
    enabled: !!id,
  });
}

/** Abonos de pedidos en un rango de fechas (para el dashboard de caja). */
export function useOrderPayments(range: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['order-payments', range.from ?? null, range.to ?? null],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (range.from) params.from = range.from;
      if (range.to) params.to = range.to;
      const { data } = await api.get<{ date: string; amount: unknown }[]>('/orders/payments', { params });
      return data.map((p) => ({ date: p.date, amount: Number(p.amount) || 0 }));
    },
  });
}
