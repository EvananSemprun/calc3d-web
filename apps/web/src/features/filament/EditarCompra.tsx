import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FilamentPurchase } from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { Button, Field, FieldGrid, Input, NumberInput, Select } from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { useCounterparties } from '@/features/cash/api';
import { useContacts } from '@/features/contacts/api';

/** El precio por rollo que va a quedar, para verlo antes de guardar. */
const porRollo = (monto: number, rollos: number) =>
  rollos > 0 ? Math.round((monto / rollos) * 10000) / 10000 : 0;

const soloFecha = (iso: string) => iso.slice(0, 10);

/**
 * CORREGIR UNA COMPRA DE FILAMENTO.
 *
 * Una compra ES un gasto con `materialId`, así que esto edita el gasto. Se
 * puede cambiar TODO, incluso a qué filamento se le cargó.
 *
 * ⚠️ El precio con el que se cotiza lo recalcula el SERVIDOR a partir de la
 * última compra; acá solo se muestra cuánto va a quedar esta. Si lo decidiera
 * la pantalla, corregir una compra vieja pisaría el precio con uno viejo.
 */
export function EditarCompra({
  compra,
  onClose,
}: {
  compra: FilamentPurchase;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: contrapartes = [] } = useCounterparties();
  const { data: contactos = [] } = useContacts();
  const proveedores = contactos.filter((c) => c.type === 'SUPPLIER');
  const { data: materiales = [] } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => (await api.get<{ id: string; name: string }[]>('/materials')).data,
  });

  const [date, setDate] = useState(soloFecha(compra.date));
  const [materialId, setMaterialId] = useState(compra.materialId ?? '');
  const [quantity, setQuantity] = useState(compra.quantity);
  const [amount, setAmount] = useState(compra.amount);
  const [providerId, setProviderId] = useState(compra.providerId ?? '');
  const [counterpartyId, setCounterpartyId] = useState(compra.counterpartyId ?? '');
  const [note, setNote] = useState(compra.note ?? '');

  const invalidar = () => {
    // La compra toca la ficha (precio del rollo) y el stock del mes, no solo
    // la lista de compras.
    for (const key of ['filament-purchases', 'filament-stock', 'filament-summary', 'materials', 'expenses', 'cash']) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };

  const guardar = useMutation({
    mutationFn: () =>
      api.patch(`/expenses/${compra.id}`, {
        date,
        materialId,
        quantity,
        amount,
        providerId: providerId || null,
        counterpartyId: counterpartyId || null,
        description: note.trim(),
      }),
    onSuccess: () => {
      invalidar();
      notify.success('Compra corregida');
      onClose();
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const borrar = useMutation({
    mutationFn: () => api.delete(`/expenses/${compra.id}`),
    onSuccess: () => {
      invalidar();
      notify.success('Compra eliminada');
      onClose();
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const pedirBorrar = async () => {
    const ok = await confirm({
      title: '¿Eliminar esta compra?',
      description:
        'Sale de la lista y del gasto. El precio del rollo vuelve al de la compra anterior.',
      confirmLabel: 'Eliminar',
      tone: 'destructive',
    });
    if (ok) borrar.mutate();
  };

  const ocupado = guardar.isPending || borrar.isPending;
  const sePuede = !!materialId && amount > 0 && quantity > 0 && !!date;

  /**
   * ⚠️ **Una compra nacida de una factura no se edita acá.**
   *
   * Su monto y sus rollos son el espejo de una línea de factura ya recibida:
   * la API rechaza el `PATCH` y el `DELETE` con un 400, así que el formulario
   * solo sabría fallar. Las listas ya no ofrecen abrirlo en esas filas; esto
   * es la red: una entrada nueva que se olvide de mirarlo no va a poder
   * romper la factura de todos modos.
   */
  if (compra.fromInvoice) {
    return (
      <Dialog
        open
        onOpenChange={(abierto) => {
          if (!abierto) onClose();
        }}
        title="Esta compra entró por una factura"
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            La cargaste como línea de una factura de compra y ya la recibiste, así que
            sus rollos y su monto son los de esa factura. Si hay algo que corregir, se
            corrige en <strong>Compras</strong>: cambiarlo acá dejaría la factura
            diciendo una cosa y el gasto otra.
          </p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Entendido
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(abierto) => {
        if (!abierto) onClose();
      }}
      title="Corregir compra de filamento"
      className="max-h-[90vh] overflow-y-auto"
    >
      <div className="space-y-3">
        <FieldGrid>
          <Field label="Fecha" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Monto pagado (USD)" required>
            <NumberInput value={amount} onChange={setAmount} />
          </Field>
        </FieldGrid>

        <Field label="Filamento" required hint="Podés moverla a otra ficha si se cargó en la equivocada.">
          <Select value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
            {materiales.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>

        <FieldGrid>
          <Field label="Rollos comprados" required>
            <NumberInput value={quantity} onChange={(n) => setQuantity(Math.max(1, Math.floor(n)))} />
          </Field>
          <Field label="Proveedor (opcional)">
            <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </FieldGrid>

        <Field
          label="¿Quién lo pagó?"
          hint="Si lo pagó una persona, la Caja lo cuenta como aporte que el negocio le debe."
        >
          <Select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)}>
            <option value="">La caja del negocio</option>
            {contrapartes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind === 'EXTERNAL_LENDER' ? c.name : `${c.name}, de su bolsillo`}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Nota (opcional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </Field>

        <p className="rounded-lg border border-border/70 bg-background/30 p-2 text-xs text-muted-foreground">
          Esta compra queda en <strong>${porRollo(amount, quantity).toFixed(2)}</strong> por rollo.
          El precio con el que se cotiza sale de la compra más reciente del filamento.
        </p>

        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <Button variant="outline" onClick={pedirBorrar} disabled={ocupado}>
            Eliminar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={ocupado}>
              Cancelar
            </Button>
            <Button variant="accent" onClick={() => guardar.mutate()} disabled={ocupado || !sePuede}>
              {guardar.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
