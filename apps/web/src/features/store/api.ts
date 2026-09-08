import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  StoreProductCreateDto,
  StoreProductKind,
  StoreProductUpdateDto,
} from '@calc3d/shared';
import { api } from '@/lib/api';

/**
 * Catálogo de tienda. Es un modelo APARTE del producto interno: aquel guarda el
 * costeo y este lo que ve el cliente. Una ficha puede apuntar a un producto o a
 * una cotización como origen de costeo, pero el costo lo lee el backend — nunca
 * viaja desde acá.
 */

export interface StoreImage {
  id: string;
  key: string;
  url: string;
  alt: string | null;
  width: number | null;
  height: number | null;
  position: number;
}

export interface StoreOption {
  id: string;
  value: string;
  /** Decimal de Prisma → string en JSON. */
  priceDeltaUsd: string;
  swatchHex: string | null;
}

export interface StoreOptionGroup {
  id: string;
  name: string;
  required: boolean;
  options: StoreOption[];
}

export interface StoreCategory {
  id: string;
  name: string;
  slug: string;
  position: number;
}

export interface StoreProduct {
  id: string;
  slug: string;
  name: string;
  kind: StoreProductKind;
  summary: string | null;
  description: string | null;
  priceUsd: string;
  compareAtUsd: string | null;
  leadTimeDays: number | null;
  minQty: number;
  /** Datos de vitrina: material de impresión, insignia y ficha técnica libre. */
  material: string | null;
  badge: string | null;
  custom: boolean;
  specs: { label: string; value: string }[];
  visible: boolean;
  position: number;
  categoryId: string | null;
  category: { id: string; name: string; slug: string } | null;
  /** Origen de costeo. Interno: no sale por la API pública. */
  productId: string | null;
  quoteId: string | null;
  costAtPublish: string | null;
  images: StoreImage[];
  optionGroups: StoreOptionGroup[];
  createdAt: string;
  updatedAt: string;
  /**
   * Recosteo con los precios de HOY. **null en las fichas sin costeo** (un
   * servicio, o algo cargado a mano): no es un error, es la mitad del catálogo.
   */
  recost: {
    price: number;
    costAtPublish: number;
    costNow: number;
    status: { markupNow: number; markupAtSave: number; costDelta: number; belowMin: boolean };
    unmatched: string[];
  } | null;
}

const KEY = ['store', 'products'];

export function useStoreProducts() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<StoreProduct[]>('/store/products')).data,
  });
}

export function useStoreProduct(id: string) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: async () => (await api.get<StoreProduct>(`/store/products/${id}`)).data,
    enabled: !!id,
  });
}

export function useStoreCategories() {
  return useQuery({
    queryKey: ['store', 'categories'],
    queryFn: async () => (await api.get<StoreCategory[]>('/store/categories')).data,
  });
}

export function useCreateStoreCategory() {
  const invalidate = useStoreInvalidate();
  return useMutation({
    mutationFn: async (dto: { name: string }) =>
      (await api.post<StoreCategory>('/store/categories', dto)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateStoreCategory() {
  const invalidate = useStoreInvalidate();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      (await api.patch<StoreCategory>(`/store/categories/${id}`, { name })).data,
    onSuccess: invalidate,
  });
}

/** Borrar una categoría NO borra sus productos: quedan sin categoría. */
export function useDeleteStoreCategory() {
  const invalidate = useStoreInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/store/categories/${id}`),
    onSuccess: invalidate,
  });
}

/** Avisa si el servidor puede recibir fotos (faltan credenciales del almacenamiento). */
export function useStoreStatus() {
  return useQuery({
    queryKey: ['store', 'status'],
    queryFn: async () => (await api.get<{ storageReady: boolean }>('/store/status')).data,
  });
}

/** Invalida todo el catálogo tras cualquier escritura. */
export function useStoreInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['store'] });
}

export function useCreateStoreProduct() {
  const invalidate = useStoreInvalidate();
  return useMutation({
    mutationFn: async (dto: StoreProductCreateDto) =>
      (await api.post<StoreProduct>('/store/products', dto)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateStoreProduct(id: string) {
  const invalidate = useStoreInvalidate();
  return useMutation({
    mutationFn: async (dto: StoreProductUpdateDto) =>
      (await api.patch<StoreProduct>(`/store/products/${id}`, dto)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteStoreProduct() {
  const invalidate = useStoreInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/store/products/${id}`),
    onSuccess: invalidate,
  });
}

/** Publicar a partir de un producto interno o de una cotización. */
export function usePublishToStore() {
  const invalidate = useStoreInvalidate();
  return useMutation({
    mutationFn: async (source: { productId?: string; quoteId?: string }) =>
      (await api.post<StoreProduct>('/store/products/from-source', source)).data,
    onSuccess: invalidate,
  });
}

/**
 * Sube una foto en dos pasos: se pide una URL firmada y el archivo va DIRECTO al
 * almacenamiento (no pasa por la API), y recién después se confirma para que el
 * backend lo verifique y lo registre.
 */
export async function uploadStoreImage(productId: string, file: File): Promise<StoreProduct> {
  const { data: target } = await api.post<{
    key: string;
    url: string;
    headers: Record<string, string>;
  }>(`/store/products/${productId}/images/upload-url`, {
    contentType: file.type,
    contentLength: file.size,
  });

  // `fetch` a pelo: la URL firmada no lleva ni debe llevar la sesión de la API.
  const put = await fetch(target.url, { method: 'PUT', headers: target.headers, body: file });
  if (!put.ok) throw new Error('No se pudo subir la foto al almacenamiento');

  const size = await imageSize(file);
  const { data } = await api.post<StoreProduct>(`/store/products/${productId}/images`, {
    key: target.key,
    ...size,
  });
  return data;
}

export async function deleteStoreImage(productId: string, imageId: string): Promise<StoreProduct> {
  const { data } = await api.delete<StoreProduct>(`/store/products/${productId}/images/${imageId}`);
  return data;
}

/**
 * Reordena la vitrina. El backend fija la posición por el ÍNDICE en la lista, así
 * que hay que mandarla completa y en el orden final — no solo lo que se movió.
 */
export function useReorderStoreProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.patch<StoreProduct[]>('/store/products/reorder', { ids })).data,
    // Pinta el orden nuevo al instante; si el servidor falla, el caller revierte.
    onSuccess: (products) => qc.setQueryData(KEY, products),
  });
}

export function useReorderStoreImages(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.patch<StoreProduct>(`/store/products/${productId}/images/reorder`, { ids })).data,
    onSuccess: (product) => qc.setQueryData([...KEY, productId], product),
  });
}

/** Mueve el elemento `from` a la posición `to` y devuelve el arreglo nuevo. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const copia = [...items];
  const [movido] = copia.splice(from, 1);
  copia.splice(to, 0, movido);
  return copia;
}

/** Dimensiones reales de la imagen, para que la tienda reserve el espacio. */
function imageSize(file: File): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    img.src = url;
  });
}

/**
 * Fichas cuyo margen cayó por debajo del mínimo, para la alerta del Dashboard.
 * Las que no tienen costeo quedan fuera: sin costo no hay margen que vigilar.
 */
export function storeProductsBelowMargin(products: StoreProduct[] | undefined): StoreProduct[] {
  return (products ?? []).filter((p) => p.recost?.status.belowMin);
}
