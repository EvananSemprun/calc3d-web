import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Download, ArrowLeft, ImagePlus, Plus, Tags, Trash2, X } from 'lucide-react';
import {
  STORE_IMAGE_MAX_BYTES,
  STORE_IMAGE_MAX_COUNT,
  STORE_IMAGE_MIME_TYPES,
  productMarkup,
  slugify,
  type StoreProductKind,
} from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { notify } from '@/components/toast';
import { useConfirm } from '@/components/overlays';
import { useMoney } from '@/features/settings/useSettings';
import {
  deleteStoreImage,
  moveItem,
  uploadStoreImage,
  useReorderStoreImages,
  useDeleteStoreProduct,
  useStoreCategories,
  useStoreInvalidate,
  useStoreProduct,
  useStoreStatus,
  useUpdateStoreProduct,
  type StoreImage,
} from '@/features/store/api';
import { StoreCategoriesModal } from '@/features/store/StoreCategoriesModal';
import { ReorderControls } from '@/features/store/ReorderControls';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  NumberInput,
  PageSkeleton,
  Select,
  Switch,
  FieldGrid,
} from '@/components/ui';

/**
 * Grupo/opción en edición. Se CONSERVAN los `id` de lo que ya existía: el
 * backend guarda con diff por id (Fase B), así que un id preservado es lo que
 * hace que las fotos enlazadas a una opción sobrevivan a editar el producto.
 * Lo nuevo va sin `id` y el backend lo crea.
 */
interface OpcionEdit {
  id?: string;
  value: string;
  priceDeltaUsd: number;
  swatchHex: string | null;
  /** Fotos propias del color (solo en el grupo que define la foto). */
  images: StoreImage[];
}

interface GrupoEdit {
  id?: string;
  name: string;
  required: boolean;
  /** Marca el grupo cuyas opciones definen la foto de la ficha (a lo sumo uno). */
  drivesPhoto: boolean;
  options: OpcionEdit[];
}

