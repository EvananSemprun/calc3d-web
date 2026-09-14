import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FilamentPurchase,
  MaterialStatus,
  RestockGroup,
  StockCountRow,
  StockMonthCloseDto,
  StockMonthStatus,
} from '@calc3d/shared';
import { api } from '@/lib/api';
import type { DateRange } from '@/features/finance/DateRange';

/** Resumen del mes que devuelve `GET /filament/summary`. */
export interface FilamentSummary {
  month: string;
  totalRolls: number;
  running: number;
  /** null si alguno de los dos meses no está cerrado */
  consumption: number | null;
  purchased: number;
  /** qué comprar, POR TIPO + COLOR, de más comprado a menos */
  restock: RestockGroup[];
  pendingBrandCheck: number;
  /** colores contados: todos si el mes está cerrado, ninguno si está abierto */
  countedColors: number;
  totalColors: number;
  /** rollos comprados por color, en promedio: el umbral de "los que más se compran" */
  averagePurchased: number;
  /** true si el mes está CERRADO: solo entonces los números son finales */
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

/** Si el mes está cerrado y desde cuándo se puede cerrar. */
export function useFilamentMonthStatus(month: string) {
  return useQuery({
    queryKey: ['filament-month-status', month],
    queryFn: async () => {
      const { data } = await api.get<StockMonthStatus>('/filament/stock/status', { params: { month } });
      return data;
    },
    // Global está apagado: acá sí conviene, porque "se puede cerrar" cambia con
    // la fecha y la pestaña puede quedar abierta de un día para otro.
    refetchOnWindowFocus: true,
    refetchInterval: (q) => (q.state.data?.canClose || q.state.data?.closed ? false : 5 * 60_000),
  });
}

/**
 * Tras cerrar o reabrir cambian el conteo, el resumen y el estado del mes.
 * Devuelve una promesa y refresca el estado AL FINAL: así la mutación sigue
 * "pendiente" hasta que llegan los datos nuevos (evita un doble clic que
 * mande un segundo cierre y choque 409 contra el servidor) y nunca se llega a
 * ver "Cerrado" con las filas viejas todavía en pantalla.
 * También `materials`: el aviso «0 al cierre» de la calculadora depende del
 * último mes cerrado.
 */
function useInvalidarStock() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['filament-stock'] }),
      qc.invalidateQueries({ queryKey: ['filament-summary'] }),
      qc.invalidateQueries({ queryKey: ['materials'] }),
    ]);
    await qc.invalidateQueries({ queryKey: ['filament-month-status'] });
  };
}

/** Cierra el mes con todas las casillas: la única forma de guardar el conteo. */
export function useCloseStockMonth() {
  const invalidar = useInvalidarStock();
  return useMutation({
    mutationFn: async (dto: StockMonthCloseDto) => {
      const { data } = await api.post<StockMonthStatus>('/filament/stock/close', dto);
      return data;
    },
    onSuccess: invalidar,
  });
}

/** Reabre un mes cerrado para corregirlo. */
export function useReopenStockMonth() {
  const invalidar = useInvalidarStock();
  return useMutation({
    mutationFn: async (month: string) => {
      const { data } = await api.post<StockMonthStatus>('/filament/stock/reopen', { month });
      return data;
    },
    onSuccess: invalidar,
  });
}

/**
 * Tras corregir, descontinuar o borrar una ficha cambian el catálogo (calculadora
 * y Gastos), el conteo, la reposición y los nombres en Compras.
 */
function useInvalidarFichas() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ['materials', 'filament-stock', 'filament-summary', 'filament-purchases'].map((key) =>
        qc.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

/** Corregir tipeos de una ficha: solo nombre y color (el precio sale de la compra). */
export function useCorrectMaterial() {
  const invalidar = useInvalidarFichas();
  return useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string | null }) => {
      const { data } = await api.patch(`/materials/${id}`, { name, color });
      return data;
    },
    onSuccess: invalidar,
  });
}

/** Descontinuar o reactivar una ficha. La reposición depende del estado. */
export function useSetMaterialStatus() {
  const invalidar = useInvalidarFichas();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MaterialStatus }) => {
      const { data } = await api.patch(`/materials/${id}/status`, { status });
      return data;
    },
    onSuccess: invalidar,
  });
}

/** Solo anda con una ficha sin compras ni conteos (`canDelete`); si no, la API da 409. */
export function useDeleteMaterial() {
  const invalidar = useInvalidarFichas();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/materials/${id}`);
    },
    onSuccess: invalidar,
  });
}
