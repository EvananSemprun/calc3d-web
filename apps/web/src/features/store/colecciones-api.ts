import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StoreCollectionUpsertDto } from '@calc3d/shared';
import { api } from '@/lib/api';
import { useStoreInvalidate } from './api';

/**
 * Colecciones de la portada. Cuelgan del prefijo `['store']` para heredar la invalidación
 * del catálogo (incluida la vista previa: al guardar, la lista que se ve se vuelve a pedir).
 *
 * ⚠️ `esPrincipal` NO viaja en `StoreCollectionUpsertDto`: se cambia con su propio endpoint
 * (`useSetPrincipalColeccion`), que desmarca la anterior en una transacción del servidor.
 */

export interface ColeccionItem {
  id: string;
  categoryId: string | null;
  productId: string | null;
  position: number;
}

export interface Coleccion {
  id: string;
  slug: string;
  nombre: string;
  titulo: string;
  subtitulo: string | null;
  verTodoTipo: 'NONE' | 'CATEGORIA' | 'COLECCION';
  verTodoValor: string | null;
  esPrincipal: boolean;
  visible: boolean;
  /** Día de negocio AAAA-MM-DD (sin hora), o null. */
  startsAt: string | null;
  endsAt: string | null;
  items: ColeccionItem[];
  /** ids de producto excluidos aunque entren por su categoría. */
  exclusiones: string[];
}

/** La lista que la tienda publicaría, ya resuelta por el SERVIDOR. */
export interface ColeccionPreview {
  /** ¿La portada la mostraría hoy? Informativo: la lista llega igual. */
  vigente: boolean;
  productos: { id: string; slug: string; name: string }[];
}

const KEY = ['store', 'colecciones'];

export function useStoreColecciones() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<Coleccion[]>('/store/colecciones')).data,
  });
}

export function useCreateColeccion() {
  const invalidate = useStoreInvalidate();
  return useMutation({
    mutationFn: async (dto: StoreCollectionUpsertDto) =>
      (await api.post<Coleccion>('/store/colecciones', dto)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateColeccion(id: string) {
  const invalidate = useStoreInvalidate();
  return useMutation({
    mutationFn: async (dto: StoreCollectionUpsertDto) =>
      (await api.patch<Coleccion>(`/store/colecciones/${id}`, dto)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteColeccion() {
  const invalidate = useStoreInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/store/colecciones/${id}`),
    onSuccess: invalidate,
  });
}

/** Marca la principal. El servidor devuelve la lista entera con el cambio ya aplicado. */
export function useSetPrincipalColeccion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<Coleccion[]>(`/store/colecciones/${id}/principal`)).data,
    onSuccess: (lista) => qc.setQueryData(KEY, lista),
  });
}

/**
 * La vista previa se PIDE al servidor, que la resuelve con la misma función que el endpoint
 * público. ⚠️ No se arma en el panel: una lista calculada aquí aparte sería una segunda
 * definición y mentiría el día que una de las dos cambie.
 */
export function useColeccionPreview(id: string | null) {
  return useQuery({
    queryKey: [...KEY, id, 'preview'],
    queryFn: async () => (await api.get<ColeccionPreview>(`/store/colecciones/${id}/preview`)).data,
    enabled: !!id,
  });
}
