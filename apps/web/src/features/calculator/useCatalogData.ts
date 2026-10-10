import { useQuery } from '@tanstack/react-query';
import type { MaterialStatus, PrecioPorTipo } from '@calc3d/shared';
import { api } from '@/lib/api';

export interface MaterialItem {
  id: string;
  name: string;
  rollPrice: string;
  rollGrams: number;
  status: MaterialStatus;
  /** `AAAA-MM` si cerró ese mes (el último cerrado) en 0 y no se volvió a comprar; si no, null. */
  outAtLastClose: string | null;
}
export interface PrinterItem {
  id: string;
  name: string;
  price: string;
  lifetimeHours: number;
  powerKw: string;
  maintPerHour: string;
}
export interface ComponentItem {
  id: string;
  name: string;
  packagePrice: string;
  unitsPerPackage: number;
  scope: 'PER_PIECE' | 'PER_ORDER';
}
export interface ClientItem {
  id: string;
  name: string;
}

function useList<T>(endpoint: string, queryKey: unknown[] = [endpoint]) {
  return useQuery({
    queryKey,
    queryFn: async () => (await api.get<T[]>(`/${endpoint}`)).data,
  });
}

export function useCatalogData() {
  return {
    materials: useList<MaterialItem>('materials'),
    /**
     * El promedio por TIPO de filamento, DERIVADO por el servidor de las
     * compras (`GET /filament/type-prices`). Es con lo que arranca la
     * calculadora desde el 2026-10-10. ⚠️ No se calcula acá: el panel no tiene
     * las compras cargadas y, si las pidiera, habría dos caminos al mismo
     * número.
     *
     * ⚠️ **Su clave cuelga del prefijo `filament-purchases` a propósito.** El
     * promedio SALE de las compras, así que todo lo que las cambia tiene que
     * invalidarlo: registrar una compra en Gastos, corregirla o borrarla desde
     * Compras de filamento, recibir una línea de factura y corregir el tipo de
     * una ficha. Esos cuatro lugares ya invalidan `['filament-purchases']` y
     * React Query invalida **por prefijo**, así que esto queda cubierto sin
     * que nadie tenga que acordarse de sumar una clave más a cuatro listas —
     * que es exactamente como se quedan viejos los números en este panel.
     */
    filamentTypes: useList<PrecioPorTipo>('filament/type-prices', [
      'filament-purchases',
      'type-prices',
    ]),
    printers: useList<PrinterItem>('printers'),
    components: useList<ComponentItem>('components'),
    clients: useList<ClientItem>('clients'),
  };
}
