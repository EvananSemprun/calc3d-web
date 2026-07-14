import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttributionChannel,
  CampaignObjective,
  CampaignPlatform,
  CampaignStatusDto,
} from '@calc3d/shared';
import { api } from '@/lib/api';

export type { AttributionChannel, CampaignObjective, CampaignPlatform, CampaignStatusDto };

/** Métricas derivadas (USD) que devuelve el backend por campaña. */
export interface CampaignStats {
  invested: number;
  revenue: number;
  profit: number;
  hasCost: boolean;
  sales: number;
  orders: number;
  ordersTotal: number;
  quotes: number;
}

export interface Campaign {
  id: string;
  name: string;
  platform: CampaignPlatform;
  objective: CampaignObjective | null;
  status: CampaignStatusDto;
  startDate: string;
  endDate: string | null;
  budget: number | null;
  notes: string | null;
  createdAt: string;
  stats: CampaignStats;
  /** Vista por período (solo en el detalle): ventas dentro de la ventana de la campaña. */
  period?: { sales: number; revenue: number };
}

/** Etiqueta + estilo del semáforo de salud de campaña (`campaignHealth`). */
export const HEALTH_META = {
  PROFITABLE: { label: 'Rentable', variant: 'success' as const },
  AT_RISK: { label: 'En riesgo', variant: 'warning' as const },
  LOSS: { label: 'Pérdida', variant: 'outline' as const },
  NO_DATA: { label: 'Sin datos', variant: 'outline' as const },
};

export const PLATFORM_LABELS: Record<CampaignPlatform, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  GOOGLE: 'Google',
  WHATSAPP: 'WhatsApp',
  OTHER: 'Otra',
};

export const OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  SALES: 'Ventas',
  MESSAGES: 'Mensajes',
  VISITS: 'Visitas',
  FOLLOWERS: 'Seguidores',
  AWARENESS: 'Reconocimiento de marca',
};

export const CAMPAIGN_STATUS: Record<CampaignStatusDto, { label: string; tone: string }> = {
  ACTIVE: { label: 'Activa', tone: 'text-success' },
  PAUSED: { label: 'Pausada', tone: 'text-brand-yellow-ink' },
  FINISHED: { label: 'Finalizada', tone: 'text-muted-foreground' },
};

/** Canal de origen (atribución) para cotización/pedido/venta. */
export const CHANNEL_LABELS: Record<AttributionChannel, string> = {
  ORGANIC: 'Orgánico',
  INSTAGRAM_ADS: 'Instagram Ads',
  FACEBOOK_ADS: 'Facebook Ads',
  TIKTOK_ADS: 'TikTok Ads',
  GOOGLE_ADS: 'Google Ads',
  WHATSAPP: 'WhatsApp',
  REFERRAL: 'Recomendación',
  OTHER: 'Otro',
};

export const PLATFORM_OPTIONS = Object.entries(PLATFORM_LABELS).map(([value, label]) => ({
  value: value as CampaignPlatform,
  label,
}));
export const OBJECTIVE_OPTIONS = Object.entries(OBJECTIVE_LABELS).map(([value, label]) => ({
  value: value as CampaignObjective,
  label,
}));
export const STATUS_OPTIONS = Object.entries(CAMPAIGN_STATUS).map(([value, v]) => ({
  value: value as CampaignStatusDto,
  label: v.label,
}));
export const CHANNEL_OPTIONS = Object.entries(CHANNEL_LABELS).map(([value, label]) => ({
  value: value as AttributionChannel,
  label,
}));

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => (await api.get<Campaign[]>('/campaigns')).data,
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ['campaigns', id],
    queryFn: async () => (await api.get<Campaign>(`/campaigns/${id}`)).data,
    enabled: !!id,
  });
}

const invalidate = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ['campaigns'] });

export function useSaveCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & Record<string, unknown>) =>
      id ? api.patch(`/campaigns/${id}`, body) : api.post('/campaigns', body),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/campaigns/${id}`),
    onSuccess: () => invalidate(qc),
  });
}
