import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentReportCreateDto, PlanState, PaymentReviewDto } from '@calc3d/shared';
import { api } from '@/lib/api';

export interface PaymentReport {
  id: string;
  plan: 'TALLER' | 'PRO';
  months: number;
  method: string;
  reference: string;
  amount: number;
  currency: string;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote: string | null;
  createdAt: string;
}

export interface PlanResponse {
  status: PlanState | null;
  reports: PaymentReport[];
}

export const PLAN_LABEL: Record<string, string> = {
  TRIAL: 'Prueba',
  TALLER: 'Taller',
  PRO: 'Pro',
};

export const METHOD_LABEL: Record<string, string> = {
  PAGO_MOVIL: 'Pago Móvil',
  ZELLE: 'Zelle',
  TRANSFER: 'Transferencia',
  CASH: 'Efectivo',
  OTHER: 'Otro',
};

// ⚠️ PRECIOS PLACEHOLDER — el dueño los ajusta a sus números reales.
export const PLANS = [
  {
    tier: 'TALLER' as const,
    name: 'Taller',
    monthly: 8,
    yearly: 80,
    blurb: 'Todo el sistema para un taller: calculadora, pedidos, productos, CRM y finanzas.',
  },
  {
    tier: 'PRO' as const,
    name: 'Pro',
    monthly: 15,
    yearly: 150,
    blurb: 'Para quien factura más: multiusuario amplio, prioridad de soporte y extras.',
  },
];

// ⚠️ DATOS DE COBRO PLACEHOLDER — reemplázalos por los tuyos (Pago Móvil, Zelle…).
export const PAYMENT_INFO = [
  'Pago Móvil: 0412-0000000 · C.I. V-00.000.000 · Banco 0102',
  'Zelle: tu-correo@ejemplo.com (Nombre Apellido)',
];

// ----- Taller -----

export function usePlan() {
  return useQuery({
    queryKey: ['plan'],
    queryFn: async () => (await api.get<PlanResponse>('/plan')).data,
  });
}

export function useReportPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: PaymentReportCreateDto) => api.post('/plan/report', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan'] }),
  });
}

// ----- Superadmin -----

export interface PendingPayment extends PaymentReport {
  organization: { id: string; name: string };
}

export function usePendingPayments() {
  return useQuery({
    queryKey: ['admin', 'payments'],
    queryFn: async () => (await api.get<PendingPayment[]>('/admin/payments/pending')).data,
  });
}

export function useReviewPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: PaymentReviewDto }) =>
      api.post(`/admin/payments/${id}/review`, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export interface AdminOrg {
  id: string;
  name: string;
  members: number;
  createdAt: string;
  status: PlanState;
}

export function useAdminOrgs() {
  return useQuery({
    queryKey: ['admin', 'orgs'],
    queryFn: async () => (await api.get<AdminOrg[]>('/admin/organizations')).data,
  });
}

export function useAdminMetrics() {
  return useQuery({
    queryKey: ['admin', 'metrics'],
    queryFn: async () =>
      (await api.get<{ orgs: number; newThisWeek: number; pendingPayments: number; approvedThisMonth: number }>(
        '/admin/metrics',
      )).data,
  });
}
