import { useState, type FormEvent } from 'react';
import {
  useSaveCampaign,
  PLATFORM_OPTIONS,
  OBJECTIVE_OPTIONS,
  STATUS_OPTIONS,
  type Campaign,
} from '@/features/campaigns/api';
import {
  Button,
  Field,
  FieldGrid,
  Input,
  NumberInput,
  Select,
} from '@/components/ui';
import { Dialog } from '@/components/overlays';
import { notify } from '@/components/toast';
import { apiErrorMessage } from '@/lib/api';
import { todayKey } from '@/lib/today';

const todayIso = () => todayKey();

/**
 * Modal de alta/edición de campaña. Vive en `features/campaigns/` (no en la página)
 * para que lo puedan abrir tanto la lista (`pages/Campaigns`) como el detalle
 * (`pages/CampaignDetail`): sin un botón de editar en el detalle, desde el teléfono
 * no había forma de editar una campaña (la tabla con el lápiz es solo de escritorio).
 */
export function CampaignModal({ campaign, onClose }: { campaign: Campaign | null; onClose: () => void }) {
  const save = useSaveCampaign();
  const [form, setForm] = useState({
    name: campaign?.name ?? '',
    platform: campaign?.platform ?? 'INSTAGRAM',
    objective: campaign?.objective ?? '',
    status: campaign?.status ?? 'ACTIVE',
    startDate: campaign?.startDate?.slice(0, 10) ?? todayIso(),
    endDate: campaign?.endDate?.slice(0, 10) ?? '',
    budget: campaign?.budget ?? 0,
    reach: campaign?.reach ?? 0,
    conversations: campaign?.conversations ?? 0,
    profileVisits: campaign?.profileVisits ?? 0,
    followers: campaign?.followers ?? 0,
    attributedSales: campaign?.attributedSales ?? 0,
    notes: campaign?.notes ?? '',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || save.isPending) return;
    save.mutate(
      {
        id: campaign?.id,
        name: form.name.trim(),
        platform: form.platform,
        objective: form.objective || null,
        status: form.status,
        startDate: form.startDate,
        endDate: form.endDate || null,
        budget: form.budget || null,
        reach: form.reach || null,
        conversations: form.conversations || null,
        profileVisits: form.profileVisits || null,
        followers: form.followers || null,
        attributedSales: form.attributedSales || 0,
        notes: form.notes || null,
      },
      {
        onSuccess: () => {
          notify.success(campaign ? 'Campaña actualizada' : 'Campaña creada');
          onClose();
        },
        onError: (err) => notify.error(apiErrorMessage(err)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(n) => !n && onClose()} title={campaign ? 'Editar campaña' : 'Nueva campaña'}>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Nombre de la campaña" required>
          <Input autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej. Promo llaveros diciembre" />
        </Field>
        <FieldGrid min="11rem" className="gap-3">
          <Field label="Plataforma">
            <Select value={form.platform} onChange={(e) => set({ platform: e.target.value as typeof form.platform })}>
              {PLATFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Objetivo (opcional)">
            <Select value={form.objective} onChange={(e) => set({ objective: e.target.value as typeof form.objective })}>
              <option value="">Sin objetivo</option>
              {OBJECTIVE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Inicio">
            <Input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </Field>
          <Field label="Fin (opcional)">
            <Input type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          </Field>
          <Field label="Presupuesto estimado (USD)">
            <NumberInput step="0.01" value={form.budget} onChange={(v) => set({ budget: v })} />
          </Field>
          <Field label="Alcance" hint="Lo que reporta la plataforma">
            <NumberInput value={form.reach} onChange={(v) => set({ reach: v })} />
          </Field>
          <Field label="Conversaciones">
            <NumberInput value={form.conversations} onChange={(v) => set({ conversations: v })} />
          </Field>
          <Field label="Visitas al perfil">
            <NumberInput value={form.profileVisits} onChange={(v) => set({ profileVisits: v })} />
          </Field>
          <Field label="Seguidores ganados">
            <NumberInput value={form.followers} onChange={(v) => set({ followers: v })} />
          </Field>
          <Field
            label="Venta atribuida sin encargo (USD)"
            hint="Vendido que trajo la campaña pero que no quedó registrado encargo por encargo. No es facturación: ya está contado en las ventas del negocio."
          >
            <NumberInput
              step="0.01"
              value={form.attributedSales}
              onChange={(v) => set({ attributedSales: v })}
            />
          </Field>
          <Field label="Estado">
            <Select value={form.status} onChange={(e) => set({ status: e.target.value as typeof form.status })}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </FieldGrid>
        <Field label="Notas (opcional)">
          <Input value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="accent" disabled={save.isPending || !form.name.trim()}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
