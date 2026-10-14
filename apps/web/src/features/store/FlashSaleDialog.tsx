import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import { notify } from '@/components/toast';
import { Button, Field, Input } from '@/components/ui';
import { Dialog } from '@/components/overlays';
import { isoAInputVenezuela, inputVenezuelaAIso } from './flash-sale-tz';

interface SettingsSale {
  saleTitle: string | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
}

/**
 * Edita la ventana de Flash Sale (título + fechas) en hora de Venezuela;
 * guarda en UTC vía PATCH /settings. "Solo tacha": el precio cobrado no cambia.
 */
export function FlashSaleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery<SettingsSale>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
  });

  const [titulo, setTitulo] = useState('');
  const [inicio, setInicio] = useState('');
  const [fin, setFin] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Prellenar SOLO en la transición a abierto, con lo que haya en ese momento.
  // Si `data` llega después (fetch tardío), NO se pisa lo que el dueño escribió.
  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) {
      setTitulo(data?.saleTitle ?? '');
      setInicio(isoAInputVenezuela(data?.saleStartsAt ?? null));
      setFin(isoAInputVenezuela(data?.saleEndsAt ?? null));
      setError(null);
    }
    prevOpen.current = open;
  }, [open, data]);

  const guardar = useMutation({
    mutationFn: (payload: SettingsSale) => api.patch('/settings', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      notify.success('Oferta actualizada');
      onOpenChange(false);
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const startsAt = inputVenezuelaAIso(inicio);
    const endsAt = inputVenezuelaAIso(fin);
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      setError('La oferta debe terminar después de empezar.');
      return;
    }
    setError(null);
    guardar.mutate({ saleTitle: titulo.trim() || null, saleStartsAt: startsAt, saleEndsAt: endsAt });
  };

  const quitar = () =>
    guardar.mutate({ saleTitle: null, saleStartsAt: null, saleEndsAt: null });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Flash Sale">
      <form onSubmit={onSubmit} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Durante la ventana, la home muestra una sección con contador y los productos que tengan
          "precio tachado". El precio cobrado no cambia: solo se tacha. Las fechas van en hora de
          Venezuela.
        </p>
        <Field label="Título">
          <Input
            aria-label="Título"
            value={titulo}
            maxLength={80}
            placeholder="Oferta de octubre"
            onChange={(e) => setTitulo(e.target.value)}
          />
        </Field>
        <Field label="Empieza">
          <Input
            aria-label="Empieza"
            type="datetime-local"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </Field>
        <Field label="Termina">
          <Input
            aria-label="Termina"
            type="datetime-local"
            value={fin}
            onChange={(e) => setFin(e.target.value)}
          />
        </Field>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" onClick={quitar} disabled={guardar.isPending}>
            Quitar oferta
          </Button>
          <Button type="submit" disabled={guardar.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
