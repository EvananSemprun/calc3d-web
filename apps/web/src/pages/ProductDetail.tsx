import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2, AlertTriangle, RefreshCw, Store } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import { useProduct } from '@/features/products/api';
import { usePublishToStore } from '@/features/store/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, NumberInput, PageSkeleton, Stat } from '@/components/ui';
import { useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { ResultPanel } from '@/features/calculator/ResultPanel';

export function ProductDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { money, percent } = useMoney();
  const { data: product, isLoading } = useProduct(id);

  const [price, setPrice] = useState(0);
  // Sincroniza el editor de precio cuando llega/actualiza el producto.
  useEffect(() => {
    if (product) setPrice(product.recost.priceSet);
  }, [product?.recost.priceSet]);

  const reprice = useMutation({
    mutationFn: (priceSet: number) => api.post(`/products/${id}/reprice`, { priceSet }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      notify.success('Precio actualizado y margen re-anclado');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/products/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      notify.success('Producto eliminado');
      navigate('/products');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  const publish = usePublishToStore();
  const publicar = async () => {
    try {
      const ficha = await publish.mutateAsync({ productId: id });
      notify.success('Borrador creado en la tienda');
      navigate(`/store/${ficha.id}`);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }
  if (!product) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Producto no encontrado.{' '}
        <Link to="/products" className="text-brand-yellow-ink hover:underline">
          Volver
        </Link>
      </div>
    );
  }

  const { recost } = product;
  const { belowMin, markupNow, markupAtSave, costDeltaPct } = recost.status;
  // Precio que restauraría el margen original al costo de hoy.
  const priceToKeepMargin = Number((recost.costNow * (1 + markupAtSave)).toFixed(2));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/products')}
            className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Volver"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="font-display text-2xl font-bold">{product.name}</h1>
            <p className="text-sm text-muted-foreground">
              Guardado el {new Date(product.createdAt).toLocaleDateString('es-VE')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Crea un BORRADOR en la tienda con el precio y el costo de este
              producto; el costo lo lee el backend, no viaja desde acá. */}
          <Button onClick={publicar} disabled={publish.isPending}>
            <Store className="h-4 w-4" />
            {publish.isPending ? 'Publicando…' : 'Publicar en la tienda'}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (await confirm({ title: `¿Eliminar el producto “${product.name}”?` })) remove.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" /> Eliminar
          </Button>
        </div>
      </div>

      {product.imageUrl && (
        <img
          src={product.imageUrl}
          alt={product.name}
          className="max-h-64 w-full rounded-xl border border-border object-cover"
        />
      )}

      {/* Alerta de rentabilidad */}
      {belowMin && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm">
            <p className="font-semibold text-amber-600 dark:text-amber-400">
              Este producto ya no da el margen que crees.
            </p>
            <p className="mt-0.5 text-muted-foreground">
              El costo subió <strong>{percent(costDeltaPct, 0)}</strong> desde que lo guardaste. Con el precio
              actual estás ganando <strong>{percent(markupNow, 0)}</strong> (guardaste con{' '}
              {percent(markupAtSave, 0)}). Sube el precio o acepta el nuevo margen.
            </p>
          </div>
        </div>
      )}

      {recost.unmatched.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          No se pudo recostear con precios de hoy: <strong>{recost.unmatched.join(', ')}</strong> ya no
          está en el catálogo por ese nombre (se usó el precio congelado). Renómbralo igual en el catálogo
          o vuelve a guardar el producto.
        </div>
      )}

      {/* KPIs de rentabilidad */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Precio de venta" value={money(recost.priceSet)} accent="yellow" sub="por unidad" />
        <Stat
          label="Costo hoy"
          value={money(recost.costNow)}
          sub={
            recost.costNow !== recost.costAtSave
              ? `guardado ${money(recost.costAtSave)} · ${percent(costDeltaPct, 0)}`
              : 'sin cambios'
          }
        />
        <Stat
          label="Ganancia hoy"
          value={percent(markupNow, 0)}
          accent={belowMin ? 'yellow' : 'success'}
          sub={`guardaste con ${percent(markupAtSave, 0)}`}
        />
        <Stat label="Utilidad / pieza" value={money(recost.priceSet - recost.costNow)} accent="success" />
      </div>

      {/* Re-fijar precio */}
      <Card>
        <CardHeader>
          <CardTitle>Ajustar precio de venta</CardTitle>
          <p className="text-sm text-muted-foreground">
            Tú decides cuándo cambia el precio. Al guardar, el margen se re-ancla al costo de hoy.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <NumberInput value={price} onChange={setPrice} min={0} step={0.01} />
          </div>
          <Button
            variant="accent"
            onClick={() => reprice.mutate(price)}
            disabled={reprice.isPending || price === recost.priceSet}
          >
            {reprice.isPending ? 'Guardando…' : 'Guardar precio'}
          </Button>
          {belowMin && priceToKeepMargin !== recost.priceSet && (
            <Button variant="outline" onClick={() => setPrice(priceToKeepMargin)}>
              <RefreshCw className="h-4 w-4" /> Restaurar margen ({money(priceToKeepMargin)})
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Recosteo completo con precios de hoy */}
      {recost.result && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="font-display text-lg font-bold">Recosteo con precios de hoy</h2>
            <Badge variant="outline">en vivo</Badge>
          </div>
          <ResultPanel result={recost.result} />
        </div>
      )}
    </div>
  );
}
