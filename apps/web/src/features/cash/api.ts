import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BusinessCash,
  CashCountUpsertDto,
  OwnerFinancingKey,
  OwnerMovementCreateDto,
} from '@calc3d/shared';
import { api } from '@/lib/api';

/**
 * CAJA — todo lo que muestra lo DERIVA el servidor (saldo del negocio, lo
 * personal de cada conteo, lo que se le debe a Vanan). Acá no se recalcula.
 */
export interface CashSummary {
  balance: BusinessCash;
  financing: {
    rows: { key: OwnerFinancingKey; put: number; recovered: number; missing: number }[];
    owedToOwner: number;
    owedToLender: number;
    totalOwed: number;
    overWithdrawn: number;
  };
  movements: {
    id: string;
    date: string;
    kind: 'CONTRIBUTION' | 'WITHDRAWAL';
    amount: number;
    concept: string;
    note: string | null;
  }[];
  counts: {
    id: string;
    date: string;
    total: number;
    note: string | null;
    /** Lo que era del negocio ESE día. */
    business: number;
    personal: number;
    /** En Binance había MENOS de lo que es del negocio. */
    short: boolean;
  }[];
}

export function useCash() {
  return useQuery({
    queryKey: ['cash'],
    queryFn: async () => (await api.get<CashSummary>('/cash')).data,
  });
}

/** Cada escritura devuelve el resumen entero: se guarda directo en la caché. */
function useCashMutation<T>(fn: (v: T) => Promise<{ data: CashSummary }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: ({ data }) => qc.setQueryData(['cash'], data),
  });
}

export const useAddMovement = () =>
  useCashMutation((dto: OwnerMovementCreateDto) => api.post<CashSummary>('/cash/movements', dto));

export const useDeleteMovement = () =>
  useCashMutation((id: string) => api.delete<CashSummary>(`/cash/movements/${id}`));

export const useSaveCount = () =>
  useCashMutation((dto: CashCountUpsertDto) => api.put<CashSummary>('/cash/counts', dto));

export const useDeleteCount = () =>
  useCashMutation((id: string) => api.delete<CashSummary>(`/cash/counts/${id}`));
