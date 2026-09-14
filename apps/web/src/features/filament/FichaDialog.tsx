import { useState } from 'react';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import type { StockCountRow } from '@calc3d/shared';
import { Button, Field, Input } from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { Combobox } from '@/components/Combobox';
import { notify } from '@/components/toast';
import { apiErrorMessage } from '@/lib/api';
import { useCorrectMaterial, useDeleteMaterial, useSetMaterialStatus } from '@/features/filament/api';

/**
 * LA FICHA DE UN ROLLO, desde Stock del mes. Reemplaza a la página Materiales
 * (se quitó el 2026-09-14). Solo se corrigen nombre y color — tipeos: el precio
 * sale de la compra y marca, tipo y gramos quedan como nacieron (decisión del
 * dueño). Cada acción cierra el diálogo: la fila se refresca con lo nuevo.
 */
export function FichaDialog({ fila, onClose }: { fila: StockCountRow; onClose: () => void }) {
  const [name, setName] = useState(fila.name);
  const [color, setColor] = useState(fila.color ?? '');
  const corregir = useCorrectMaterial();
  const cambiarEstado = useSetMaterialStatus();
  const borrar = useDeleteMaterial();
  const confirm = useConfirm();

  const ocupado = corregir.isPending || cambiarEstado.isPending || borrar.isPending;
  const descontinuada = fila.status === 'DISCONTINUED';
  const nombreLimpio = name.trim();
  const colorLimpio = color.trim() || null;
  const sinCambios = nombreLimpio === fila.name && colorLimpio === (fila.color ?? null);
  const titulo = [fila.type, fila.color].filter(Boolean).join(' ') || fila.name;

  const guardar = () =>
    corregir.mutate(
      { id: fila.materialId, name: nombreLimpio, color: colorLimpio },
      {
        onSuccess: () => {
          notify.success('Ficha corregida');
          onClose();
        },
        onError: (e) => notify.error('No se pudo corregir la ficha', apiErrorMessage(e)),
      },
    );

  const alternarEstado = async () => {
    const ok = await confirm(
      descontinuada
        ? {
            title: `¿Reactivar «${fila.name}»?`,
            description: 'Vuelve a aparecer al cotizar y en la reposición.',
            confirmLabel: 'Reactivar',
          }
        : {
            title: `¿Descontinuar «${fila.name}»?`,
            description:
              'Deja de aparecer al cotizar y en la reposición. Sus compras y conteos no se tocan. Se reactiva sola al registrar una compra con rollos, o con «Reactivar».',
            confirmLabel: 'Descontinuar',
          },
    );
    if (!ok) return;
    cambiarEstado.mutate(
      { id: fila.materialId, status: descontinuada ? 'ACTIVE' : 'DISCONTINUED' },
      {
        onSuccess: () => {
          notify.success(descontinuada ? 'Ficha reactivada' : 'Ficha descontinuada');
          onClose();
        },
        onError: (e) => notify.error('No se pudo cambiar el estado', apiErrorMessage(e)),
      },
    );
  };

  const borrarFicha = async () => {
    const ok = await confirm({
      title: `¿Borrar «${fila.name}»?`,
      description: 'No tiene compras ni conteos. Esta acción no se puede deshacer.',
      confirmLabel: 'Borrar',
      tone: 'destructive',
    });
    if (!ok) return;
    borrar.mutate(fila.materialId, {
      onSuccess: () => {
        notify.success('Ficha borrada');
        onClose();
      },
      onError: (e) => notify.error('No se pudo borrar la ficha', apiErrorMessage(e)),
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`${titulo} · ${fila.brand ?? 'Sin marca'}`}
      description="El precio del rollo sale de la última compra."
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Tipo</dt>
          <dd>{fila.type ?? '—'}</dd>
          <dt className="text-muted-foreground">Marca</dt>
          <dd>{fila.brand ?? 'Sin marca'}</dd>
        </dl>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!ocupado && !sinCambios && nombreLimpio) guardar();
          }}
          className="space-y-3"
        >
          <h3 className="text-sm font-semibold">Corregir</h3>
          <Field label="Nombre">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={ocupado} autoFocus />
          </Field>
          <Field label="Color (opcional)">
            <Combobox kind="MATERIAL_COLOR" value={color} onChange={setColor} />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="accent" disabled={ocupado || sinCambios || !nombreLimpio}>
              Guardar corrección
            </Button>
          </div>
        </form>

        <section className="space-y-2 border-t border-border/60 pt-4">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={alternarEstado}
            disabled={ocupado}
          >
            {descontinuada ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {descontinuada ? 'Reactivar' : 'Descontinuar'}
          </Button>
          {fila.canDelete ? (
            <Button
              type="button"
              variant="outline"
              className="w-full text-destructive"
              onClick={borrarFicha}
              disabled={ocupado}
            >
              <Trash2 className="h-4 w-4" /> Borrar ficha
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Tiene compras o conteos: no se borra, se descontinúa.
            </p>
          )}
        </section>
      </div>
    </Dialog>
  );
}
