import { useState } from 'react';
import { Archive, ArchiveRestore, Merge, Tag, Trash2, type LucideIcon } from 'lucide-react';
import { accionesDeEstado, ofreceDescontinuar, type AccionDeEstado, type MaterialStatus, type StockCountRow } from '@calc3d/shared';
import { Button, Field, Input } from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { Combobox } from '@/components/Combobox';
import { notify } from '@/components/toast';
import { apiErrorMessage } from '@/lib/api';
import { useCorrectMaterial, useDeleteMaterial, useSetMaterialStatus } from '@/features/filament/api';
import { UnirFichaDialog } from '@/features/filament/UnirFichaDialog';

/**
 * LA FICHA DE UN ROLLO, desde Stock del mes. Reemplaza a la página Materiales
 * (se quitó el 2026-09-14).
 *
 * Se corrigen **nombre, color, marca y tipo**. Marca y tipo entraron el
 * 2026-10-09: sin ellos, un rollo cargado como "PLA mate" que resultó ser otra
 * cosa no tenía arreglo. ⚠️ Corregirlos **reagrupa el análisis** por marca y
 * por tipo — que es para lo que sirve.
 *
 * ⚠️ Los **gramos del rollo** y el **precio** no están, y no es un olvido: los
 * gramos reescriben el costo por gramo de todas las compras pasadas de esa
 * ficha, y el precio sale SIEMPRE de la última compra. El servidor los
 * descarta aunque se los manden.
 *
 * Cada acción cierra el diálogo: la fila se refresca con lo nuevo.
 */
/** Ícono por estado de DESTINO. `Record`: un estado nuevo no compila sin el suyo. */
const ICONO_DE_DESTINO: Record<MaterialStatus, LucideIcon> = {
  ACTIVE: ArchiveRestore,
  DISCONTINUED: Archive,
  SOLO_PEDIDO_ESPECIAL: Tag,
};

export function FichaDialog({ fila, onClose }: { fila: StockCountRow; onClose: () => void }) {
  const [name, setName] = useState(fila.name);
  const [color, setColor] = useState(fila.color ?? '');
  const [brand, setBrand] = useState(fila.brand ?? '');
  const [type, setType] = useState(fila.type ?? '');
  const corregir = useCorrectMaterial();
  const cambiarEstado = useSetMaterialStatus();
  const borrar = useDeleteMaterial();
  const confirm = useConfirm();
  const [uniendo, setUniendo] = useState(false);

  const ocupado = corregir.isPending || cambiarEstado.isPending || borrar.isPending;
  // Las acciones salen de un `switch` EXHAUSTIVO en shared (`accionesDeEstado`), no de
  // un `if` acá: la pregunta «¿en qué circulación está?» tiene TRES respuestas y el
  // interruptor binario anterior dejaba al tercer estado sin puerta de entrada (nada
  // lo podía escribir) y obligaba a reactivar para poder descontinuar. Con el
  // `switch`, un cuarto estado no compila hasta que alguien decide sus acciones.
  const acciones = accionesDeEstado(fila.status);
  const nombreLimpio = name.trim();
  const colorLimpio = color.trim() || null;
  const marcaLimpia = brand.trim() || null;
  const tipoLimpio = type.trim() || null;
  const sinCambios =
    nombreLimpio === fila.name &&
    colorLimpio === (fila.color ?? null) &&
    marcaLimpia === (fila.brand ?? null) &&
    tipoLimpio === (fila.type ?? null);
  const titulo = [fila.type, fila.color].filter(Boolean).join(' ') || fila.name;

  const guardar = () =>
    corregir.mutate(
      { id: fila.materialId, name: nombreLimpio, color: colorLimpio, brand: marcaLimpia, type: tipoLimpio },
      {
        onSuccess: () => {
          notify.success('Ficha corregida');
          onClose();
        },
        onError: (e) => notify.error('No se pudo corregir la ficha', apiErrorMessage(e)),
      },
    );

  const aplicarAccion = async (accion: AccionDeEstado) => {
    const ok = await confirm({
      title: accion.pregunta(fila.name),
      description: accion.efecto,
      confirmLabel: accion.etiqueta,
    });
    if (!ok) return;
    cambiarEstado.mutate(
      { id: fila.materialId, status: accion.destino },
      {
        onSuccess: () => {
          notify.success(`${fila.name}: ${accion.etiqueta.toLowerCase()}`);
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
      onError: (e) => notify.error('No se pudo borrar la ficha', apiErrorMessage(e), { duration: 15000 }),
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
          <Field label="Marca (opcional)" hint="Agrupa el análisis: corregirla reacomoda el histórico.">
            <Combobox kind="MATERIAL_BRAND" value={brand} onChange={setBrand} />
          </Field>
          <Field label="Tipo (PLA, PETG…) (opcional)" hint="Escribe uno nuevo y queda en la lista.">
            <Combobox kind="MATERIAL_TYPE" value={type} onChange={setType} />
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
          {acciones.map((accion) => {
            const Icono = ICONO_DE_DESTINO[accion.destino];
            return (
              <Button
                key={accion.destino}
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => aplicarAccion(accion)}
                disabled={ocupado}
              >
                <Icono className="h-4 w-4" />
                {accion.etiqueta}
              </Button>
            );
          })}
          {/* Unir sirve justo cuando la ficha TIENE historial: es la salida para un duplicado
              que no se puede borrar. Pasa todo a la otra y la borra (no se puede deshacer). */}
          <Button type="button" variant="outline" className="w-full" onClick={() => setUniendo(true)} disabled={ocupado}>
            <Merge className="h-4 w-4" /> Unir con otra ficha…
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
              {ofreceDescontinuar(fila.status)
                ? 'Tiene historial: no se borra. Usa «Descontinuar» o «Unir con otra ficha…».'
                : 'Tiene historial: no se borra. Si es un duplicado, usa «Unir con otra ficha…».'}
            </p>
          )}
        </section>
      </div>
      {uniendo && (
        <UnirFichaDialog
          tipo="material"
          origen={{ id: fila.materialId, name: fila.name }}
          onClose={() => setUniendo(false)}
        />
      )}
    </Dialog>
  );
}
