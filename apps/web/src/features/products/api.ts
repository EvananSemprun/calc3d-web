import { useQuery } from '@tanstack/react-query';
import type { CalcInput, CalcResult, ProductStatus } from '@calc3d/shared';
import { api } from '@/lib/api';

/** Recosteo del producto contra el catálogo de hoy (derivado por el backend). */
export interface ProductRecost {
  priceSet: number;
  costAtSave: number;
  costNow: number;
  status: ProductStatus;
  /** Items del CalcInput que ya no existen por ese nombre en el catálogo. */
  unmatched: string[];
  /** CalcResult completo de hoy (solo en el detalle, no en la lista). */
  result?: CalcResult;
}

export interface Product {
  id: string;
  name: string;
  imageUrl: string | null;
  notes: string | null;
  input: CalcInput;
  /** Decimal de Prisma → string en JSON. Usar `recost.*` para los números. */
  priceSet: string;
  costAtSave: string;
  exchangeRates?: Record<string, { rate: number; source: string; at: string }> | null;
  createdAt: string;
  updatedAt: string;
  recost: ProductRecost;
}

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => (await api.get<Product[]>('/products')).data,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ['products', id],
    queryFn: async () => (await api.get<Product>(`/products/${id}`)).data,
    enabled: !!id,
  });
}

/** Productos cuyo margen cayó por debajo del mínimo (para la alerta del dashboard). */
export function productsBelowMargin(products: Product[] | undefined): Product[] {
  return (products ?? []).filter((p) => p.recost.status.belowMin);
}
