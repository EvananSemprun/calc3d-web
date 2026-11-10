import { useState } from 'react';
import { Check, CornerDownRight, FolderInput, Pencil, Plus, Trash2, X } from 'lucide-react';
import { arbolDeCategorias, descendientesDe } from '@calc3d/shared';
import { apiErrorMessage } from '@/lib/api';
import { notify } from '@/components/toast';
import { Dialog, useConfirm } from '@/components/overlays';
import { Button, EmptyState, Field, FieldGrid, Input, Select } from '@/components/ui';
import {
  type StoreCategory,
  useCreateStoreCategory,
  useDeleteStoreCategory,
  useStoreCategories,
  useStoreProducts,
  useUpdateStoreCategory,
} from './api';

const SIN_MADRE = 'Ninguna (categoría principal)';

/**
 * Gestor de categorías de la tienda: crear, renombrar, mover y borrar, en DOS niveles como
 * máximo (categoría y subcategoría). Se abre desde la vitrina y desde el selector de
 * categoría de una ficha, para no obligar a salir del producto que estás editando.
 *
 * ⚠️ Renombrar y mover de madre son acciones SEPARADAS. Renombrar manda solo `name` (el
 * servidor conserva la madre); mover es un botón propio que manda `parentId`. Juntarlas
 * hacía que un renombrado pudiera reparentar sin querer.
 *
 * Borrar una categoría NO borra sus productos (el backend los deja sin categoría), así
 * que el aviso dice exactamente cuántos quedan sueltos. Una madre con hijas NO se borra:
 * el servidor lo rechaza, y acá se avisa antes de pedir confirmación.
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
  const [nuevaMadre, setNuevaMadre] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [destino, setDestino] = useState('');

  const arbol = arbolDeCategorias(categories);
  /** Solo una categoría de primer nivel puede ser madre (máximo dos niveles). */
  const raices = arbol.map((n) => n.categoria);

  /** Cuántas fichas usan cada categoría DIRECTAMENTE (sale del catálogo ya cacheado). */
  const enUso = (categoryId: string) => products.filter((p) => p.categoryId === categoryId).length;

  /**
   * ¿Ya hay una hermana con ese nombre? «Autos» bajo Llaveros y «Autos» bajo Figuras son
   * cosas distintas y legítimas; solo choca el nombre repetido DENTRO de la misma madre
   * (o entre las de primer nivel). `exceptoId` deja afuera a la propia categoría al mover.
   */
  const hayHermanaIgual = (madreId: string | null, name: string, exceptoId?: string) =>
    categories.some(
      (c) =>
        c.id !== exceptoId &&
        (c.parentId ?? null) === madreId &&
        c.name.toLowerCase() === name.toLowerCase(),
    );

  const crear = async () => {
    const name = nueva.trim();
    if (!name) return;
    const madreId = nuevaMadre || null;
    if (hayHermanaIgual(madreId, name)) {
      notify.error(
        madreId
          ? 'Ya existe una subcategoría con ese nombre en esa categoría'
          : 'Ya existe una categoría con ese nombre',
      );
      return;
    }
    try {
      await create.mutateAsync({ name, parentId: madreId });
      // La madre elegida se conserva: es el gesto natural al cargar varias subcategorías.
      setNueva('');
      notify.success(madreId ? 'Subcategoría creada' : 'Categoría creada');
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  const guardarNombre = async (c: StoreCategory) => {
    const name = borrador.trim();
    if (!name) return;
    // El servidor NO lo rechaza (sufija el enlace y el nombre no es único): se corta acá.
    if (hayHermanaIgual(c.parentId ?? null, name, c.id)) {
      notify.error(
        c.parentId
          ? 'Ya existe una subcategoría con ese nombre en esa categoría'
          : 'Ya existe una categoría con ese nombre',
      );
      return;
    }
    try {
      // Solo el nombre: la madre no viaja, el servidor la conserva.
      await update.mutateAsync({ id: c.id, name });
      setEditando(null);
      notify.success('Categoría renombrada');
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  const empezarMover = (c: StoreCategory) => {
    setEditando(null);
    setMoviendo(c.id);
    setDestino(c.parentId ?? '');
  };

  const confirmarMover = async (c: StoreCategory) => {
    const madreId = destino || null;
    if (hayHermanaIgual(madreId, c.name, c.id)) {
      notify.error(`Ya hay una categoría llamada "${c.name}" en ese destino. Renombrala antes de moverla.`);
      return;
    }
    try {
      // Solo la madre: el nombre no viaja, el servidor lo conserva (y con él, el enlace).
      await update.mutateAsync({ id: c.id, parentId: madreId });
      setMoviendo(null);
      notify.success('Categoría movida');
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  const borrar = async (id: string, name: string) => {
    const hijas = descendientesDe(categories, id).length;
    if (hijas > 0) {
      // El servidor tampoco la deja borrar; se avisa acá para no pedir una confirmación inútil.
      notify.error(
        `"${name}" tiene ${hijas} subcategoría${hijas === 1 ? '' : 's'}. Movelas o borralas primero.`,
      );
      return;
    }
    // Sin hijas, los productos directos son todos los que quedan sueltos.
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

  const fila = (c: StoreCategory, nivel: 'madre' | 'hija', tieneHijas: boolean) => {
    const usan = enUso(c.id);
    return (
      <li
        key={c.id}
        data-nivel={nivel}
        className={`flex items-center gap-2 p-2.5 ${nivel === 'hija' ? 'bg-muted/30 pl-7' : ''}`}
      >
        {nivel === 'hija' && (
          <CornerDownRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        {editando === c.id ? (
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void guardarNombre(c);
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
              className="text-success hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={update.isPending}
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Cancelar"
              className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setEditando(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </form>
        ) : moviendo === c.id ? (
          <div className="flex flex-1 items-center gap-2">
            <div className="min-w-0 flex-1">
              <Select
                aria-label={`Nueva madre de ${c.name}`}
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
              >
                <option value="">{SIN_MADRE}</option>
                {raices
                  .filter((r) => r.id !== c.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </Select>
            </div>
            <button
              type="button"
              aria-label="Confirmar mover"
              className="text-success hover:opacity-80 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={update.isPending || destino === (c.parentId ?? '')}
              onClick={() => void confirmarMover(c)}
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Cancelar mover"
              className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setMoviendo(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p data-nombre className="truncate text-sm font-medium">
                {c.name}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                /{c.slug}
                {usan > 0 && ` · ${usan} producto${usan === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Renombrar ${c.name}`}
              className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setMoviendo(null);
                setEditando(c.id);
                setBorrador(c.name);
              }}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Mover ${c.name}`}
              title={
                tieneHijas
                  ? 'Tiene subcategorías: no puede quedar dentro de otra (máximo dos niveles)'
                  : 'Cambiar de categoría madre'
              }
              className="text-muted-foreground hover:text-foreground disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={tieneHijas}
              onClick={() => empezarMover(c)}
            >
              <FolderInput className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={`Borrar ${c.name}`}
              className="text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => void borrar(c.id, c.name)}
              disabled={remove.isPending}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </li>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Categorías de la tienda"
      description="Agrupan los productos en la vitrina, en dos niveles: categoría y subcategoría. El enlace se genera solo desde el nombre."
    >
      <div className="space-y-4 overflow-y-auto">
        {/* Enter = crear: es el gesto natural cuando cargas varias seguidas. */}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void crear();
          }}
        >
          <FieldGrid min="11rem">
            <Field label="Nombre">
              <Input
                autoFocus
                placeholder="Llaveros"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                aria-label="Nombre de la categoría nueva"
              />
            </Field>
            <Field label="Categoría madre">
              <Select
                aria-label="Categoría madre"
                value={nuevaMadre}
                onChange={(e) => setNuevaMadre(e.target.value)}
              >
                <option value="">{SIN_MADRE}</option>
                {raices.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldGrid>
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
            {arbol.flatMap(({ categoria, hijas }) => [
              fila(categoria, 'madre', hijas.length > 0),
              ...hijas.map((h) => fila(h, 'hija', false)),
            ])}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          Renombrar una categoría cambia también su enlace público. Borrarla no borra productos: los
          deja sin categoría. Una categoría con subcategorías no se puede borrar hasta moverlas o
          borrarlas.
        </p>
      </div>
    </Dialog>
  );
}