export function StoreProductDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { money, percent } = useMoney();

  const { data: product, isLoading } = useStoreProduct(id);
  const { data: categories = [] } = useStoreCategories();
  const { data: status } = useStoreStatus();
  const update = useUpdateStoreProduct(id);
  const remove = useDeleteStoreProduct();
  const reorderImages = useReorderStoreImages(id);
  const invalidate = useStoreInvalidate();

  const fileRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [categorias, setCategorias] = useState(false);

  const [form, setForm] = useState({
    name: '',
    kind: 'PHYSICAL' as StoreProductKind,
    summary: '',
    description: '',
    priceUsd: 0,
    // NumberInput muestra vacío cuando el valor es 0, así que 0 = "sin valor"
    // para los campos opcionales; al guardar se traducen a null.
    compareAtUsd: 0,
    leadTimeDays: 0,
    minQty: 1,
    visible: false,
    categoryId: '',
    material: '',
    badge: '',
    custom: false,
  });
  const [grupos, setGrupos] = useState<GrupoEdit[]>([]);
  const [specs, setSpecs] = useState<{ label: string; value: string }[]>([]);
  // Tramos de precio por cantidad. En la UI el descuento va en %, se guarda fracción.
  const [tramos, setTramos] = useState<{ minQty: number; discountPct: number }[]>([]);

  useEffect(() => {
    if (!product) return;
    setForm({
      name: product.name,
      kind: product.kind,
      summary: product.summary ?? '',
      description: product.description ?? '',
      priceUsd: Number(product.priceUsd),
      compareAtUsd: product.compareAtUsd == null ? 0 : Number(product.compareAtUsd),
      leadTimeDays: product.leadTimeDays ?? 0,
      minQty: product.minQty,
      visible: product.visible,
      categoryId: product.categoryId ?? '',
      material: product.material ?? '',
      badge: product.badge ?? '',
      custom: product.custom,
    });
    setSpecs(product.specs ?? []);
    setTramos(product.priceTiers ?? []);
    setGrupos(
      product.optionGroups.map((g) => ({
        id: g.id,
        name: g.name,
        required: g.required,
        drivesPhoto: g.drivesPhoto,
        options: g.options.map((o) => ({
          id: o.id,
          value: o.value,
          priceDeltaUsd: Number(o.priceDeltaUsd),
          swatchHex: o.swatchHex,
          images: o.images ?? [],
        })),
      })),
    );
  }, [product]);

  if (isLoading || !product) return <PageSkeleton />;

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const costo = product.costAtPublish == null ? null : Number(product.costAtPublish);
  const markup = costo != null && costo > 0 ? productMarkup(form.priceUsd, costo) : null;
  // El enlace público se recalcula al vuelo, pero manda el backend (resuelve choques).
  const slugPrevio = slugify(form.name) || product.slug;

  const guardar = async () => {
    // Validar los tramos ANTES de mandar: el servidor también los valida, pero
    // avisamos acá para no esperar un 400.
    const tramosLimpios = tramos
      .filter((t) => t.minQty > 0)
      .sort((a, b) => a.minQty - b.minQty);
    for (let i = 0; i < tramosLimpios.length; i++) {
      const t = tramosLimpios[i];
      if (t.minQty <= form.minQty) {
        notify.error(`Un tramo tiene que superar el mínimo del producto (${form.minQty})`);
        return;
      }
      if (i > 0 && t.minQty === tramosLimpios[i - 1].minQty) {
        notify.error('Hay dos tramos con la misma cantidad');
        return;
      }
      if (t.discountPct <= 0 || t.discountPct >= 1) {
        notify.error('El descuento de un tramo tiene que ir entre 1 % y 99 %');
        return;
      }
    }
    try {
      await update.mutateAsync({
        priceTiers: tramosLimpios,
        name: form.name,
        kind: form.kind,
        summary: form.summary || null,
        description: form.description || null,
        priceUsd: form.priceUsd,
        compareAtUsd: form.compareAtUsd > 0 ? form.compareAtUsd : null,
        leadTimeDays: form.leadTimeDays > 0 ? form.leadTimeDays : null,
        minQty: form.minQty,
        visible: form.visible,
        categoryId: form.categoryId || null,
        material: form.material.trim() || null,
        badge: form.badge.trim() || null,
        custom: form.custom,
        // Las filas a medio llenar no se guardan: el diseño las mostraría vacías.
        specs: specs.filter((e) => e.label.trim() && e.value.trim()),
        optionGroups: grupos
          // Un grupo sin nombre o sin opciones no se manda: el backend lo rechazaría.
          .filter((g) => g.name.trim() && g.options.some((o) => o.value.trim()))
          .map((g) => ({
            // Los ids preservados son lo que el diff del backend reconoce para no
            // borrar y recrear (y perder las fotos enlazadas a una opción).
            ...(g.id ? { id: g.id } : {}),
            name: g.name.trim(),
            required: g.required,
            drivesPhoto: g.drivesPhoto,
            options: g.options
              .filter((o) => o.value.trim())
              .map((o) => ({
                ...(o.id ? { id: o.id } : {}),
                value: o.value.trim(),
                priceDeltaUsd: o.priceDeltaUsd || 0,
                swatchHex: o.swatchHex || null,
              })),
          })),
      });
      notify.success('Producto guardado');
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  /** Desglose de costos para uso propio. NUNCA se le manda al cliente. */
  const descargarDesglose = async () => {
    try {
      const res = await api.get(`/store/products/${id}/desglose.pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `desglose-interno-${product?.name ?? id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  const borrar = async () => {
    const ok = await confirm({
      title: `Borrar "${product.name}"`,
      description:
        'Se quita de la tienda junto con sus fotos. Si estaba publicado, deja de verse en la web.',
      confirmLabel: 'Borrar',
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(product.id);
      navigate('/store');
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  const subirFoto = async (file: File | undefined) => {
    if (!file) return;
    if (!(STORE_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      notify.error('La foto debe ser PNG, JPEG o WebP');
      return;
    }
    if (file.size > STORE_IMAGE_MAX_BYTES) {
      notify.error('La foto no puede pesar más de 5 MB');
      return;
    }
    setSubiendo(true);
    try {
      await uploadStoreImage(product.id, file);
      invalidate();
      notify.success('Foto agregada');
    } catch (e) {
      notify.error(apiErrorMessage(e));
    } finally {
      setSubiendo(false);
    }
  };

  // La PRIMERA foto es la portada de la vitrina, así que el orden importa.
  const moverFoto = async (from: number, to: number) => {
    const ids = moveItem(fotosBase, from, to).map((i) => i.id);
    try {
      await reorderImages.mutateAsync(ids);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  const quitarFoto = async (imageId: string) => {
    try {
      await deleteStoreImage(product.id, imageId);
      invalidate();
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  // Foto de un COLOR: va enlazada a su opción (Fase B). Reusa el mismo flujo de
  // subida que la galería base, pasando el optionId.
  const subirFotoOpcion = async (optionId: string, file: File | undefined) => {
    if (!file) return;
    if (!(STORE_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
      notify.error('La foto debe ser PNG, JPEG o WebP');
      return;
    }
    if (file.size > STORE_IMAGE_MAX_BYTES) {
      notify.error('La foto no puede pesar más de 5 MB');
      return;
    }
    try {
      await uploadStoreImage(product.id, file, optionId);
      invalidate();
      notify.success('Foto del color agregada');
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  const quitarFotoOpcion = async (imageId: string) => {
    try {
      await deleteStoreImage(product.id, imageId);
      invalidate();
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  // Galería base = las fotos de nivel producto (las de un color viajan en su
  // opción). Filtrar acá evita que una foto de color salga también en la portada.
  const fotosBase = product.images.filter((img) => img.optionId == null);

  return (
    <div className="space-y-5">
      <Link
        to="/store"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Tienda
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-9 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">{form.name || 'Sin nombre'}</h1>
            <p className="font-mono text-xs text-muted-foreground">/{slugPrevio}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Switch
            checked={form.visible}
            onChange={(v) => set('visible', v)}
            label={form.visible ? 'Publicado' : 'Borrador'}
          />
          <Button onClick={guardar} disabled={update.isPending}>
            {update.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          {/* ⚠️ Documento INTERNO: lleva costos y márgenes. Solo aparece si la
              ficha tiene costeo; sin él no hay desglose que mostrar. */}
          {product?.recost && (
            <Button
              variant="outline"
              onClick={() => descargarDesglose()}
              title="Costos y márgenes. No se le manda al cliente."
            >
              <Download className="h-4 w-4" /> Desglose interno
            </Button>
          )}
          <Button variant="outline" onClick={borrar} disabled={remove.isPending}>
            <Trash2 className="h-4 w-4" /> Borrar
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Ficha</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FieldGrid>
                <Field label="Nombre" required>
                  <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
                </Field>
                <Field label="Tipo" hint="Un servicio no se imprime ni se entrega en mano">
                  <Select
                    value={form.kind}
                    onChange={(e) => set('kind', e.target.value as StoreProductKind)}
                  >
                    <option value="PHYSICAL">Producto físico</option>
                    <option value="SERVICE">Servicio</option>
                  </Select>
                </Field>
              </FieldGrid>
              <Field label="Resumen" hint="Una línea, la que se ve en la tarjeta de la vitrina">
                <Input value={form.summary} onChange={(e) => set('summary', e.target.value)} />
              </Field>
              <Field label="Descripción">
                <textarea
                  className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>
              <FieldGrid>
                <Field label="Material" hint="Se muestra en la tarjeta, junto a la categoría">
                  <Input
                    list="materiales-tienda"
                    placeholder="PLA"
                    value={form.material}
                    onChange={(e) => set('material', e.target.value)}
                  />
                  <datalist id="materiales-tienda">
                    {['PLA', 'PETG', 'ABS', 'TPU', 'Resina', 'ASA', 'Nylon'].map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Insignia" hint='Esquina de la tarjeta: "Nuevo", "Más vendido"'>
                  <Input
                    maxLength={24}
                    placeholder="Nuevo"
                    value={form.badge}
                    onChange={(e) => set('badge', e.target.value)}
                  />
                </Field>
              </FieldGrid>
              <Switch
                checked={form.custom}
                onChange={(v) => set('custom', v)}
                label="Se puede personalizar (nombre, logo o forma del cliente)"
              />
              <Field
                label="Categoría"
                hint={
                  categories.length === 0
                    ? 'Todavía no hay ninguna: creá la primera con el botón de al lado'
                    : undefined
                }
              >
                {/* Se gestionan desde acá mismo para no tener que salir de la ficha. */}
                <div className="flex items-center gap-2">
                  <Select
                    className="flex-1"
                    value={form.categoryId}
                    onChange={(e) => set('categoryId', e.target.value)}
                  >
                    <option value="">Sin categoría</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Button variant="outline" onClick={() => setCategorias(true)}>
                    <Tags className="h-4 w-4" /> Gestionar
                  </Button>
                </div>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fotos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {status && !status.storageReady && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  El almacenamiento no está configurado en el servidor: la carga de fotos está
                  deshabilitada.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {fotosBase.map((img, i) => (
                  <div
                    key={img.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-brand-blue/10"
                  >
                    <img
                      src={img.url}
                      alt={img.alt ?? ''}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    {i === 0 && (
                      <span className="absolute left-1 top-1 rounded-full bg-brand-yellow px-1.5 py-0.5 text-[10px] font-bold text-brand-yellow-foreground">
                        Portada
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => quitarFoto(img.id)}
                      aria-label={`Quitar la foto ${i + 1}`}
                      className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-background/90 text-destructive opacity-100 ring-1 ring-border transition-opacity sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <ReorderControls
                      className="absolute inset-x-1 bottom-1 justify-center rounded-md bg-background/85 py-0.5 backdrop-blur-sm"
                      index={i}
                      total={fotosBase.length}
                      itemLabel={`la foto ${i + 1}`}
                      firstLabel="Usar como portada"
                      onMove={(to) => moverFoto(i, to)}
                    />
                  </div>
                ))}
                {fotosBase.length < STORE_IMAGE_MAX_COUNT && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={subiendo || !status?.storageReady}
                    className="grid aspect-square place-items-center rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-brand-blue/50 hover:text-foreground disabled:opacity-50"
                  >
                    <span className="flex flex-col items-center gap-1 text-xs">
                      <ImagePlus className="h-5 w-5" />
                      {subiendo ? 'Subiendo…' : 'Agregar'}
                    </span>
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={STORE_IMAGE_MIME_TYPES.join(',')}
                className="hidden"
                onChange={(e) => {
                  void subirFoto(e.target.files?.[0]);
                  e.target.value = ''; // permite reelegir el mismo archivo tras un error
                }}
              />
              <p className="text-xs text-muted-foreground">
                PNG, JPEG o WebP, hasta 5 MB. Máximo {STORE_IMAGE_MAX_COUNT} fotos. La primera es la
                portada: la que se ve en la vitrina.
              </p>
            </CardContent>
          </Card>

          <SpecsEditor specs={specs} onChange={setSpecs} />

          <OpcionesEditor
            grupos={grupos}
            onChange={setGrupos}
            storageReady={!!status?.storageReady}
            onSubirFoto={subirFotoOpcion}
            onQuitarFoto={quitarFotoOpcion}
          />
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Precio y entrega</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Precio de venta (USD)" required>
                <NumberInput
                  value={form.priceUsd}
                  onChange={(v) => set('priceUsd', v)}
                  min={0}
                  step={0.5}
                />
              </Field>
              <Field label="Precio tachado (USD)" hint="Opcional, para mostrar una oferta">
                <NumberInput
                  value={form.compareAtUsd}
                  onChange={(v) => set('compareAtUsd', v)}
                  min={0}
                  step={0.5}
                />
              </Field>
              <Field label="Días de producción" hint="Se produce bajo pedido: no hay stock">
                <NumberInput
                  value={form.leadTimeDays}
                  onChange={(v) => set('leadTimeDays', v)}
                  min={0}
                  step={1}
                />
              </Field>
              <Field label="Cantidad mínima">
                <NumberInput
                  value={form.minQty}
                  onChange={(v) => set('minQty', v || 1)}
                  min={1}
                  step={1}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Precios por cantidad</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Descuento de mayoreo: desde cierta cantidad, un % de descuento sobre el precio.
              </p>
              {tramos.map((t, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Field label="Desde (cantidad)">
                    <NumberInput
                      aria-label="Cantidad del tramo"
                      value={t.minQty}
                      onChange={(v) =>
                        setTramos((ts) => ts.map((x, xi) => (xi === i ? { ...x, minQty: v || 0 } : x)))
                      }
                    />
                  </Field>
                  <Field label="% de descuento">
                    <NumberInput
                      aria-label="Descuento del tramo %"
                      value={Math.round(t.discountPct * 100)}
                      onChange={(v) =>
                        setTramos((ts) =>
                          ts.map((x, xi) => (xi === i ? { ...x, discountPct: (v || 0) / 100 } : x)),
                        )
                      }
                    />
                  </Field>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Quitar tramo"
                    onClick={() => setTramos((ts) => ts.filter((_, xi) => xi !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTramos((ts) => [...ts, { minQty: 0, discountPct: 0 }])}
              >
                <Plus className="h-4 w-4" /> Agregar tramo
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Costeo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {costo == null ? (
                <p className="text-muted-foreground">
                  Esta ficha se cargó a mano, sin enlace a un costeo. Publicala desde un producto o
                  una cotización para ver el margen acá.
                </p>
              ) : (
                <>
                  <Row label="Costo por unidad" value={money(costo)} />
                  <Row label="Precio de venta" value={money(form.priceUsd)} />
                  <Row
                    label="Margen sobre el costo"
                    value={markup == null ? '—' : percent(markup, 0)}
                  />
                  {markup != null && markup < 0 && (
                    <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs font-medium text-destructive">
                      El precio de venta está por debajo del costo: cada unidad vendida pierde{' '}
                      {money(costo - form.priceUsd)}.
                    </p>
                  )}
                  <p className="pt-1 text-xs text-muted-foreground">
                    Costo congelado al publicar. No se recalcula solo:{' '}
                    {product.productId ? (
                      // Los productos viven en Configuración → Productos (no hay pantalla por producto).
                      <Link className="underline" to="/settings?seccion=productos">
                        ver los productos
                      </Link>
                    ) : product.quoteId ? (
                      // La pantalla de presupuestos ya no existe: el origen queda solo como dato.
                      'viene de una cotización guardada'
                    ) : (
                      'sin origen'
                    )}
                    .
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Enlace público</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="break-all font-mono text-xs">/{product.slug}</p>
              <Badge variant={product.visible ? 'success' : 'outline'}>
                {product.visible ? 'Visible en la tienda' : 'No sale en la tienda'}
              </Badge>
            </CardContent>
          </Card>
        </div>
      </div>

      <StoreCategoriesModal open={categorias} onOpenChange={setCategorias} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Editor de opciones (color, tamaño, acabado). SIN combinatoria: al producirse
 * bajo pedido no hay stock por combinación, así que basta con el recargo.
 */
function OpcionesEditor({
  grupos,
  onChange,
  storageReady,
  onSubirFoto,
  onQuitarFoto,
}: {
  grupos: GrupoEdit[];
  onChange: (g: GrupoEdit[]) => void;
  storageReady: boolean;
  onSubirFoto: (optionId: string, file: File | undefined) => void | Promise<void>;
  onQuitarFoto: (imageId: string) => void | Promise<void>;
}) {
  const setGrupo = (i: number, patch: Partial<GrupoEdit>) =>
    onChange(grupos.map((g, gi) => (gi === i ? { ...g, ...patch } : g)));

  const setOpcion = (gi: number, oi: number, patch: Partial<OpcionEdit>) =>
    setGrupo(gi, {
      options: grupos[gi].options.map((o, i) => (i === oi ? { ...o, ...patch } : o)),
    });

  // "Define la foto" es exclusivo: marcar uno desmarca los demás (el backend
  // solo acepta un grupo con drivesPhoto por producto).
  const setDefineFoto = (gi: number, v: boolean) =>
    onChange(grupos.map((g, i) => ({ ...g, drivesPhoto: i === gi ? v : false })));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Opciones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Lo que el cliente elige al pedir: color, tamaño, acabado. Cada opción puede sumar un
          recargo al precio base.
        </p>

        {grupos.map((grupo, gi) => (
          <div key={gi} className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Grupo">
                <Input
                  value={grupo.name}
                  placeholder="Color"
                  onChange={(e) => setGrupo(gi, { name: e.target.value })}
                />
              </Field>
              <Switch
                checked={grupo.required}
                onChange={(v) => setGrupo(gi, { required: v })}
                label="Obligatorio"
              />
              <Switch
                checked={grupo.drivesPhoto}
                onChange={(v) => setDefineFoto(gi, v)}
                label="Este grupo define la foto"
              />
              <Button
                variant="outline"
                className="ml-auto"
                onClick={() => onChange(grupos.filter((_, i) => i !== gi))}
              >
                <Trash2 className="h-4 w-4" /> Quitar grupo
              </Button>
            </div>

            {grupo.drivesPhoto && (
              <p className="text-xs text-muted-foreground">
                Al elegir un color en la tienda, la galería muestra la foto de ese color. Cada
                opción puede llevar su propia foto.
              </p>
            )}

            <div className="space-y-2">
              {grupo.options.map((op, oi) => (
                <div key={oi} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="w-full sm:w-44"
                      value={op.value}
                      placeholder="Rojo"
                      onChange={(e) => setOpcion(gi, oi, { value: e.target.value })}
                    />
                    <NumberInput
                      className="w-full sm:w-32"
                      value={op.priceDeltaUsd}
                      onChange={(v) => setOpcion(gi, oi, { priceDeltaUsd: v })}
                      min={0}
                      step={0.5}
                      aria-label="Recargo en dólares"
                    />
                    <input
                      type="color"
                      aria-label="Color de la muestra"
                      className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background"
                      value={op.swatchHex ?? '#000000'}
                      onChange={(e) => setOpcion(gi, oi, { swatchHex: e.target.value })}
                    />
                    {op.swatchHex && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground underline"
                        onClick={() => setOpcion(gi, oi, { swatchHex: null })}
                      >
                        sin color
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Quitar opción"
                      className="ml-auto text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setGrupo(gi, { options: grupo.options.filter((_, i) => i !== oi) })
                      }
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {grupo.drivesPhoto && (
                    <FotoDeOpcion
                      opcion={op}
                      storageReady={storageReady}
                      onSubir={(file) => op.id && onSubirFoto(op.id, file)}
                      onQuitar={onQuitarFoto}
                    />
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  setGrupo(gi, {
                    options: [
                      ...grupo.options,
                      { value: '', priceDeltaUsd: 0, swatchHex: null, images: [] },
                    ],
                  })
                }
              >
                <Plus className="h-4 w-4" /> Agregar opción
              </Button>
            </div>
          </div>
        ))}

        <Button
          variant="outline"
          onClick={() =>
            onChange([
              ...grupos,
              {
                name: '',
                required: false,
                drivesPhoto: false,
                options: [{ value: '', priceDeltaUsd: 0, swatchHex: null, images: [] }],
              },
            ])
          }
        >
          <Plus className="h-4 w-4" /> Agregar grupo
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Las fotos de un color. Subir requiere que la opción ya exista (tenga `id`): la
 * foto se enlaza a ese id, así que hay que guardar el producto primero. La
 * miniatura sale de las fotos que ya tiene la opción.
 */
function FotoDeOpcion({
  opcion,
  storageReady,
  onSubir,
  onQuitar,
}: {
  opcion: OpcionEdit;
  storageReady: boolean;
  onSubir: (file: File | undefined) => void;
  onQuitar: (imageId: string) => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const sinGuardar = !opcion.id;
  return (
    <div className="flex flex-wrap items-center gap-2 pl-1">
      {opcion.images.map((img) => (
        <div
          key={img.id}
          className="group relative h-12 w-12 overflow-hidden rounded-md border border-border"
        >
          <img src={img.url} alt={img.alt ?? ''} className="h-full w-full object-cover" />
          <button
            type="button"
            aria-label={`Quitar la foto de ${opcion.value || 'la opción'}`}
            onClick={() => onQuitar(img.id)}
            className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-background/90 text-destructive ring-1 ring-border"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={sinGuardar || !storageReady}
        title={
          sinGuardar
            ? 'Guardá el producto primero para poder subir la foto de este color'
            : !storageReady
              ? 'El almacenamiento no está configurado en el servidor'
              : undefined
        }
        className="grid h-12 w-12 place-items-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-brand-blue/50 hover:text-foreground disabled:opacity-50"
      >
        <ImagePlus className="h-4 w-4" />
      </button>
      {sinGuardar && (
        <span className="text-xs text-muted-foreground">Guardá primero para subir su foto</span>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={STORE_IMAGE_MIME_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          onSubir(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/**
 * Ficha técnica: pares nombre/valor libres (Material, Tamaño, Peso, Resistencia,
 * Acabado…). Se guardan como lista y no como columnas para no migrar la base
 * cada vez que aparece un dato nuevo.
 */
function SpecsEditor({
  specs,
  onChange,
}: {
  specs: { label: string; value: string }[];
  onChange: (s: { label: string; value: string }[]) => void;
}) {
  const set = (i: number, patch: Partial<{ label: string; value: string }>) =>
    onChange(specs.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ficha técnica</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Los datos que el cliente mira antes de encargar. Aparecen como tabla en la página del
          producto.
        </p>
        {specs.map((e, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              className="w-full sm:w-44"
              placeholder="Peso"
              value={e.label}
              onChange={(ev) => set(i, { label: ev.target.value })}
              aria-label={`Nombre de la especificación ${i + 1}`}
            />
            <Input
              className="w-full flex-1 sm:w-auto"
              placeholder="12 g"
              value={e.value}
              onChange={(ev) => set(i, { value: ev.target.value })}
              aria-label={`Valor de la especificación ${i + 1}`}
            />
            <button
              type="button"
              aria-label={`Quitar la especificación ${i + 1}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onChange(specs.filter((_, j) => j !== i))}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button variant="outline" onClick={() => onChange([...specs, { label: '', value: '' }])}>
          <Plus className="h-4 w-4" /> Agregar dato
        </Button>
      </CardContent>
    </Card>
  );
}
