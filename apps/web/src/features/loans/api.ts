import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoanCreateDto, LoanPaymentCreateDto, LoanUpdateDto } from '@calc3d/shared';
import { api } from '@/lib/api';

/** Un préstamo con su saldo ya DERIVADO por el servidor. */
export interface Loan {
  id: string;
  name: string;
  principal: number;
  monthlyPayment: number;
  startDate: string | null;
  /** null = abierto (y su cuota cuenta para el equilibrio). */
  closedAt: string | null;
  notes: string | null;
  printer: { id: string; name: string } | null;
  payments: { id: string; date: string; amount: number; reference: string | null }[];
  paid: number;
  balance: number;
  progress: number;
  /** Meses que faltan al ritmo de la cuota; null si no hay cuota fijada. */
  monthsLeft: number | null;
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
    },
  });
}

export const useCreateLoan = () =>
  useLoanMutation((dto: LoanCreateDto) => api.post('/loans', dto));

export const useUpdateLoan = () =>
  useLoanMutation(({ id, ...dto }: LoanUpdateDto & { id: string }) =>
    api.patch(`/loans/${id}`, dto),
  );

export const useDeleteLoan = () => useLoanMutation((id: string) => api.delete(`/loans/${id}`));

export const useAddLoanPayment = () =>
  useLoanMutation(({ id, ...dto }: LoanPaymentCreateDto & { id: string }) =>
    api.post(`/loans/${id}/payments`, dto),
  );

export const useDeleteLoanPayment = () =>
  useLoanMutation(({ id, paymentId }: { id: string; paymentId: string }) =>
    api.delete(`/loans/${id}/payments/${paymentId}`),
  );
