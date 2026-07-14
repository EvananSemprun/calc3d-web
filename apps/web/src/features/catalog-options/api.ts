import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogOptionKind, CatalogOptionView } from '@calc3d/shared';
import { api } from '@/lib/api';

export type { CatalogOptionKind, CatalogOptionView };

/** Opciones vigentes de una lista (marca/tipo/color de filamento). */
export function useCatalogOptions(kind: CatalogOptionKind) {
  return useQuery({
    queryKey: ['catalog-options', kind],
    queryFn: async () =>
      (await api.get<CatalogOptionView[]>('/catalog-options', { params: { kind } })).data,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { kind: CatalogOptionKind; value: string }) =>
      api.post<CatalogOptionView>('/catalog-options', dto),
    onSuccess: (_res, dto) =>
      qc.invalidateQueries({ queryKey: ['catalog-options', dto.kind] }),
  });
}

export function useDeleteOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opt: { id: string; kind: CatalogOptionKind }) =>
      api.delete(`/catalog-options/${opt.id}`),
    onSuccess: (_res, opt) =>
      qc.invalidateQueries({ queryKey: ['catalog-options', opt.kind] }),
  });
}
