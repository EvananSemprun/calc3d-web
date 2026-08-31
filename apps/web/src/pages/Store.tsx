import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ImageOff, Plus, Store as StoreIcon, Tags } from 'lucide-react';
import { productMarkup } from '@calc3d/shared';
import { useMoney } from '@/features/settings/useSettings';
import { apiErrorMessage } from '@/lib/api';
import { notify } from '@/components/toast';
import {
  moveItem,
  useCreateStoreProduct,
  useReorderStoreProducts,
  useStoreProducts,
  useStoreStatus,
  type StoreProduct,
} from '@/features/store/api';
import { ReorderControls } from '@/features/store/ReorderControls';
import { StoreCategoriesModal } from '@/features/store/StoreCategoriesModal';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  SearchInput,
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

  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [categorias, setCategorias] = useState(false);

  const sq = search.trim().toLowerCase();
  const visible = products.filter((p) => {
    if (sq && !p.name.toLowerCase().includes(sq)) return false;
    if (filtro === 'publicados') return p.visible;
    if (filtro === 'borradores') return !p.visible;
    return true;
  });

  const publicados = products.filter((p) => p.visible).length;

  // Reordenar con la lista filtrada sería mentiroso: "mover antes" movería el
  // producto respecto a lo que se ve, no respecto a la vitrina real. Con filtro
  // activo los controles se ocultan y se explica por qué.
  const filtrando = !!sq || filtro !== 'todos';

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
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setCategorias(true)}>
            <Tags className="h-4 w-4" /> Categorías
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

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar producto…"
          className="w-full sm:w-64"
        />
        <Select
          className="w-full sm:w-44"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
        >
          <option value="todos">Todos</option>
          <option value="publicados">Publicados</option>
          <option value="borradores">Borradores</option>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={StoreIcon}
          title={products.length === 0 ? 'Todavía no hay nada en la tienda' : 'Sin resultados'}
          description={
            products.length === 0
              ? 'Cargá un producto a mano, o publicá uno desde un producto costeado o una cotización.'
              : 'Probá con otro nombre o cambiá el filtro.'
          }
        />
      ) : (
        <>
          {filtrando && products.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Para cambiar el orden de la vitrina, quitá la búsqueda y el filtro.
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
    <div className="group relative">
      <Link to={`/store/${product.id}`} className="block">
        <Card className="h-full overflow-hidden transition-colors group-hover:border-brand-blue/40">
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-brand-blue/10">
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
          <CardContent className="space-y-1 py-3">
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
