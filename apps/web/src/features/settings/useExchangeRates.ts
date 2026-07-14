import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExchangeRatesResponse, ExchangeRateView } from '@calc3d/shared';
import { api } from '@/lib/api';

export type { ExchangeRateView, ExchangeRatesResponse };

export function useExchangeRates(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['exchange-rates'],
    queryFn: async () => (await api.get<ExchangeRatesResponse>('/exchange-rates')).data,
    staleTime: 5 * 60 * 1000,
    enabled: opts.enabled ?? true,
  });
}

export function useSetRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: { label: string; currencyCode: string; rate: number }) =>
      api.put('/exchange-rates', dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exchange-rates'] }),
  });
}

export function useDeleteRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) => api.delete(`/exchange-rates/${encodeURIComponent(label)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exchange-rates'] }),
  });
}

/** Extrae la (única) tasa congelada de un snapshot de documento, o null. */
export function frozenFromSnapshot(
  snap?: Record<string, { rate: number; label?: string }> | null,
): { currencyCode: string; rate: number; label?: string } | null {
  if (!snap) return null;
  const entry = Object.entries(snap)[0];
  if (!entry) return null;
  const [currencyCode, v] = entry;
  return { currencyCode, rate: v.rate, label: v.label };
}

/** Tasa de presentación resuelta para un documento. */
export interface DocRate {
  rate: number;
  currencyCode: string;
  label?: string;
  /** true = tasa de HOY (en vivo); false = tasa congelada del snapshot. */
  live: boolean;
}

/**
 * Resuelve la tasa en Bs de un documento: por defecto usa la tasa VIGENTE de la
 * moneda que eligió (por `label` del snapshot) → Bs EN VIVO. Si `frozen` es true
 * (documento final/cerrado) o la moneda ya no existe, cae a la tasa CONGELADA del
 * snapshot. Devuelve null si el documento no tiene moneda (solo USD).
 */
export function useDocRate(
  snapshot?: Record<string, { rate: number; source?: string; at?: string; label?: string }> | null,
  opts: { frozen?: boolean } = {},
): DocRate | null {
  const froz = frozenFromSnapshot(snapshot);
  const label = froz?.label ?? null;
  const { data } = useExchangeRates({ enabled: !opts.frozen && !!label });
  if (!froz) return null;
  if (opts.frozen) return { rate: froz.rate, currencyCode: froz.currencyCode, label: froz.label, live: false };
  const live = label ? (data?.rates.find((r) => r.label === label) ?? null) : null;
  if (live) return { rate: live.rate, currencyCode: live.currencyCode, label: live.label, live: true };
  return { rate: froz.rate, currencyCode: froz.currencyCode, label: froz.label, live: false };
}

export function useRefreshRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post<{ refreshError?: string }>('/exchange-rates/refresh')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exchange-rates'] }),
  });
}

/** Edad de una tasa en texto relativo ('hoy'/'ayer'/'hace N días') + umbral de tasa vieja. */
export function rateAge(updatedAt: string): { label: string; stale: boolean } {
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  if (days <= 0) return { label: 'hoy', stale: false };
  if (days === 1) return { label: 'ayer', stale: false };
  return { label: `hace ${days} días`, stale: true };
}
