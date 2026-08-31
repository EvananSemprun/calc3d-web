import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api';
import { notify } from '@/components/toast';
import { Dialog, useConfirm } from '@/components/overlays';
import { Button, EmptyState, Input } from '@/components/ui';
import {
  useCreateStoreCategory,
  useDeleteStoreCategory,
  useStoreCategories,
  useStoreProducts,
  useUpdateStoreCategory,
} from './api';

/**
 * Gestor de categorías de la tienda: crear, renombrar y borrar. Se abre desde la
 * vitrina y desde el selector de categoría de una ficha, para no obligar a salir
 * del producto que estás editando.
 *
 * Borrar una categoría NO borra sus productos (el backend los deja sin categoría),
 * así que el aviso dice exactamente cuántos quedan sueltos.
 */
export function StoreCategoriesModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const confirm = useConfirm();
  const { data: categories = [] } = useStoreCategories();
  const { data: products = [] } = useStoreProducts();
  const create = useCreateStoreCategory();
  const update = useUpdateStoreCategory();
  const remove = useDeleteStoreCategory();

  const [nueva, setNueva] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');

  /** Cuántas fichas usan cada categoría (sale del catálogo ya cacheado). */
  const enUso = (categoryId: string) => products.filter((p) => p.categoryId === categoryId).length;

  const crear = async () => {
    const name = nueva.trim();
    if (!name) return;
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      notify.error('Ya existe una categoría con ese nombre');
      return;
    }
    try {
      await create.mutateAsync({ name });
      setNueva('');
      notify.success('Categoría creada');
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  const guardarNombre = async (id: string) => {
    const name = borrador.trim();
    if (!name) return;
    try {
      await update.mutateAsync({ id, name });
      setEditando(null);
      notify.success('Categoría renombrada');
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  const borrar = async (id: string, name: string) => {
    const usan = enUso(id);
    const ok = await confirm({
      title: `Borrar la categoría "${name}"`,
      description:
        usan === 0
          ? 'No la usa ningún producto.'
          : `${usan} producto${usan === 1 ? '' : 's'} quedará${usan === 1 ? '' : 'n'} sin categoría. No se borra ninguno.`,
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(id);
      notify.success('Categoría borrada');
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Categorías de la tienda"
      description="Agrupan los productos en la vitrina. El enlace se genera solo desde el nombre."
    >
      <div className="space-y-4 overflow-y-auto">
        {/* Enter = crear: es el gesto natural cuando cargás varias seguidas. */}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void crear();
          }}
        >
          <Input
            autoFocus
            className="flex-1"
            placeholder="Llaveros"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            aria-label="Nombre de la categoría nueva"
          />
          <Button type="submit" disabled={!nueva.trim() || create.isPending}>
            <Plus className="h-4 w-4" /> {create.isPending ? 'Creando…' : 'Agregar'}
          </Button>
        </form>

        {categories.length === 0 ? (
          <EmptyState
            className="p-6"
            description="Todavía no hay categorías. Creá la primera arriba: por ejemplo Llaveros, Figuras o Servicios."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {categories.map((c) => {
              const usan = enUso(c.id);
              return (
                <li key={c.id} className="flex items-center gap-2 p-2.5">
                  {editando === c.id ? (
                    <form
                      className="flex flex-1 items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void guardarNombre(c.id);
                      }}
                    >
                      <Input
                        autoFocus
                        className="flex-1"
                        value={borrador}
                        onChange={(e) => setBorrador(e.target.value)}
                        aria-label={`Nuevo nombre de ${c.name}`}
                      />
                      <button
                        type="submit"
                        aria-label="Guardar nombre"
                        className="text-success hover:opacity-80"
                        disabled={update.isPending}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancelar"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setEditando(null)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          /{c.slug}
                          {usan > 0 && ` · ${usan} producto${usan === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Renombrar ${c.name}`}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditando(c.id);
                          setBorrador(c.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Borrar ${c.name}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => void borrar(c.id, c.name)}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          Renombrar una categoría cambia también su enlace público. Borrarla no borra productos: los
          deja sin categoría.
        </p>
      </div>
    </Dialog>
  );
}
