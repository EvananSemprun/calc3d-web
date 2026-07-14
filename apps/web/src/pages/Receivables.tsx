import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { HandCoins } from 'lucide-react';
import { useMoney } from '@/features/settings/useSettings';
import { useOrders, ORDER_STATUS } from '@/features/orders/api';
import { Badge, Card, CardContent, Stat, TableSkeleton } from '@/components/ui';

/** Días transcurridos desde una fecha ISO hasta hoy (UTC). */
function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

export function ReceivablesPage() {
  const navigate = useNavigate();
  const { money, moneyAlt } = useMoney();
  const { data: orders = [], isLoading } = useOrders();

  // Pedidos con saldo pendiente, del más viejo al más nuevo (cobra primero lo
  // que más se devalúa). La antigüedad se mide desde la creación del pedido.
  const pending = useMemo(
    () =>
      orders
        .filter((o) => o.balance > 0 && o.status !== 'CANCELLED')
        .map((o) => ({ ...o, age: daysSince(o.createdAt) }))
        .sort((a, b) => b.age - a.age),
    [orders],
  );

  const totalPending = pending.reduce((s, o) => s + o.balance, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
        <div>
          <h1 className="font-display text-2xl font-bold">Cuentas por cobrar</h1>
          <p className="text-sm text-muted-foreground">
            Quién te debe y desde cuándo. En Bs, cada día sin cobrar pierde valor.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Total por cobrar"
          value={money(totalPending)}
          accent="yellow"
          sub={moneyAlt ? `≈ ${moneyAlt(totalPending)}` : undefined}
        />
        <Stat label="Pedidos con saldo" value={String(pending.length)} />
        <Stat label="Más antiguo" value={pending.length ? `${pending[0].age} días` : '—'} />
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          {isLoading ? (
            <TableSkeleton cols={5} />
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <HandCoins className="h-8 w-8 text-success" />
              <p className="text-sm text-muted-foreground">Nadie te debe. Todos los pedidos están saldados.</p>
            </div>
          ) : (
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">N°</th>
                  <th className="px-4 py-2.5 font-semibold">Cliente</th>
                  <th className="px-4 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Antigüedad</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {pending.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-accent/40"
                    onClick={() => navigate(`/orders/${o.id}`)}
                  >
                    <td className="px-4 py-3 font-mono">#{o.code}</td>
                    <td className="px-4 py-3">
                      {o.client?.name}
                      {o.client?.phone && (
                        <span className="ml-2 text-xs text-muted-foreground">{o.client.phone}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {o.age >= 15 ? (
                        <Badge variant="warning">{o.age} días</Badge>
                      ) : (
                        <span className="text-muted-foreground">{o.age} días</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-brand-yellow-ink">{money(o.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
