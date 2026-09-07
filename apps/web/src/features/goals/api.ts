import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GoalUpsertDto } from '@calc3d/shared';
import { api } from '@/lib/api';

/** Una meta del mes con lo real ya DERIVADO por el servidor. */
export interface GoalMonth {
  id: string;
  /** `AAAA-MM` */
  month: string;
  salesTarget: number;
  ordersTarget: number;
  newClientsTarget: number;
  notes: string | null;
  sales: number;
  orders: number;
  newClients: number;
  /** Fracción cumplida; null si no hay meta cargada para ese renglón. */
  salesProgress: number | null;
  ordersProgress: number | null;
  newClientsProgress: number | null;
}

export interface GoalsResponse {
  months: GoalMonth[];
  summary: {
    salesTarget: number;
    sales: number;
    ordersTarget: number;
    orders: number;
    newClientsTarget: number;
    newClients: number;
    salesProgress: number | null;
    ordersProgress: number | null;
    newClientsProgress: number | null;
  };
}

export function useGoals() {
  return useQuery({
    queryKey: ['goals'],
    queryFn: async () => (await api.get<GoalsResponse>('/goals')).data,
  });
}

/** La meta de un mes puntual (`AAAA-MM`), para la tarjeta del Dashboard. */
export function useGoalForMonth(month: string) {
  return useQuery({
    queryKey: ['goals', month],
    queryFn: async () => (await api.get<GoalMonth | null>('/goals', { params: { month } })).data,
  });
}

function useGoalMutation<T>(fn: (v: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export const useSaveGoal = () => useGoalMutation((dto: GoalUpsertDto) => api.put('/goals', dto));
export const useDeleteGoal = () => useGoalMutation((id: string) => api.delete(`/goals/${id}`));
