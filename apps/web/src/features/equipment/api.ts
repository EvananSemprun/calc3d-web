import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/**
 * Reposición de equipos, calculada por el servidor sobre TODA la historia.
 *
 * No depende del filtro de fechas del Dashboard a propósito: "cuánto se pagó
 * sola la impresora" no cambia según el rango que uno esté mirando.
 */
export interface EquipmentRecovery {
  income: number;
  operatingExpenses: number;
  accumulatedProfit: number;
  rows: {
    id?: string;
    name: string;
    cost: number;
    recovered: number;
    missing: number;
    progress: number;
  }[];
  totalCost: number;
  totalRecovered: number;
  /** Lo que queda después de reponer. Puede ser negativo, y se muestra así. */
  freeCapital: number;
}

export function useEquipmentRecovery() {
  return useQuery({
    queryKey: ['equipment-recovery'],
    queryFn: async () => (await api.get<EquipmentRecovery>('/printers/recovery')).data,
  });
}
