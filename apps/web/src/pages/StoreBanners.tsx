import * as React from 'react';
import { GalleryHorizontalEnd, ImageOff, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import {
  STORE_IMAGE_MAX_BYTES,
  STORE_IMAGE_MIME_TYPES,
  type StoreBannerKind,
  type StoreBannerLinkType,
} from '@calc3d/shared';
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
  uploadBannerImage,
  useCreateStoreBanner,
  useDeleteStoreBanner,
  useReorderStoreBanners,
  useStoreBanners,
  useUpdateStoreBanner,
  type StoreBanner,
} from '@/features/store/banners-api';
import { moveItem, useStoreCategories, useStoreProducts, useStoreStatus } from '@/features/store/api';
import { ReorderControls } from '@/features/store/ReorderControls';

/** Estado del formulario de un banner (crear o editar). */
interface FormState {
  id: string | null;
  title: string;
  subtitle: string;
  kind: StoreBannerKind;
  imageKey: string;
  /** EL FONDO del hero: otra imagen que `imageKey`, que es el arte de al lado. */
  backgroundKey: string;
  backgroundUrl: string;
  /** Solo en CATEGORIA: dónde se MUESTRA (no confundir con el destino del enlace). */
  categoryId: string;
  imageUrl: string;
  linkType: StoreBannerLinkType;
  linkValue: string;
  visible: boolean;
}

const VACIO: FormState = {
  id: null,
  title: '',
  subtitle: '',
  kind: 'HERO',
  imageKey: '',
  backgroundKey: '',
  backgroundUrl: '',
  categoryId: '',
  imageUrl: '',
  linkType: 'NONE',
  linkValue: '',
  visible: true,
};

const DESTINO_LABEL: Record<StoreBannerLinkType, string> = {
  NONE: 'Sin enlace',
  CATEGORY: 'Categoría',
  PRODUCT: 'Producto',
  URL: 'Enlace externo',
};

