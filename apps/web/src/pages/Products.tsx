import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, AlertTriangle, ImageOff } from 'lucide-react';
import { useMoney } from '@/features/settings/useSettings';
import { useProducts, productsBelowMargin, type Product } from '@/features/products/api';
import { Badge, Card, CardContent, EmptyState, SearchInput, Stat, TableSkeleton } from '@/components/ui';

export function ProductsPage() {
  const { money, percent } = useMoney();
  const { data: products = [], isLoading } = useProducts();

  const alerts = useMemo(() => productsBelowMargin(products), [products]);
  const [search, setSearch] = useState('');
  const sq = search.trim().toLowerCase();
  const visible = products.filter((p) => !sq || p.name.toLowerCase().includes(sq));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
        <div>
          <h1 className="font-display text-2xl font-bold">Productos</h1>
          <p className="text-sm text-muted-foreground">
            Piezas ya costeadas y reutilizables. Se revisan contra los precios de hoy.
            {alerts.length > 0 && (
              <span className="text-amber-600 dark:text-amber-400"> · {alerts.length} por debajo de margen</span>
            )}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Productos" value={String(products.length)} />
        <Stat
          label="En alerta"
          value={String(alerts.length)}
          accent={alerts.length > 0 ? 'yellow' : undefined}
          sub={alerts.length > 0 ? 'margen bajo el mínimo' : 'todo en verde'}
        />
        <Stat
          label="Valor de venta"
          value={money(products.reduce((s, p) => s + p.recost.priceSet, 0))}
          sub="suma de precios fijados"
        />
      </div>

      {isLoading ? (
        <Card>
          <TableSkeleton cols={3} />
        </Card>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-blue/15 text-brand-blue-bright ring-1 ring-inset ring-brand-blue/30">
              <Package className="h-6 w-6" />
            </span>
            <p className="max-w-sm text-sm text-muted-foreground">
              No tienes productos todavía. Costea una pieza en la calculadora y usa{' '}
              <strong>Guardar producto</strong> para reutilizarla.
            </p>
            <Link
              to="/"
              className="rounded-lg bg-brand-yellow px-4 py-2 text-sm font-semibold text-brand-yellow-foreground transition-colors hover:bg-brand-yellow-hover"
            >
              Ir a la calculadora
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar producto…"
            className="w-full sm:max-w-md"
          />
          {visible.length === 0 ? (
            <Card>
              <EmptyState icon={Package} description={`Sin productos para «${search.trim()}».`} />
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((p) => (
                <ProductCard key={p.id} product={p} money={money} percent={percent} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProductCard({
  product,
  money,
  percent,
}: {
  product: Product;
  money: (n: number) => string;
  percent: (n: number, dp?: number) => string;
}) {
  const { recost } = product;
  const { belowMin, markupNow, costDeltaPct } = recost.status;

  return (
    <Link to={`/products/${product.id}`} className="group block">
      <Card
        className={`h-full overflow-hidden transition-colors ${
          belowMin ? 'border-amber-500/50' : 'group-hover:border-brand-blue/40'
        }`}
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-brand-blue/10">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-muted-foreground/40">
              <ImageOff className="h-8 w-8" />
            </div>
          )}
          {belowMin && (
            <span className="absolute right-2 top-2">
              <Badge variant="warning" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> Revisar precio
              </Badge>
            </span>
          )}
        </div>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-base font-bold leading-tight">{product.name}</h3>
            <span className="shrink-0 font-display text-lg font-bold tabular text-brand-yellow-ink">
              {money(recost.priceSet)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Costo hoy <span className="tabular text-foreground">{money(recost.costNow)}</span>
            </span>
            <span className={belowMin ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-success'}>
              {percent(markupNow, 0)} de ganancia
            </span>
          </div>
          {belowMin && (
            <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
              El costo subió {percent(costDeltaPct, 0)} desde que lo guardaste. Ya no da el margen que crees.
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
