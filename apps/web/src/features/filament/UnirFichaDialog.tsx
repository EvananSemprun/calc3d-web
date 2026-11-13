import { useState } from 'react';
import { Merge } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Field, Select } from '@/components/ui';
import { Dialog } from '@/components/overlays';
import { notify } from '@/components/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import { filasDeLaUnion, useUnirFichas, useVistaDeUnion, type TipoDeFicha } from './unir';

interface FichaLista {
  id: string;
  name: string;
  brand?: string | null;
  rollGrams?: number;
}

/**
 * «UNIR CON…»: pasa todo lo de una ficha duplicada a otra y borra la duplicada.
 *
 * Elegir el destino pide la vista previa al servidor (que NO escribe) y la dibuja
 * entera: cuántas compras, líneas de factura, conteos y costeos se mueven, el
 * precio que va a quedar y que no se puede deshacer. El botón de unir solo se
 * habilita con esa vista cargada, para que nadie confirme a ciegas.
 *
 * Los filamentos solo se ofrecen con otros del MISMO peso de rollo: el servidor
 * lo exige (el costo por gramo de las compras pasadas sale de esos gramos).
 */
export function UnirFichaDialog({
  tipo,
  origen,
  onClose,
}: {
  tipo: TipoDeFicha;
  origen: { id: string; name: string };
  onClose: () => void;
}) {
  const [destinoId, setDestinoId] = useState('');
  const { money } = useMoney();
  const unir = useUnirFichas(tipo);
  const { data: todas = [] } = useQuery({
    queryKey: [tipo === 'material' ? 'materials' : 'components'],
    queryFn: async () => (await api.get<FichaLista[]>(tipo === 'material' ? '/materials' : '/components')).data,
  });
  const pesoDelOrigen = todas.find((f) => f.id === origen.id)?.rollGrams;
  const candidatas = todas.filter(
    (f) => f.id !== origen.id && (tipo !== 'material' || pesoDelOrigen === undefined || f.rollGrams === pesoDelOrigen),
  );
  const vista = useVistaDeUnion(tipo, origen.id, destinoId);
  const filas = vista.data ? filasDeLaUnion(vista.data, tipo, money) : [];

  const ejecutar = () =>
    unir.mutate(
      { origenId: origen.id, destinoId },
      {
        onSuccess: () => {
          notify.success(`«${origen.name}» se unió con «${vista.data?.destino.name ?? ''}»`);
          onClose();
        },
        onError: (e) => notify.error('No se pudo unir', apiErrorMessage(e)),
      },
    );

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`Unir «${origen.name}» con otra ${tipo === 'material' ? 'ficha' : 'ficha de insumo'}`}
      description="Todo su historial pasa a la que elijas y esta se borra."
    >
      <div className="space-y-4">
        <Field label="Unir con">
          <Select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} disabled={unir.isPending}>
            <option value="">Elige la ficha que se queda…</option>
            {candidatas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.brand ? `${f.name} · ${f.brand}` : f.name}
              </option>
            ))}
          </Select>
        </Field>

        {destinoId && vista.isLoading && <p className="text-sm text-muted-foreground">Calculando lo que se va a mover…</p>}
        {destinoId && vista.isError && (
          <p role="alert" className="text-sm text-destructive">
            {apiErrorMessage(vista.error)}
          </p>
        )}
        {filas.length > 0 && (
          <ul aria-label="Lo que va a pasar" className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
            {filas.map((f) => (
              <li key={f.clave}>{f.texto}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={unir.isPending}>
            Cancelar
          </Button>
          <Button type="button" variant="accent" onClick={ejecutar} disabled={!vista.data || unir.isPending}>
            <Merge className="h-4 w-4" /> Unir y borrar «{origen.name}»
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
