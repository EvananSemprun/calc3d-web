import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GoalSuggestion, GoalUpsertDto, GrowthLevel, SeasonalCheck } from '@calc3d/shared';
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

// ---------- Sugerir metas ----------

/**
 * La propuesta del servidor. **Rellena el formulario y no guarda nada**: el
 * endpoint es de solo lectura y lo que se guarda sigue saliendo de `useSaveGoal`.
 */
export type GoalSuggestionResponse = GoalSuggestion & {
  month: string;
  /**
   * ⚠️ `SIN_HISTORIA` es "no se pudo medir", NO "no hay riesgo". Con historial
   * desde febrero 2026 el primer mes medible es febrero 2027.
   */
  seasonal: SeasonalCheck;
};

/**
 * Pide la propuesta. **Lazy**: `enabled` arranca en false y recién se enciende
 * cuando el dueño toca "Sugerir metas", así abrir el diálogo no dispara nada.
 *
 * El nivel de crecimiento va en la `queryKey` a propósito: cambiarlo tiene que
 * traer una propuesta nueva, no la anterior cacheada.
 */
export function useGoalSuggestion(month: string, growth: GrowthLevel, enabled: boolean) {
  return useQuery({
    queryKey: ['goals', 'suggestion', month, growth],
    queryFn: async () =>
      (await api.get<GoalSuggestionResponse>('/goals/suggestion', { params: { month, growth } })).data,
    enabled: enabled && !!month,
  });
}

/** Lo real de un mes, exista o no su meta: un mes sin meta igual tuvo ventas. */
export function useMonthActuals(month: string) {
  return useQuery({
    queryKey: ['goals', 'actuals', month],
    queryFn: async () =>
      (await api.get<{ month: string; sales: number; orders: number; newClients: number }>(
        '/goals/actuals',
        { params: { month } },
      )).data,
    enabled: !!month,
  });
}
