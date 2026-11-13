import * as React from 'react';
import { Eye, Layers, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import type { StoreCollectionUpsertDto } from '@calc3d/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FieldGrid,
  Input,
  Select,
  Switch,
  TableSkeleton,
} from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { apiErrorMessage } from '@/lib/api';
import {
  useColeccionPreview,
  useCreateColeccion,
  useDeleteColeccion,
  useSetPrincipalColeccion,
  useStoreColecciones,
  useUpdateColeccion,
  type Coleccion,
} from '@/features/store/colecciones-api';
import { moveItem, useStoreCategories, useStoreProducts } from '@/features/store/api';
import { ReorderControls } from '@/features/store/ReorderControls';

/** Una entrada de la receta: una categoría o un producto suelto. `id` solo si ya existía. */
interface ItemForm {
  id?: string;
  categoryId?: string;
  productId?: string;
}

interface FormState {
  id: string | null;
  nombre: string;
  titulo: string;
  subtitulo: string;
  verTodoTipo: Coleccion['verTodoTipo'];
  verTodoValor: string;
  visible: boolean;
  /** AAAA-MM-DD, tal cual lo da `<input type="date">`; '' = sin fecha. */
  startsAt: string;
  endsAt: string;
  items: ItemForm[];
  exclusiones: string[];
}

const VACIO: FormState = {
  id: null,
  nombre: '',
  titulo: '',
  subtitulo: '',
  verTodoTipo: 'NONE',
  verTodoValor: '',
  visible: true,
  startsAt: '',
  endsAt: '',
  items: [],
  exclusiones: [],
};

/** Cuántas coincidencias muestra un buscador: una lista de 200 botones no se lee. */
const MAX_RESULTADOS = 6;

const quitarAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function ventanaTexto(c: Pick<Coleccion, 'startsAt' | 'endsAt'>): string | null {
  if (!c.startsAt && !c.endsAt) return null;
  if (c.startsAt && c.endsAt) return `${c.startsAt} → ${c.endsAt}`;
  return c.startsAt ? `Desde ${c.startsAt}` : `Hasta ${c.endsAt}`;
}

