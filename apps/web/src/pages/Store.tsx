import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ImageOff, Plus, Store as StoreIcon, Tags, Zap } from 'lucide-react';
import { arbolDeCategorias, descendientesDe, etiquetaDeHija, productMarkup } from '@calc3d/shared';
import { useMoney } from '@/features/settings/useSettings';
import { apiErrorMessage } from '@/lib/api';
import { notify } from '@/components/toast';
import {
  moveItem,
  useCreateStoreProduct,
  useReorderStoreProducts,
  useStoreCategories,
  useStoreProducts,
  useStoreStatus,
  type StoreProduct,
} from '@/features/store/api';
import { FlashSaleDialog } from '@/features/store/FlashSaleDialog';
import { ReorderControls } from '@/features/store/ReorderControls';
import { StoreCategoriesModal } from '@/features/store/StoreCategoriesModal';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  FilterBar,
  Select,
  Stat,
  TableSkeleton,
} from '@/components/ui';

type Filtro = 'todos' | 'publicados' | 'borradores';

/**
 * Vitrina del panel: lo que se publica en la tienda. Es un catálogo APARTE del
 * de Productos — allá vive el costeo, acá lo que ve el cliente.
 */
export function StorePage() {
  const navigate = useNavigate();
  const { money, percent } = useMoney();
  const { data: products = [], isLoading } = useStoreProducts();
  const { data: status } = useStoreStatus();
  const create = useCreateStoreProduct();
  const reorder = useReorderStoreProducts();

  const [categoriaF, setCategoriaF] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [categorias, setCategorias] = useState(false);
  const [flash, setFlash] = useState(false);

  // Las opciones salen de las CATEGORÍAS y no de los productos: una madre cuyos productos
  // están todos en sus hijas no aparecería nunca. Y se filtra por ID: dos subcategorías
  // homónimas bajo madres distintas («Autos») son dos opciones, no una.
  const { data: listaCategorias = [] } = useStoreCategories();
  const arbolCategorias = arbolDeCategorias(listaCategorias);
  // Una categoría que se borró dejaría el select en blanco y la vitrina vacía.
  const categoriaSegura = listaCategorias.some((c) => c.id === categoriaF) ? categoriaF : '';
  // Filtrar por una madre incluye a sus hijas.
  const idsDelFiltro = categoriaSegura
    ? new Set([categoriaSegura, ...descendientesDe(listaCategorias, categoriaSegura).map((c) => c.id)])
    : null;
  const visible = products.filter((p) => {
    if (idsDelFiltro && !(p.categoryId && idsDelFiltro.has(p.categoryId))) return false;
    if (filtro === 'publicados') return p.visible;
    if (filtro === 'borradores') return !p.visible;
    return true;
  });

  const publicados = products.filter((p) => p.visible).length;

  // Reordenar con la lista filtrada sería mentiroso: "mover antes" movería el
  // producto respecto a lo que se ve, no respecto a la vitrina real. Con filtro
  // activo los controles se ocultan y se explica por qué.
  const filtrando = !!categoriaSegura || filtro !== 'todos';

  const mover = async (from: number, to: number) => {
    const ids = moveItem(products, from, to).map((p) => p.id);
    try {
      await reorder.mutateAsync(ids);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  const nuevo = async () => {
    try {
      const creado = await create.mutateAsync({
        name: 'Producto sin nombre',
        priceUsd: 0,
        kind: 'PHYSICAL',
        minQty: 1,
        visible: false,
        custom: false,
        specs: [],
        priceTiers: [],
        optionGroups: [],
      });
      navigate(`/store/${creado.id}`);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Tienda</h1>
            <p className="text-sm text-muted-foreground">
              Lo que se publica en la web de ventas. Los borradores no salen a la calle.
            </p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <Button variant="outline" onClick={() => setCategorias(true)}>
            <Tags className="h-4 w-4" /> Categorías
          </Button>
          <Button variant="outline" onClick={() => setFlash(true)}>
            <Zap className="h-4 w-4" /> Flash Sale
          </Button>
          <Button onClick={nuevo} disabled={create.isPending}>
            <Plus className="h-4 w-4" /> Nuevo producto
          </Button>
        </div>
      </div>

      {status && !status.storageReady && (
        <Card className="border-amber-500/50">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p>
              <strong>Las fotos están deshabilitadas.</strong> Faltan las credenciales del
              almacenamiento en el servidor (las variables <code>R2_*</code>). Podés cargar
              productos igual; las fotos se suben cuando estén configuradas.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="En el catálogo" value={String(products.length)} />
        <Stat
          label="Publicados"
          value={String(publicados)}
          sub={`${products.length - publicados} en borrador`}
        />
        <Stat
          label="Sin foto"
          value={String(products.filter((p) => p.images.length === 0).length)}
          accent={products.some((p) => p.visible && p.images.length === 0) ? 'yellow' : undefined}
          sub={
            products.some((p) => p.visible && p.images.length === 0)
              ? 'hay publicados sin foto'
              : 'todo con imagen'
          }
        />
      </div>

      <FilterBar>
        {listaCategorias.length > 0 && (
          <Select
            className="w-full sm:w-52"
            aria-label="Categoría"
            value={categoriaSegura}
            onChange={(e) => setCategoriaF(e.target.value)}
          >
            <option value="">Categoría: todas</option>
            {/* El Select de la casa ignora <optgroup>: la jerarquía va en el TEXTO, con
                sangría (espacios duros, que el HTML no colapsa). */}
            {arbolCategorias.flatMap(({ categoria, hijas }) => [
              <option key={categoria.id} value={categoria.id}>
                {categoria.name}
              </option>,
              ...hijas.map((h) => (
                <option key={h.id} value={h.id}>
                  {etiquetaDeHija(arbolCategorias, categoria, h)}
                </option>
              )),
            ])}
          </Select>
        )}
        <Select
          className="w-full sm:w-44"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
        >
          <option value="todos">Estado: todos</option>
          <option value="publicados">Publicados</option>
          <option value="borradores">Borradores</option>
        </Select>
      </FilterBar>

      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title={products.length === 0 ? 'Todavía no hay nada en la tienda' : 'Sin resultados'}
          description={
            products.length === 0
              ? 'Cargá un producto a mano, o publicá uno desde un producto costeado o una cotización.'
              : 'Ningún producto coincide con los filtros.'
          }
        />
      ) : (
        <>
          {filtrando && products.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Para cambiar el orden de la vitrina, quitá los filtros.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((p, i) => (
              <StoreCard
                key={p.id}
                product={p}
                money={money}
                percent={percent}
                orden={filtrando ? null : { index: i, total: products.length, onMove: mover }}
              />
            ))}
          </div>
        </>
      )}

      <StoreCategoriesModal open={categorias} onOpenChange={setCategorias} />
      <FlashSaleDialog open={flash} onOpenChange={setFlash} />
    </div>
  );
}

function StoreCard({
  product,
  money,
  percent,
  orden,
}: {
  product: StoreProduct;
  money: (n: number) => string;
  percent: (f: number, d?: number) => string;
  orden: { index: number; total: number; onMove: (from: number, to: number) => void } | null;
}) {
  const foto = product.images[0];
  const precio = Number(product.priceUsd);
  const costo = product.costAtPublish == null ? null : Number(product.costAtPublish);
  // El margen solo se puede mostrar si la ficha está enlazada a un costeo.
  const markup = costo != null && costo > 0 ? productMarkup(precio, costo) : null;

  return (
    /* `h-full` en los TRES niveles. Sin él, la tarjeta medía lo que medía su contenido
       mientras el contenedor se estiraba al alto de la fila: las tarjetas quedaban
       desparejas entre sí y los controles de orden —que se posicionan contra el
       contenedor— caían POR DEBAJO de la tarjeta, fuera de ella. */
    <div className="group relative h-full">
      <Link to={`/store/${product.id}`} className="block h-full">
        <Card className="flex h-full flex-col overflow-hidden transition-colors group-hover:border-brand-blue/40">
          {/* Cuadrada: las fotos del catálogo son 1254×1254 (1:1), así que así se ven
              enteras, sin recorte. ⚠️ Es el formato del PANEL; la tienda sigue con 4/3
              a propósito, que ahí está bien. Una foto que no sea 1:1 se recorta: por eso
              el formato está fijado. */}
          <div className="relative aspect-square w-full overflow-hidden bg-brand-blue/10">
            {foto ? (
              <img
                src={foto.url}
                alt={foto.alt ?? product.name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageOff className="h-7 w-7" />
              </div>
            )}
            <div className="absolute left-2 top-2 flex gap-1.5">
              <Badge variant={product.visible ? 'success' : 'outline'}>
                {product.visible ? 'Publicado' : 'Borrador'}
              </Badge>
              {product.kind === 'SERVICE' && <Badge variant="outline">Servicio</Badge>}
            </div>
          </div>
          <CardContent className="flex-1 space-y-1 py-3">
            <p className="truncate font-medium">{product.name}</p>
            <p className="text-sm text-muted-foreground">
              {money(precio)}
              {product.category && ` · ${product.category.name}`}
            </p>
            {markup != null && (
              <p
                className={`font-mono text-xs ${
                  markup < 0 ? 'font-semibold text-destructive' : 'text-muted-foreground'
                }`}
              >
                {markup < 0
                  ? `bajo costo · ${percent(markup, 0)}`
                  : `margen ${percent(markup, 0)} sobre el costo`}
              </p>
            )}
          </CardContent>
        </Card>
      </Link>
      {orden && (
        <ReorderControls
          // En móvil no hay hover: si dependieran de él, serían invisibles justo en el
          // dispositivo por el que se descartó el arrastre. Siempre visibles ahí.
          className="absolute bottom-2 right-2 opacity-100 transition-opacity sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover:opacity-100"
          index={orden.index}
          total={orden.total}
          itemLabel={product.name}
          onMove={(to) => orden.onMove(orden.index, to)}
        />
      )}
    </div>
  );
}