export function StoreBannersPage() {
  const { data: banners, isLoading } = useStoreBanners();
  const { data: status } = useStoreStatus();
  const reorder = useReorderStoreBanners();
  const del = useDeleteStoreBanner();
  const confirm = useConfirm();

  const [abierto, setAbierto] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(VACIO);

  const lista = banners ?? [];

  const nuevo = () => {
    setForm(VACIO);
    setAbierto(true);
  };

  const editar = (b: StoreBanner) => {
    setForm({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle ?? '',
      kind: b.kind,
      imageKey: b.imageKey ?? '',
      backgroundKey: b.backgroundKey ?? '',
      backgroundUrl: b.backgroundUrl ?? '',
      categoryId: b.categoryId ?? '',
      imageUrl: b.imageUrl ?? '',
      linkType: b.linkType,
      linkValue: b.linkValue ?? '',
      visible: b.visible,
    });
    setAbierto(true);
  };

  const mover = async (from: number, to: number) => {
    const ids = moveItem(lista, from, to).map((b) => b.id);
    try {
      await reorder.mutateAsync(ids);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  const borrar = async (b: StoreBanner) => {
    const ok = await confirm({
      title: `Borrar el banner "${b.title}"`,
      description: 'Se quita del carrusel de la tienda. La imagen se elimina del almacenamiento.',
      confirmLabel: 'Borrar',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await del.mutateAsync(b.id);
      notify.success('Banner borrado');
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
            <h1 className="font-display text-2xl font-bold">Banners</h1>
            <p className="text-sm text-muted-foreground">Los que rotan en el carrusel de la tienda.</p>
          </div>
        </div>
        <Button onClick={nuevo} disabled={!status?.storageReady}>
          <Plus className="h-4 w-4" /> Nuevo banner
        </Button>
      </div>

      {status && !status.storageReady && (
        <Card className="border-amber-500/50 p-4 text-sm text-muted-foreground">
          El almacenamiento de imágenes no está configurado, así que todavía no se pueden cargar banners.
        </Card>
      )}

      {isLoading ? (
        <TableSkeleton rows={3} />
      ) : lista.length === 0 ? (
        <EmptyState
          icon={GalleryHorizontalEnd}
          title="Sin banners todavía"
          description="Agrega un banner para que aparezca en el carrusel de la home. Mientras no haya ninguno, la tienda muestra sus banners por defecto."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((b, i) => (
            <div key={b.id} className="group relative">
              <Card className="overflow-hidden">
                {b.imageUrl ? (
                  <img src={b.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[16/9] w-full items-center justify-center bg-muted text-muted-foreground">
                    <ImageOff className="h-6 w-6" />
                  </div>
                )}
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate font-display font-semibold">{b.title}</h3>
                    <Badge variant={b.visible ? 'success' : 'outline'}>
                      {b.visible ? 'Publicado' : 'Oculto'}
                    </Badge>
                  </div>
                  {b.subtitle && <p className="truncate text-sm text-muted-foreground">{b.subtitle}</p>}
                  <p className="text-xs text-muted-foreground">
                    {DESTINO_LABEL[b.linkType]}
                    {b.linkValue ? `: ${b.linkValue}` : ''}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => editar(b)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => borrar(b)} aria-label={`Borrar ${b.title}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
              <ReorderControls
                className="absolute right-2 top-2 opacity-100 sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100"
                index={i}
                total={lista.length}
                onMove={(to) => mover(i, to)}
                itemLabel="banner"
              />
            </div>
          ))}
        </div>
      )}

      {abierto && (
        <BannerForm
          form={form}
          setForm={setForm}
          onClose={() => setAbierto(false)}
          storageReady={!!status?.storageReady}
        />
      )}
    </div>
  );
}

function BannerForm({
  form,
  setForm,
  onClose,
  storageReady,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onClose: () => void;
  storageReady: boolean;
}) {
  const crear = useCreateStoreBanner();
  const actualizar = useUpdateStoreBanner(form.id ?? '');
  const { data: categorias } = useStoreCategories();
  const { data: productos } = useStoreProducts();

  const fileRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [previa, setPrevia] = React.useState<string>(form.imageUrl);
  // EL FONDO del hero: su propio archivo y su propia vista previa. Es otra imagen que el
  // arte de al lado, no una variante de la misma.
  const fondoRef = React.useRef<HTMLInputElement>(null);
  const [fileFondo, setFileFondo] = React.useState<File | null>(null);
  const [previaFondo, setPreviaFondo] = React.useState<string>(form.backgroundUrl);
  const [guardando, setGuardando] = React.useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  /** Tipo y tamaño, las mismas reglas que exige el servidor. `null` = no sirve. */
  const archivoValido = (f: File | undefined): File | null => {
    if (!f) return null;
    if (!(STORE_IMAGE_MIME_TYPES as readonly string[]).includes(f.type)) {
      notify.error('La imagen debe ser PNG, JPEG o WebP');
      return null;
    }
    if (f.size > STORE_IMAGE_MAX_BYTES) {
      notify.error('La imagen no puede pesar más de 5 MB');
      return null;
    }
    return f;
  };

  const elegirArchivo = (f: File | undefined) => {
    const ok = archivoValido(f);
    if (!ok) return;
    setFile(ok);
    setPrevia(URL.createObjectURL(ok));
  };

  const elegirFondo = (f: File | undefined) => {
    const ok = archivoValido(f);
    if (!ok) return;
    setFileFondo(ok);
    setPreviaFondo(URL.createObjectURL(ok));
  };

  const guardar = async () => {
    if (!form.title.trim()) {
      notify.error('Pon un título');
      return;
    }
    // Cada tipo pide lo suyo. Se valida ANTES de subir: si no, el servidor rechaza
    // (400) recién después del upload y queda una imagen huérfana en R2.
    // ⚠️ El HERO admite el fondo, el arte de al lado, o los dos — pero alguna imagen
    // tiene que haber, que es lo que exige el contrato. La CATEGORIA sigue pidiendo su
    // imagen, que ahí ES el banner entero.
    const hayFondo = !!fileFondo || !!form.backgroundKey;
    const hayArte = !!file || !!form.imageKey;
    if (form.kind === 'HERO' && !hayArte && !hayFondo) {
      notify.error('Sube el fondo, la imagen de al lado, o las dos');
      return;
    }
    if (form.kind === 'CATEGORIA' && !hayArte) {
      notify.error('Sube una imagen');
      return;
    }
    if (form.kind === 'CATEGORIA' && !form.categoryId) {
      notify.error('Elige la categoría donde se muestra');
      return;
    }
    // Validar el destino ANTES de subir la imagen: si no, el servidor rechaza
    // (400) recién después del upload y queda una imagen huérfana en R2.
    const destino = form.linkValue.trim();
    if ((form.linkType === 'CATEGORY' || form.linkType === 'PRODUCT') && !destino) {
      notify.error('Elige el destino del enlace');
      return;
    }
    if (form.linkType === 'URL') {
      if (!destino) {
        notify.error('Pon el enlace (tiene que empezar con http:// o https://)');
        return;
      }
      if (!/^https?:\/\//i.test(destino)) {
        notify.error('El enlace tiene que empezar con http:// o https://');
        return;
      }
    }
    setGuardando(true);
    try {
      // Un banner de TEXTO no sube ni manda imagen: el contrato la PROHÍBE.
      const imageKey =
        form.kind === 'TEXTO' ? null : file ? (await uploadBannerImage(file)).key : form.imageKey || null;
      // El fondo es SOLO del hero: el contrato lo prohíbe en los otros dos tipos, así que
      // mandarlo igual sería un 400 después de haber subido el archivo.
      const backgroundKey =
        form.kind !== 'HERO'
          ? null
          : fileFondo
            ? (await uploadBannerImage(fileFondo)).key
            : form.backgroundKey || null;
      const dto = {
        kind: form.kind,
        title: form.title,
        subtitle: form.subtitle || null,
        imageKey,
        backgroundKey,
        categoryId: form.kind === 'CATEGORIA' ? form.categoryId : null,
        linkType: form.linkType,
        linkValue: form.linkType === 'NONE' ? null : form.linkValue || null,
        visible: form.visible,
      };
      if (form.id) await actualizar.mutateAsync(dto);
      else await crear.mutateAsync(dto);
      notify.success(form.id ? 'Banner guardado' : 'Banner creado');
      onClose();
    } catch (e) {
      notify.error(apiErrorMessage(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={form.id ? 'Editar banner' : 'Nuevo banner'}
    >
      <div className="space-y-4">
        <Field
          label="Tipo"
          required
          hint="Dónde se muestra. No es lo mismo que el destino, que es adónde lleva."
        >
          <Select
            value={form.kind}
            onChange={(e) => set('kind', e.target.value as StoreBannerKind)}
          >
            <option value="HERO">Carrusel de la portada</option>
            <option value="TEXTO">Franja de texto de arriba</option>
            <option value="CATEGORIA">Dentro de una categoría</option>
          </Select>
        </Field>

        {form.kind === 'CATEGORIA' && (
          <Field label="Categoría donde se muestra" required hint="Se ve en esa categoría y en las fichas de sus productos.">
            <Select
              value={form.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
            >
              <option value="">Elige una…</option>
              {(categorias ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {/* ⚠️ EL FONDO va PRIMERO, y es a propósito: es la pieza grande de la campaña, y
            la de al lado es el complemento. Solo existe en el hero — el contrato lo
            prohíbe en los otros dos tipos. */}
        {form.kind === 'HERO' && (
          <Field
            label="Fondo de la portada"
            hint="Opcional. Se ve a todo el ancho detrás del texto, con un velo oscuro encima para que el título se lea. PNG, JPEG o WebP, hasta 5 MB. Apaisada y ancha (21:9 o 16:9)."
          >
            <div className="space-y-2">
              {previaFondo ? (
                <img src={previaFondo} alt="" className="aspect-[21/9] w-full rounded-lg object-cover" />
              ) : (
                <div className="flex aspect-[21/9] w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <ImageOff className="h-6 w-6" />
                </div>
              )}
              <input
                ref={fondoRef}
                type="file"
                accept={STORE_IMAGE_MIME_TYPES.join(',')}
                className="hidden"
                onChange={(e) => {
                  elegirFondo(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fondoRef.current?.click()}
                  disabled={!storageReady}
                >
                  <Upload className="h-4 w-4" /> {previaFondo ? 'Cambiar fondo' : 'Subir fondo'}
                </Button>
                {previaFondo && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setFileFondo(null);
                      setPreviaFondo('');
                      set('backgroundKey', '');
                      set('backgroundUrl', '');
                    }}
                  >
                    Quitar fondo
                  </Button>
                )}
              </div>
            </div>
          </Field>
        )}

        {form.kind !== 'TEXTO' && (
        <Field
          label={form.kind === 'HERO' ? 'Imagen de al lado' : 'Imagen'}
          required={form.kind === 'CATEGORIA'}
          hint={
            form.kind === 'HERO'
              ? 'Opcional si pusiste un fondo. Es la que va al costado del texto, donde hoy está el banano. Horizontal (16:9).'
              : 'PNG, JPEG o WebP, hasta 5 MB. Se recomienda horizontal (16:9).'
          }
        >
          <div className="space-y-2">
            {previa ? (
              <img src={previa} alt="" className="aspect-[16/9] w-full rounded-lg object-cover" />
            ) : (
              <div className="flex aspect-[16/9] w-full items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <ImageOff className="h-6 w-6" />
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={STORE_IMAGE_MIME_TYPES.join(',')}
              className="hidden"
              onChange={(e) => {
                elegirArchivo(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={!storageReady}
            >
              <Upload className="h-4 w-4" /> {previa ? 'Cambiar imagen' : 'Subir imagen'}
            </Button>
          </div>
        </Field>
        )}

        <FieldGrid min="11rem">
          <Field label="Título" required>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Subtítulo">
            <Input value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
          </Field>
        </FieldGrid>

        <FieldGrid min="11rem">
          <Field label="Destino">
            <Select
              value={form.linkType}
              onChange={(e) => {
                set('linkType', e.target.value as StoreBannerLinkType);
                set('linkValue', '');
              }}
            >
              <option value="NONE">Sin enlace</option>
              <option value="CATEGORY">Una categoría</option>
              <option value="PRODUCT">Un producto</option>
              <option value="URL">Un enlace externo</option>
            </Select>
          </Field>

          {form.linkType === 'CATEGORY' && (
            <Field label="Categoría">
              <Select value={form.linkValue} onChange={(e) => set('linkValue', e.target.value)}>
                <option value="">Elegir…</option>
                {(categorias ?? []).map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {form.linkType === 'PRODUCT' && (
            <Field label="Producto">
              <Select value={form.linkValue} onChange={(e) => set('linkValue', e.target.value)}>
                <option value="">Elegir…</option>
                {(productos ?? [])
                  .filter((p) => p.visible)
                  .map((p) => (
                    <option key={p.id} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          {form.linkType === 'URL' && (
            <Field label="Enlace" hint="Tiene que empezar con http:// o https://">
              <Input
                value={form.linkValue}
                onChange={(e) => set('linkValue', e.target.value)}
                placeholder="https://…"
              />
            </Field>
          )}
        </FieldGrid>

        <Switch
          checked={form.visible}
          onChange={(v) => set('visible', v)}
          label={form.visible ? 'Publicado' : 'Oculto'}
        />

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
