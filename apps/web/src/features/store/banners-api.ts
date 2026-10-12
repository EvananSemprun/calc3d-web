import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  StoreBannerCreateDto,
  StoreBannerLinkType,
  StoreBannerUpdateDto,
} from '@calc3d/shared';
import { api } from '@/lib/api';
import { useStoreInvalidate } from './api';

/**
 * Banners del carrusel de la home. Cuelgan del prefijo `['store']` para heredar
 * la invalidación del catálogo. La imagen va a R2 con el mismo flujo de 2 pasos
 * que las fotos de ficha, pero como el banner todavía no existe al subir, el
 * paso de confirmar devuelve la CLAVE y el banner se crea con ella.
 */

export interface StoreBanner {
  id: string;
  title: string;
  subtitle: string | null;
  imageKey: string;
  imageUrl: string;
  linkType: StoreBannerLinkType;
  linkValue: string | null;
  position: number;
  visible: boolean;
}

const KEY = ['store', 'banners'];

export function useStoreBanners() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<StoreBanner[]>('/store/banners')).data,
  });
}

export function useStoreBanner(id: string) {
  return useQuery({
    queryKey: [...KEY, id],
    queryFn: async () => (await api.get<StoreBanner>(`/store/banners/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateStoreBanner() {
  const invalidate = useStoreInvalidate();
  return useMutation({
    mutationFn: async (dto: StoreBannerCreateDto) =>
      (await api.post<StoreBanner>('/store/banners', dto)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateStoreBanner(id: string) {
  const invalidate = useStoreInvalidate();
  return useMutation({
    mutationFn: async (dto: StoreBannerUpdateDto) =>
      (await api.patch<StoreBanner>(`/store/banners/${id}`, dto)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteStoreBanner() {
  const invalidate = useStoreInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/store/banners/${id}`),
    onSuccess: invalidate,
  });
}

/** Reordena el carrusel: el backend fija la posición por el ÍNDICE, así que se
 *  manda la lista completa en el orden final. */
export function useReorderStoreBanners() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.patch<StoreBanner[]>('/store/banners/reorder', { ids })).data,
    onSuccess: (banners) => qc.setQueryData(KEY, banners),
  });
}

/**
 * Sube la imagen del banner en dos pasos (URL firmada + PUT directo al bucket) y
 * devuelve la CLAVE para crear/editar el banner con ella. El banner no existe
 * todavía, así que acá no se confirma contra una ficha: el `create`/`update` del
 * banner es el que verifica la clave en el servidor.
 */
export async function uploadBannerImage(file: File): Promise<{ key: string }> {
  const { data: target } = await api.post<{
    key: string;
    url: string;
    headers: Record<string, string>;
  }>('/store/banners/image/upload-url', {
    contentType: file.type,
    contentLength: file.size,
  });

  // `fetch` a pelo: la URL firmada no lleva ni debe llevar la sesión de la API.
  const put = await fetch(target.url, { method: 'PUT', headers: target.headers, body: file });
  if (!put.ok) throw new Error('No se pudo subir la imagen al almacenamiento');

  return { key: target.key };
}
