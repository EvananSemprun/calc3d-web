import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { priceFinalPerUnit, priceJobTotal } from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { Button, Field, Input, NumberInput } from '@/components/ui';
import { Dialog } from '@/components/overlays';
import { notify } from '@/components/toast';
import { useCalculator } from '@/features/calculator/CalculatorProvider';
import { useSettings } from '@/features/settings/useSettings';
import { CurrencyPicker } from '@/features/settings/CurrencyPicker';

/**
 * Guarda el cálculo actual como PRODUCTO reutilizable (Fase 4). Prellena el
 * precio de venta con el precio elegido (con extras) para que el dueño solo
 * confirme; el costo lo recalcula el servidor.
 */
export function SaveProductModal({ onClose }: { onClose: () => void }) {
  const c = useCalculator();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { result, selectedRate } = c;

  // Precio elegido por unidad (mismo criterio que el ResultPanel).
  const middle = result?.prices[Math.min(1, Math.max(0, (result?.prices.length ?? 1) - 1))];
  const chosen =
    (selectedRate != null && result?.prices.find((p) => p.marginPct === selectedRate)) || middle;
  const suggested =
    chosen && result
      ? chosen.hitMinimum
        ? priceJobTotal(chosen, result.quantity) / result.quantity
        : priceFinalPerUnit(chosen)
      : 0;

  const { data: settings } = useSettings();
  const [name, setName] = useState(c.quoteName);
  const [imageUrl, setImageUrl] = useState('');
  const [priceSet, setPriceSet] = useState(Number(suggested.toFixed(4)));
  const [currencyLabel, setCurrencyLabel] = useState<string | null>(settings?.defaultRateLabel ?? null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>('/products', {
        name,
        imageUrl: imageUrl.trim() || null,
        input: c.input,
        priceSet,
        currencyLabel,
      });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      notify.success('Producto guardado');
      navigate(`/products/${res.data.id}`);
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
      title="Guardar como producto"
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Guarda esta pieza costeada para reusarla y vigilar su rentabilidad cuando cambien
          los precios o la tasa.
        </p>
        <Field label="Nombre">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Llavero mundial"
          />
        </Field>
        <Field label="Precio de venta · unidad">
          <NumberInput value={priceSet} onChange={setPriceSet} min={0} step={0.01} />
        </Field>
        <Field label="Imagen (URL, opcional)">
          <Input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
          />
        </Field>
        <CurrencyPicker value={currencyLabel} onChange={setCurrencyLabel} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={save} disabled={saving || !name}>
            {saving ? 'Guardando…' : 'Guardar producto'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
