import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StoreRequestKind, StoreRequestStatus } from '@calc3d/shared';
import { api } from '@/lib/api';

/**
 * Bandeja de la tienda: lo que mandan los visitantes SIN sesión.
 *
 * Es una bandeja y no la lista de pedidos a propósito. Un desconocido no escribe
 * en la operación ni en el CRM: recién al **confirmar** se crea (o se enlaza por
 * teléfono) el contacto y el pedido. Confirmar es la única acción que mueve
 * datos reales; descartar solo deja constancia de que se vio.
 *
 * Los precios de `lines` los calculó el SERVIDOR leyendo la ficha de tienda. No
 * son editables desde acá — si algo está mal, se corrige en el pedido ya creado.
 */

export interface StoreRequestLine {
  slug: string;
  description: string;
  quantity: number;
  options: Record<string, string>;
  unitPrice: number;
}

export interface StoreRequest {
  id: string;
  kind: StoreRequestKind;
  status: StoreRequestStatus;
  customerName: string;
  customerPhone: string;
  customerNote: string | null;
  description: string | null;
  lines: StoreRequestLine[];
  /** Decimal de Prisma → string en JSON. */
  totalUsd: string;
  createdAt: string;
  reviewedAt: string | null;
  client: { id: string; name: string } | null;
  order: { id: string; code: number; status: string } | null;
}

const KEY = ['store', 'requests'];

export function useStoreRequests(status?: StoreRequestStatus) {
  return useQuery({
    queryKey: [...KEY, status ?? 'all'],
    queryFn: async () =>
      (await api.get<StoreRequest[]>('/store/requests', { params: status ? { status } : undefined }))
        .data,
  });
}

/** Cuántas quedan sin revisar (insignia del menú). */
export function useStoreRequestsPending() {
  return useQuery({
    queryKey: [...KEY, 'pending'],
    queryFn: async () => (await api.get<{ pending: number }>('/store/requests/pending-count')).data,
    // La bandeja se llena sola: sin refresco periódico habría que recargar la
    // página para enterarse de un pedido nuevo.
    refetchInterval: 60_000,
  });
}

function useRequestsInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['store'] });
    // Confirmar crea un pedido y quizá un contacto: sus listas quedaron viejas.
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['contacts'] });
    qc.invalidateQueries({ queryKey: ['clients'] });
  };
}

export function useConfirmStoreRequest() {
  const invalidate = useRequestsInvalidate();
  return useMutation({
    mutationFn: async (id: string) =>
      (
        await api.post<{ orderId: string; orderCode: number; clientId: string }>(
          `/store/requests/${id}/confirm`,
        )
      ).data,
    onSuccess: invalidate,
  });
}

export function useDiscardStoreRequest() {
  const invalidate = useRequestsInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post(`/store/requests/${id}/discard`),
    onSuccess: invalidate,
  });
}

export function useDeleteStoreRequest() {
  const invalidate = useRequestsInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/store/requests/${id}`),
    onSuccess: invalidate,
  });
}

/** Teléfono a formato internacional para el enlace de WhatsApp (0 inicial → 58). */
export function whatsappHref(phone: string, text: string) {
  const digits = (phone ?? '').replace(/\D/g, '');
  const tel = digits.startsWith('0') ? `58${digits.slice(1)}` : digits;
  return `https://wa.me/${tel}?text=${encodeURIComponent(text)}`;
}
