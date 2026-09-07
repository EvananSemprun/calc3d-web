import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FilamentPurchase,
  RestockStatus,
  StockCountRow,
  StockCountUpsertDto,
} from '@calc3d/shared';
import { api } from '@/lib/api';
import type { DateRange } from '@/features/finance/DateRange';

/** Resumen del mes que devuelve `GET /filament/summary`. */
export interface FilamentSummary {
  month: string;
  totalRolls: number;
  running: number;
  /** null cuando falta el conteo de alguno de los dos meses */
  consumption: number | null;
  purchased: number;
  restock: { materialId: string; name: string; status: RestockStatus }[];
  pendingBrandCheck: number;
  countedMaterials: number;
  totalMaterials: number;
  /** false si el mes se contó a medias: el total y el consumo no son de fiar */
  complete: boolean;
}

const params = (r: Pick<DateRange, 'from' | 'to'>) => ({
  ...(r.from && { from: r.from }),
  ...(r.to && { to: r.to }),
});

/** Compras de filamento, con el costo por rollo y por gramo ya derivados. */
export function useFilamentPurchases(range: Pick<DateRange, 'from' | 'to'>) {
  return useQuery({
    queryKey: ['filament-purchases', range.from ?? null, range.to ?? null],
    queryFn: async () => {
      const { data } = await api.get<FilamentPurchase[]>('/filament/purchases', {
        params: params(range),
      });
      return data;
    },
  });
}

/** El conteo del mes (`AAAA-MM`), con todos los materiales. */
export function useFilamentStock(month: string) {
  return useQuery({
    queryKey: ['filament-stock', month],
    queryFn: async () => {
      const { data } = await api.get<StockCountRow[]>('/filament/stock', { params: { month } });
      return data;
    },
  });
}

export function useFilamentSummary(month: string) {
  return useQuery({
    queryKey: ['filament-summary', month],
    queryFn: async () => {
      const { data } = await api.get<FilamentSummary>('/filament/summary', { params: { month } });
      return data;
    },
  });
}

export function useSaveStockCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: StockCountUpsertDto) => api.put('/filament/stock', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['filament-stock'] });
      qc.invalidateQueries({ queryKey: ['filament-summary'] });
    },
  });
}
