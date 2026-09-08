import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Select } from '@/components/ui';
import { api, apiErrorMessage } from '@/lib/api';
import { notify } from '@/components/toast';
import { useCatalogData } from '@/features/calculator/useCatalogData';
import type { Order } from '@/features/orders/api';

/**
 * QUÉ PASÓ AL IMPRIMIRLO — los tres datos que nadie tenía (punto 9).
 *
 * Se cargan DESPUÉS de imprimir, no al tomar el pedido, y por eso viven en una
 * tarjeta aparte y no en el modal de edición del pedido.
 *
 * ⚠️ **Vacío no es cero.** Un pedido sin anotar no cuenta como "cero fallos":
 * queda fuera de la tasa real. Por eso los campos arrancan vacíos y solo se
 * mandan los que se tocaron — si se guardara 0 por defecto, la tasa de fallos
 * saldría siempre baja con datos que nadie midió.
 */
export function ProductionCard({ order }: { order: Order }) {
  const qc = useQueryClient();
  const { printers: printersQuery } = useCatalogData();
  const printers = printersQuery.data ?? [];
  const [printerId, setPrinterId] = useState(order.printerId ?? '');
  const [reprints, setReprints] = useState<string>(order.reprints?.toString() ?? '');

  useEffect(() => {
    setPrinterId(order.printerId ?? '');
    setReprints(order.reprints?.toString() ?? '');
  }, [order.id, order.printerId, order.reprints]);

  const guardar = useMutation({
    mutationFn: () =>
      api.patch(`/orders/${order.id}`, {
        printerId: printerId || null,
        // Vacío se manda como null: "sin medir", no "cero".
        reprints: reprints.trim() === '' ? null : Number(reprints),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', order.id] });
      qc.invalidateQueries({ queryKey: ['printer-usage'] });
      notify.success('Guardado');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const sinMedir = order.reprints == null;

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Qué pasó al imprimirlo</CardTitle>
        <p className="text-xs text-muted-foreground">
          {sinMedir
            ? 'Sin anotar. Mientras esté vacío, este trabajo no cuenta para la tasa real de fallos.'
            : 'Alimenta la tasa real de fallos.'}
          {' '}Las horas de máquina no van acá: se anotan una vez por mes en Producción, porque
          también se imprime fuera de los pedidos.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field label="Impresora que lo hizo">
          <Select value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
            <option value="">Sin especificar</option>
            {printers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Piezas reimpresas por fallo"
          hint="0 si salió todo bien. Dejalo vacío si no lo contaste."
        >
          <NumberInputVacio value={reprints} onChange={setReprints} />
        </Field>
        <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Campo numérico que distingue VACÍO de CERO. `NumberInput` no sirve acá: su
 * valor es `number` y el vacío colapsa a 0, que es exactamente el dato que no
 * queremos inventar.
 */
function NumberInputVacio({
  value,
  onChange,
  step,
}: {
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <input
      type="number"
      min="0"
      step={step ?? '1'}
      value={value}
      placeholder="Sin medir"
      onChange={(e) => onChange(e.target.value)}
      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    />
  );
}
