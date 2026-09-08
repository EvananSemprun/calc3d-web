import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import { Button, Field, Input, NumberInput } from '@/components/ui';
import { Dialog } from '@/components/overlays';
import { notify } from '@/components/toast';
import { useCalculator } from '@/features/calculator/CalculatorProvider';

/**
 * Guarda el cálculo actual como **ficha de la tienda**, que desde 2026-09-07 es
 * el catálogo único: el producto interno y lo que ve el cliente son la misma
 * cosa (spec `2026-09-07-catalogo-unico-design.md`).
 *
 * Se manda el `CalcInput` completo y **el costo lo calcula el servidor** con él;
 * el precio se prellena con el final de la calculadora para solo confirmarlo.
 *
 * Nace **oculta**: registrar una pieza no es publicarla. Se muestra en la
 * vitrina recién cuando el dueño lo decide, con sus fotos y su descripción.
 */
export function SaveProductModal({ onClose }: { onClose: () => void }) {
  const c = useCalculator();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { result } = c;

  // El precio final de la calculadora: el mismo que se ve en el panel.
  const suggested = result?.price.final ?? 0;

  const [name, setName] = useState(c.quoteName);
  const [priceUsd, setPriceUsd] = useState(Number(suggested.toFixed(4)));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>('/store/products', {
        name,
        priceUsd,
        input: c.input,
        // Oculta hasta que se le cargue foto y descripción.
        visible: false,
      });
      await queryClient.invalidateQueries({ queryKey: ['store-products'] });
      notify.success('Producto guardado en el catálogo');
      navigate(`/store/${res.data.id}`);
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
      description="Queda en el catálogo con su costeo, oculto hasta que lo publiques."
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Se guarda con el cálculo adentro, así que después la app puede recostearlo con los
          precios de hoy y avisarte si el margen se cayó.
        </p>
        <Field label="Nombre">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Llavero mundial"
            autoFocus
          />
        </Field>
        <Field label="Precio de venta · unidad" hint="Viene del panel; podés ajustarlo">
          <NumberInput value={priceUsd} onChange={setPriceUsd} min={0} step={0.01} />
        </Field>
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
