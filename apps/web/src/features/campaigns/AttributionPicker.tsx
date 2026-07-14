import type { AttributionChannel } from '@calc3d/shared';
import { Field, Select } from '@/components/ui';
import { CHANNEL_OPTIONS, useCampaigns } from './api';

export interface Attribution {
  originChannel: AttributionChannel | null;
  campaignId: string | null;
}

export const EMPTY_ATTRIBUTION: Attribution = { originChannel: null, campaignId: null };

/**
 * Selector de atribución de publicidad: cómo llegó el cliente (canal) y, opcional,
 * la campaña específica. Ambos pueden quedar vacíos ("Sin atribuir"). Controlado.
 */
export function AttributionPicker({
  value,
  onChange,
  compact,
}: {
  value: Attribution;
  onChange: (v: Attribution) => void;
  /** true = sin las etiquetas Field (para incrustar en filas apretadas). */
  compact?: boolean;
}) {
  const { data: campaigns = [] } = useCampaigns();

  const channel = (
    <Select
      value={value.originChannel ?? ''}
      onChange={(e) => onChange({ ...value, originChannel: (e.target.value || null) as AttributionChannel | null })}
    >
      <option value="">Sin atribuir</option>
      {CHANNEL_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );

  const campaign = (
    <Select
      value={value.campaignId ?? ''}
      onChange={(e) => onChange({ ...value, campaignId: e.target.value || null })}
    >
      <option value="">Ninguna campaña</option>
      {campaigns.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );

  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {channel}
        {campaign}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="¿Cómo llegó el cliente?">{channel}</Field>
      <Field label="Campaña (opcional)">{campaign}</Field>
    </div>
  );
}
