import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LoanCreateDto,
  LoanPaymentCreateDto,
  LoanUpdateDto,
  PayOffEstimate,
  PaymentFrequency,
} from '@calc3d/shared';
import { api } from '@/lib/api';

export interface LoanPayment {
  id: string;
  date: string;
  amount: number;
  reference: string | null;
  /** Quién puso la plata de la cuota: la caja o la contraparte. */
  paidBy: 'BUSINESS' | 'OWNER' | 'LOAN';
  counterpartyId: string | null;
  accountId: string | null;
  /** Si el que lo pagó de su bolsillo queda con una deuda a favor. */
  generatesDebt: boolean;
  source: string;
  /** ⚠️ Un pago anulado NO baja el saldo, pero sigue en la lista. */
  voidedAt: string | null;
  voidReason: string | null;
}

/** Un préstamo con su saldo ya DERIVADO por el servidor. */
export interface Loan {
  id: string;
  name: string;
  concept: string | null;
  principal: number;
  /**
   * La cuota OBJETIVO, en la frecuencia de abajo. Es lo que el dueño se propone
   * pagar — no un promedio ni un compromiso con el acreedor.
   */
  installmentTarget: number;
  paymentFrequency: PaymentFrequency;
  counterparty: { id: string; name: string; kind: string } | null;
  nextDueDate: string | null;
  startDate: string | null;
  /** null = abierto (y su cuota cuenta para el equilibrio). */
  closedAt: string | null;
  notes: string | null;
  printer: { id: string; name: string } | null;
  payments: LoanPayment[];
  paid: number;
  balance: number;
  progress: number;
  status: 'ACTIVO' | 'PAGADO';
  /** Las DOS lecturas: al ritmo objetivo y al ritmo real. */
  estimate: PayOffEstimate;
}

/** Una obligación del negocio con la contraparte, derivada por Caja. */
export interface Obligation {
  source: 'EXPENSE' | 'LOAN_PAYMENT' | 'MOVEMENT';
  sourceId: string;
  date: string;
  category: string;
  amount: number;
  applied: number;
  outstanding: number;
}

/**
 * LAS DOS DEUDAS. Lo que le debés al prestamista y lo que el negocio te debe a
 * vos son cosas distintas que comparten la palabra "préstamo".
 */
export interface LoansOverview {
  loans: Loan[];
  owner: {
    counterparty: { id: string; name: string; kind: string };
    obligations: Obligation[];
    total: number;
    applicationOrder: 'OLDEST_FIRST' | 'NEWEST_FIRST';
  };
}

export function useLoansOverview() {
  return useQuery({
    queryKey: ['loans', 'overview'],
    queryFn: async () => (await api.get<LoansOverview>('/loans/overview')).data,
  });
}

export function useLoans() {
  return useQuery({
    queryKey: ['loans'],
    queryFn: async () => (await api.get<Loan[]>('/loans')).data,
  });
}

/** Todo lo que toca un préstamo invalida lo mismo: la lista y el dashboard. */
function useLoanMutation<T>(fn: (v: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      // Una cuota mueve la caja (si la pagó el negocio) o la deuda con la contraparte.
      qc.invalidateQueries({ queryKey: ['cash'] });
    },
  });
}

export const useCreateLoan = () => useLoanMutation((dto: LoanCreateDto) => api.post('/loans', dto));

export const useUpdateLoan = () =>
  useLoanMutation(({ id, ...dto }: LoanUpdateDto & { id: string }) => api.patch(`/loans/${id}`, dto));

export const useDeleteLoan = () => useLoanMutation((id: string) => api.delete(`/loans/${id}`));

export const useAddLoanPayment = () =>
  useLoanMutation(({ id, ...dto }: LoanPaymentCreateDto & { id: string }) =>
    api.post(`/loans/${id}/payments`, dto),
  );

/**
 * Anular, **no borrar**: el pago queda en el historial con su motivo y el saldo
 * se recalcula. Por eso es un POST y pide el motivo.
 */
export const useVoidLoanPayment = () =>
  useLoanMutation(({ id, paymentId, reason }: { id: string; paymentId: string; reason: string }) =>
    api.post(`/loans/${id}/payments/${paymentId}/void`, { reason }),
  );

/**
 * Los préstamos en la forma que espera el motor del punto de equilibrio.
 *
 * ⚠️ La cuota viene en SU frecuencia; `monthlyLoanPayments` la normaliza a
 * mensual antes de sumar. Pasarle el préstamo crudo contaría una cuota semanal
 * de $50 como $50 al mes, cuando son $217.
 */
export const paraEquilibrio = (loans: Loan[]) =>
  loans.map((l) => ({
    monthlyPayment: l.installmentTarget,
    paymentFrequency: l.paymentFrequency,
    closedAt: l.closedAt,
  }));
