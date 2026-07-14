import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '@/lib/api';
import { Button, Field, Input, Select } from '@/components/ui';
import { Dialog } from '@/components/overlays';
import { notify } from '@/components/toast';
import { useCalculator } from '@/features/calculator/CalculatorProvider';
import { useSettings } from '@/features/settings/useSettings';
import { CurrencyPicker } from '@/features/settings/CurrencyPicker';

export function SaveQuoteModal({ onClose }: { onClose: () => void }) {
  const c = useCalculator();
  const navigate = useNavigate();
  const { data: settings } = useSettings();
  const [name, setName] = useState(c.quoteName);
  const [clientId, setClientId] = useState(c.clientId);
  const [currencyLabel, setCurrencyLabel] = useState<string | null>(settings?.defaultRateLabel ?? null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>('/quotes', {
        name,
        clientId: clientId || null,
        input: c.input,
        currencyLabel,
      });
      notify.success('Presupuesto guardado');
      navigate(`/quotes/${res.data.id}`);
    } catch (e) {
      notify.error(apiErrorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Guardar presupuesto"
    >
      <div className="space-y-3">
        <Field label="Nombre">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Llaveros personalizados"
          />
        </Field>
        <Field label="Cliente (opcional)">
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Sin cliente</option>
            {c.catalogs.clients.data?.map((cl) => (
              <option key={cl.id} value={cl.id}>
                {cl.name}
              </option>
            ))}
          </Select>
        </Field>
        <CurrencyPicker value={currencyLabel} onChange={setCurrencyLabel} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={save} disabled={saving || !name}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