export function StoreColeccionesPage() {
  const { data: colecciones, isLoading } = useStoreColecciones();
  const setPrincipal = useSetPrincipalColeccion();
  const del = useDeleteColeccion();
  const confirm = useConfirm();

  const [form, setForm] = React.useState<FormState | null>(null);
  const [previa, setPrevia] = React.useState<Coleccion | null>(null);

  const lista = colecciones ?? [];

  const editar = (c: Coleccion) =>
    setForm({
      id: c.id,
      nombre: c.nombre,
      titulo: c.titulo,
      subtitulo: c.subtitulo ?? '',
      verTodoTipo: c.verTodoTipo,
      verTodoValor: c.verTodoValor ?? '',
      visible: c.visible,
      startsAt: c.startsAt ?? '',
      endsAt: c.endsAt ?? '',
      items: [...c.items]
        .sort((a, b) => a.position - b.position)
        .map((i) => ({
          id: i.id,
          ...(i.categoryId ? { categoryId: i.categoryId } : { productId: i.productId ?? undefined }),
        })),
      exclusiones: [...c.exclusiones],
    });

  const hacerPrincipal = async (c: Coleccion) => {
    try {
      await setPrincipal.mutateAsync(c.id);
      notify.success(`«${c.nombre}» es ahora la colección principal`);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  const borrar = async (c: Coleccion) => {
    const ok = await confirm({
      title: `Borrar la colección "${c.nombre}"`,
      description: 'Se quita de la tienda. Los productos no se borran.',
      confirmLabel: 'Borrar',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await del.mutateAsync(c.id);
      notify.success('Colección borrada');
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-9 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Colecciones</h1>
            <p className="text-sm text-muted-foreground">
              Qué se muestra en la portada de la tienda. Solo la principal sale en la portada.
            </p>
          </div>
        </div>
        <Button onClick={() => setForm(VACIO)}>
          <Plus className="h-4 w-4" /> Nueva colección
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={3} />
      ) : lista.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Sin colecciones todavía"
          description="Mientras no haya una principal vigente, la portada muestra los «Destacados»."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((c) => (
            <Card key={c.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display font-semibold">{c.nombre}</h3>
                <div className="flex flex-wrap justify-end gap-1">
                  {c.esPrincipal && <Badge variant="brand">Principal</Badge>}
                  <Badge variant={c.visible ? 'success' : 'outline'}>{c.visible ? 'Visible' : 'Oculta'}</Badge>
                </div>
              </div>
              <p className="truncate text-sm text-muted-foreground">{c.titulo}</p>
              {ventanaTexto(c) && <p className="text-xs text-muted-foreground">{ventanaTexto(c)}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => editar(c)} aria-label={`Editar ${c.nombre}`}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPrevia(c)}
                  aria-label={`Vista previa de ${c.nombre}`}
                >
                  <Eye className="h-3.5 w-3.5" /> Vista previa
                </Button>
                {!c.esPrincipal && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => hacerPrincipal(c)}
                    aria-label={`Hacer principal ${c.nombre}`}
                  >
                    <Star className="h-3.5 w-3.5" /> Hacer principal
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => borrar(c)} aria-label={`Borrar ${c.nombre}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {form && <ColeccionForm form={form} setForm={setForm as SetForm} lista={lista} onClose={() => setForm(null)} />}
      {previa && <PreviaDialog coleccion={previa} onClose={() => setPrevia(null)} />}
    </div>
  );
}

type SetForm = React.Dispatch<React.SetStateAction<FormState>>;

/**
 * La lista que la tienda publicaría. ⚠️ La pide al SERVIDOR (`/preview`), que usa la misma
 * resolución que el endpoint público: el panel NO la arma con los items y el catálogo, o la
 * previa mentiría el día que las dos definiciones se separen.
 */
function PreviaDialog({ coleccion, onClose }: { coleccion: Coleccion; onClose: () => void }) {
  const { data, isLoading, isError } = useColeccionPreview(coleccion.id);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Vista previa: ${coleccion.nombre}`}>
      <div className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {isError && <p className="text-sm text-destructive">No se pudo cargar la vista previa.</p>}
        {data && (
          <>
            <p className="text-xs text-muted-foreground">Se previsualiza lo último guardado, no los cambios sin guardar.</p>
            <p className="text-sm text-muted-foreground">
              {data.vigente
                ? 'Esta colección es la que muestra la portada hoy.'
                : 'Hoy no se publica en la portada: no es la principal, está oculta o fuera de sus fechas. Esto es lo que mostraría al activarla.'}
            </p>
            {data.productos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entra ningún producto.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.productos.map((p) => (
                  <li key={p.id} className="rounded-md border border-border px-3 py-1.5">
                    {p.name}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Buscador de productos visibles: escribe y toca el resultado. */
function BuscadorDeProductos({
  etiqueta,
  accion,
  productos,
  onElegir,
}: {
  etiqueta: string;
  accion: 'Agregar' | 'Excluir';
  productos: { id: string; name: string }[];
  onElegir: (id: string) => void;
}) {
  const [q, setQ] = React.useState('');
  const encontrados = q.trim()
    ? productos.filter((p) => quitarAcentos(p.name).includes(quitarAcentos(q.trim()))).slice(0, MAX_RESULTADOS)
    : [];
  return (
    <Field label={etiqueta}>
      <div className="space-y-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe un nombre…" />
        {encontrados.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {encontrados.map((p) => (
              <Button
                key={p.id}
                type="button"
                variant="outline"
                size="sm"
                aria-label={`${accion} ${p.name}`}
                onClick={() => {
                  onElegir(p.id);
                  setQ('');
                }}
              >
                {p.name}
              </Button>
            ))}
          </div>
        )}
      </div>
    </Field>
  );
}

function ColeccionForm({
  form,
  setForm,
  lista,
  onClose,
}: {
  form: FormState;
  setForm: SetForm;
  lista: Coleccion[];
  onClose: () => void;
}) {
  const crear = useCreateColeccion();
  const actualizar = useUpdateColeccion(form.id ?? '');
  const { data: categorias } = useStoreCategories();
  const { data: productos } = useStoreProducts();
  const [guardando, setGuardando] = React.useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const cats = categorias ?? [];
  const visibles = (productos ?? []).filter((p) => p.visible);
  const nombreDeCategoria = (id: string) => cats.find((c) => c.id === id)?.name ?? 'Categoría';
  const nombreDeProducto = (id: string) => (productos ?? []).find((p) => p.id === id)?.name ?? 'Producto';
  const etiquetaDe = (it: ItemForm) =>
    it.categoryId ? nombreDeCategoria(it.categoryId) : nombreDeProducto(it.productId ?? '');

  const yaEnCategorias = new Set(form.items.map((i) => i.categoryId).filter(Boolean));
  const yaEnProductos = new Set(form.items.map((i) => i.productId).filter(Boolean));

  const guardar = async () => {
    if (!form.nombre.trim() || !form.titulo.trim()) {
      notify.error('Pon el nombre y el título');
      return;
    }
    if (form.verTodoTipo !== 'NONE' && !form.verTodoValor) {
      notify.error('Elige el destino del «Ver todo»');
      return;
    }
    // ⚠️ Sin `esPrincipal` a propósito: se cambia con su propio endpoint (transaccional).
    // El `position` sale del lugar en la lista, y los items que ya existían conservan su id
    // porque el servidor hace diff por id.
    const dto = {
      nombre: form.nombre.trim(),
      titulo: form.titulo.trim(),
      subtitulo: form.subtitulo.trim() || null,
      verTodoTipo: form.verTodoTipo,
      verTodoValor: form.verTodoTipo === 'NONE' ? null : form.verTodoValor || null,
      visible: form.visible,
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
      items: form.items.map((it, position) => ({ ...it, position })),
      exclusiones: form.exclusiones,
    } as StoreCollectionUpsertDto;
    setGuardando(true);
    try {
      if (form.id) await actualizar.mutateAsync(dto);
      else await crear.mutateAsync(dto);
      notify.success(form.id ? 'Colección guardada' : 'Colección creada');
      onClose();
    } catch (e) {
      notify.error(apiErrorMessage(e));
    } finally {
      setGuardando(false);
    }
  };

  const mover = (from: number, to: number) => set('items', moveItem(form.items, from, to));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={form.id ? 'Editar colección' : 'Nueva colección'}>
      <div className="space-y-4">
        <FieldGrid min="11rem">
          <Field label="Nombre" required hint="Interno: para reconocerla en esta lista.">
            <Input value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
          </Field>
          <Field label="Título" required hint="El que ve el cliente en la portada.">
            <Input value={form.titulo} onChange={(e) => set('titulo', e.target.value)} />
          </Field>
        </FieldGrid>
        <Field label="Subtítulo">
          <Input value={form.subtitulo} onChange={(e) => set('subtitulo', e.target.value)} />
        </Field>

        <FieldGrid min="11rem">
          <Field label="Empieza" hint="Opcional. Sin fecha, vale desde ya.">
            <Input type="date" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
          </Field>
          <Field label="Termina" hint="Opcional. Ese día todavía cuenta.">
            <Input type="date" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} />
          </Field>
        </FieldGrid>

        <div className="space-y-2">
          <p className="text-sm font-medium">Qué entra, en orden</p>
          {form.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay nada. Agrega categorías o productos.</p>
          ) : (
            <ul className="space-y-1.5">
              {form.items.map((it, i) => (
                <li
                  key={it.id ?? `${it.categoryId ?? ''}${it.productId ?? ''}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate">
                    <Badge variant="outline" className="mr-2">
                      {it.categoryId ? 'Categoría' : 'Producto'}
                    </Badge>
                    {etiquetaDe(it)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <ReorderControls index={i} total={form.items.length} onMove={(to) => mover(i, to)} itemLabel={etiquetaDe(it)} />
                    <button
                      type="button"
                      aria-label={`Quitar ${etiquetaDe(it)}`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => set('items', form.items.filter((_, j) => j !== i))}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <FieldGrid min="11rem">
          <Field label="Agregar categoría" hint="Trae sus productos y los de sus subcategorías.">
            <Select
              value=""
              onChange={(e) => e.target.value && set('items', [...form.items, { categoryId: e.target.value }])}
            >
              <option value="">Elegir…</option>
              {cats
                .filter((c) => !yaEnCategorias.has(c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <BuscadorDeProductos
            etiqueta="Buscar producto para agregar"
            accion="Agregar"
            productos={visibles.filter((p) => !yaEnProductos.has(p.id))}
            onElegir={(id) => set('items', [...form.items, { productId: id }])}
          />
        </FieldGrid>

        <div className="space-y-2">
          <BuscadorDeProductos
            etiqueta="Excluir un producto"
            accion="Excluir"
            productos={visibles.filter((p) => !form.exclusiones.includes(p.id))}
            onElegir={(id) => set('exclusiones', [...form.exclusiones, id])}
          />
          {form.exclusiones.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {form.exclusiones.map((id) => (
                <li key={id} className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm">
                  {nombreDeProducto(id)}
                  <button
                    type="button"
                    aria-label={`Dejar de excluir ${nombreDeProducto(id)}`}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => set('exclusiones', form.exclusiones.filter((x) => x !== id))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <FieldGrid min="11rem">
          <Field label="«Ver todo» lleva a">
            <Select
              value={form.verTodoTipo}
              onChange={(e) => {
                set('verTodoTipo', e.target.value as FormState['verTodoTipo']);
                set('verTodoValor', '');
              }}
            >
              <option value="NONE">Ninguna parte</option>
              <option value="CATEGORIA">Una categoría</option>
              <option value="COLECCION">Una colección</option>
            </Select>
          </Field>
          {form.verTodoTipo === 'CATEGORIA' && (
            <Field label="Categoría del «Ver todo»">
              <Select value={form.verTodoValor} onChange={(e) => set('verTodoValor', e.target.value)}>
                <option value="">Elegir…</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {form.verTodoTipo === 'COLECCION' && (
            <Field label="Colección del «Ver todo»">
              <Select value={form.verTodoValor} onChange={(e) => set('verTodoValor', e.target.value)}>
                <option value="">Elegir…</option>
                {lista
                  .filter((c) => c.id !== form.id)
                  .map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.nombre}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
        </FieldGrid>

        <Switch checked={form.visible} onChange={(v) => set('visible', v)} label={form.visible ? 'Visible' : 'Oculta'} />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
