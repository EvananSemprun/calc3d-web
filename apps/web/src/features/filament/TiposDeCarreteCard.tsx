import { useState } from 'react';
import { Info, Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Field,
  FieldGrid,
  Input,
  NumberInput,
  TableSkeleton,
} from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { apiErrorMessage } from '@/lib/api';
import {
  useDeleteTipoDeCarrete,
  useSaveTipoDeCarrete,
  useTiposDeCarrete,
} from './api';

type Tipo = { id: string; nombre: string; gramos: number };
type Borrador = { nombre: string; gramos: number };

const VACIO: Borrador = { nombre: '', gramos: 0 };

/**
 * TIPOS DE CARRETE — cuánto pesa el carrete VACÍO de cada marca de rollo.
 *
 * Para saber cuánto filamento queda en un rollo empezado se lo pesa en la
 * balanza y se resta el carrete; por eso hay que registrar cuánto pesa cada uno.
 *
 * ⚠️ El aviso de abajo dice solo lo que está medido: el cierre de mes COPIA el
 * peso del carrete de ese día, así que cambiarlo no mueve un mes ya cerrado. No
 * promete nada sobre el mes abierto.
 *
 * Los errores los escribe el SERVIDOR (409 con el motivo: nombre repetido, tipo
 * usado por un cierre) y se muestran tal cual con `apiErrorMessage`.
 */
export function TiposDeCarreteCard() {
  const { data, isLoading } = useTiposDeCarrete();
  const guardar = useSaveTipoDeCarrete();
  const borrar = useDeleteTipoDeCarrete();
  const confirm = useConfirm();

  // `null` = cerrado; `undefined` = alta nueva; con tipo = edición.
  const [editando, setEditando] = useState<Tipo | null | undefined>(null);
  const [form, setForm] = useState<Borrador>(VACIO);

  const abierto = editando !== null;
  const set = (parche: Partial<Borrador>) => setForm((f) => ({ ...f, ...parche }));
  const cerrar = () => setEditando(null);

  const abrirAlta = () => {
    setForm(VACIO);
    setEditando(undefined);
  };

  const abrirEdicion = (t: Tipo) => {
    setForm({ nombre: t.nombre, gramos: t.gramos });
    setEditando(t);
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = form.nombre.trim();
    if (!nombre) return;
    guardar.mutate(
      { id: editando?.id, nombre, gramos: Math.round(form.gramos) },
      {
        onSuccess: () => {
          notify.success(editando ? 'Tipo de carrete actualizado' : 'Tipo de carrete creado');
          cerrar();
        },
        onError: (err) => notify.error(apiErrorMessage(err)),
      },
    );
  };

  const eliminar = async (t: Tipo) => {
    const ok = await confirm({
      title: `¿Borrar «${t.nombre}»?`,
      description:
        'Si algún cierre de mes ya pesó un rollo con este carrete, el servidor no va a dejar borrarlo.',
      confirmLabel: 'Borrar',
      tone: 'destructive',
    });
    if (!ok) return;
    borrar.mutate(t.id, {
      onSuccess: () => notify.success(`«${t.nombre}» ya no está`),
      onError: (err) => notify.error(apiErrorMessage(err)),
    });
  };

  const lista = data ?? [];

  const botonNuevo = (
    <Button variant="accent" size="sm" onClick={abrirAlta}>
      <Plus className="h-4 w-4" /> Nuevo tipo de carrete
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Tipos de carrete</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cuánto pesa el carrete vacío de cada marca. Sirve para saber cuánto filamento queda
              en un rollo empezado: peso en la balanza menos el carrete.
            </p>
          </div>
          {botonNuevo}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <TableSkeleton rows={3} cols={2} />
        ) : lista.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="Todavía no hay tipos de carrete"
            description="Pesa un carrete vacío y anótalo aquí: lo vas a elegir al pesar un rollo empezado."
            action={botonNuevo}
          />
        ) : (
          <ul className="space-y-2">
            {lista.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card p-3"
              >
                <span className="font-semibold">{t.nombre}</span>
                <span className="text-sm text-muted-foreground">{t.gramos} g</span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${t.nombre}`}
                    onClick={() => abrirEdicion(t)}
                  >
                    <Pencil className="h-4 w-4 text-brand-yellow-ink" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Borrar ${t.nombre}`}
                    onClick={() => eliminar(t)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="flex items-start gap-2 text-xs text-muted-foreground" role="note">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Cambiar el peso de un tipo no toca los meses ya cerrados: cada cierre guarda el peso
            del carrete que tenía ese día.
          </span>
        </p>
      </CardContent>

      {abierto && (
        <Dialog
          open
          onOpenChange={(n) => !n && cerrar()}
          title={editando ? `Editar ${editando.nombre}` : 'Nuevo tipo de carrete'}
        >
          <form className="space-y-3" onSubmit={enviar}>
            <FieldGrid min="11rem" className="gap-3">
              <Field label="Nombre" required>
                <Input
                  autoFocus
                  value={form.nombre}
                  maxLength={80}
                  placeholder="Ej. Carrete Bambu"
                  onChange={(e) => set({ nombre: e.target.value })}
                />
              </Field>
              <Field label="Peso del carrete vacío (g)" required>
                <NumberInput
                  min={0}
                  step={1}
                  value={form.gramos}
                  onChange={(gramos) => set({ gramos })}
                />
              </Field>
            </FieldGrid>

            {editando && (
              <p className="text-xs text-muted-foreground">
                Los meses ya cerrados conservan el peso que tenía este carrete cuando se cerraron.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={cerrar}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="accent"
                disabled={guardar.isPending || !form.nombre.trim()}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </Card>
  );
}
