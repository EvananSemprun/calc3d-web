import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formatMoney, type OrderLineDto } from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { frozenFromSnapshot } from '@/features/settings/useExchangeRates';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton, TableSkeleton } from '@/components/ui';
import { notify } from '@/components/toast';

interface PublicOrder {
  code: number;
  businessName: string;
  clientName: string;
  deliveryDate: string | null;
  status: string;
  lines: OrderLineDto[];
  total: number;
  paid: number;
  balance: number;
  exchangeRates?: Record<string, { rate: number; label?: string }> | null;
  /** Tasa de HOY para la moneda del pedido (si sigue vivo); null si está cerrado o es solo USD. */
  liveRate?: { rate: number; currencyCode: string; label?: string } | null;
  /** true = pedido cerrado (Bs congelados). */
  settled?: boolean;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  QUOTED: 'Cotizado', CONFIRMED: 'Confirmado', IN_PRODUCTION: 'En producción',
  READY: 'Listo', DELIVERED: 'Entregado', CANCELLED: 'Cancelado',
};

export function PublicOrderPage() {
  const { token = '' } = useParams();
  const [accepted, setAccepted] = useState(false);

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['public-order', token],
    queryFn: async () => (await api.get<PublicOrder>(`/public/orders/${token}`)).data,
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => api.post(`/public/orders/${token}/accept`),
    onSuccess: () => {
      setAccepted(true);
      notify.success('¡Presupuesto aceptado! El negocio ya lo verá.');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  if (isLoading) {
    return (
      <div className="mx-auto min-h-screen max-w-2xl px-4 py-10">
        <Skeleton className="mx-auto mb-6 h-6 w-48" />
        <Card>
          <TableSkeleton rows={5} />
        </Card>
      </div>
    );
  }
  if (isError || !order) {
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center text-muted-foreground">
        Este enlace no es válido o ya no está disponible.
      </div>
    );
  }

  const money = (n: number) => formatMoney(n, 'USD', 'en-US');
  // Bs EN VIVO (tasa de hoy) mientras el pedido no esté cerrado; si no, la congelada.
  const frozen = frozenFromSnapshot(order.exchangeRates);
  const rate = order.liveRate ?? frozen;
  const bs = rate ? (n: number) => formatMoney(n * rate.rate, rate.currencyCode, 'es-VE') : null;
  const bsLive = !!order.liveRate && !order.settled;

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-10">
      <div className="mb-6 text-center">
        <div className="font-display text-xl font-bold">{order.businessName}</div>
        <p className="text-sm text-muted-foreground">Presupuesto / pedido #{order.code}</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Para {order.clientName}</CardTitle>
          <Badge variant="brand">{STATUS_LABEL[order.status] ?? order.status}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {order.deliveryDate && (
            <p className="text-sm text-muted-foreground">
              Entrega: {new Date(order.deliveryDate).toLocaleDateString('es-VE')}
            </p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2">Artículo</th>
                <th className="py-2 text-right">Cant.</th>
                <th className="py-2 text-right">Precio</th>
                <th className="py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {order.lines.map((l, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  <td className="py-2">{l.description}</td>
                  <td className="py-2 text-right">{l.quantity} {l.unit ?? ''}</td>
                  <td className="py-2 text-right">{money(l.unitPrice)}</td>
                  <td className="py-2 text-right font-semibold">{money(l.quantity * l.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1 border-t border-border pt-3 text-sm">
            <Row label="Total" value={money(order.total)} alt={bs ? bs(order.total) : null} strong />
            <Row label="Abonado" value={money(order.paid)} alt={bs ? bs(order.paid) : null} />
            <Row label="Saldo" value={money(order.balance)} alt={bs ? bs(order.balance) : null} strong />
          </div>

          {order.status === 'QUOTED' && !accepted && (
            <Button variant="accent" className="w-full" onClick={() => accept.mutate()} disabled={accept.isPending}>
              {accept.isPending ? 'Enviando…' : 'Aceptar este presupuesto'}
            </Button>
          )}
          {(accepted || order.status !== 'QUOTED') && order.status !== 'CANCELLED' && (
            <p className="text-center text-sm text-success">Presupuesto aceptado.</p>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Montos en USD
        {bs ? (bsLive ? ' · equivalente en Bs a la tasa de hoy' : ' · equivalente en Bs a la tasa del documento') : ''}.
      </p>
    </div>
  );
}

function Row({ label, value, alt, strong }: { label: string; value: string; alt: string | null; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? 'font-semibold' : 'text-muted-foreground'}>{label}</span>
      <span className="text-right">
        <span className={strong ? 'font-display font-bold tabular' : 'tabular'}>{value}</span>
        {alt && <span className="ml-2 font-mono text-xs text-muted-foreground">≈ {alt}</span>}
      </span>
    </div>
  );
}
