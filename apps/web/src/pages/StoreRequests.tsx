import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Inbox, MessageCircle, Trash2, X } from 'lucide-react';
import type { StoreRequestStatus } from '@calc3d/shared';
import { useMoney } from '@/features/settings/useSettings';
import { apiErrorMessage } from '@/lib/api';
import { notify } from '@/components/toast';
import { useConfirm } from '@/components/overlays';
import {
  useConfirmStoreRequest,
  useDeleteStoreRequest,
  useDiscardStoreRequest,
  useStoreRequests,
  whatsappHref,
  type StoreRequest,
} from '@/features/store/requests-api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Select,
  TableSkeleton,
} from '@/components/ui';

/**
 * Bandeja de la tienda: pedidos y solicitudes que llegaron SIN sesión.
 *
 * Está separada de Pedidos a propósito. Cualquiera con la dirección de la tienda
 * puede escribir acá, así que nada toca la operación ni el CRM hasta que el
 * dueño confirma. **Confirmar** crea el contacto (o lo enlaza por teléfono) y el
 * pedido; **descartar** solo deja constancia de que se vio.
 */

const FILTROS: { value: StoreRequestStatus | 'all'; label: string }[] = [
  { value: 'NEW', label: 'Sin revisar' },
  { value: 'CONFIRMED', label: 'Confirmadas' },
  { value: 'DISCARDED', label: 'Descartadas' },
  { value: 'all', label: 'Todas' },
];

function fecha(iso: string) {
  return new Date(iso).toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StoreRequestsPage() {
  const navigate = useNavigate();
  const { money } = useMoney();
  const confirmar = useConfirm();
  const [filtro, setFiltro] = useState<StoreRequestStatus | 'all'>('NEW');

  const { data: requests = [], isLoading } = useStoreRequests(
    filtro === 'all' ? undefined : filtro,
  );
  const confirmMut = useConfirmStoreRequest();
  const discardMut = useDiscardStoreRequest();
  const deleteMut = useDeleteStoreRequest();

  async function onConfirmar(r: StoreRequest) {
    const ok = await confirmar({
      title: 'Confirmar solicitud',
      description:
        r.kind === 'CUSTOM'
          ? 'Se creará el contacto y un pedido SIN líneas (una pieza a medida todavía no tiene precio). La descripción queda en las notas para que la cotices.'
          : 'Se creará el contacto (o se enlazará con el que ya tenga ese teléfono) y un pedido con estas líneas, en estado "Cotizado".',
      confirmLabel: 'Confirmar',
    });
    if (!ok) return;
    try {
      const res = await confirmMut.mutateAsync(r.id);
      notify.success(`Pedido #${res.orderCode} creado`);
      navigate(`/orders/${res.orderId}`);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  }

  async function onDescartar(r: StoreRequest) {
    const ok = await confirmar({
      title: 'Descartar solicitud',
      description: 'No se crea nada. Queda registrada como descartada.',
      confirmLabel: 'Descartar',
    });
    if (!ok) return;
    try {
      await discardMut.mutateAsync(r.id);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  }

  async function onBorrar(r: StoreRequest) {
    const ok = await confirmar({
      title: 'Borrar de la bandeja',
      description:
        'Se borra el registro de la solicitud. El pedido y el contacto que se hayan creado NO se borran.',
      confirmLabel: 'Borrar',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(r.id);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bandeja de la tienda</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos y consultas que llegaron desde la tienda pública. Nada entra a tus pedidos ni a
            tus contactos hasta que lo confirmes.
          </p>
        </div>
        <Select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as StoreRequestStatus | 'all')}
          className="w-auto"
          aria-label="Filtrar por estado"
        >
          {FILTROS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
      </header>

      {isLoading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={filtro === 'NEW' ? 'No hay solicitudes sin revisar' : 'No hay nada acá'}
          description="Cuando alguien haga un pedido desde la tienda, va a aparecer en esta lista."
        />
      ) : (
        <div className="space-y-4">
          {requests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              money={money}
              onConfirmar={() => onConfirmar(r)}
              onDescartar={() => onDescartar(r)}
              onBorrar={() => onBorrar(r)}
              onVerPedido={() => r.order && navigate(`/orders/${r.order.id}`)}
              trabajando={confirmMut.isPending || discardMut.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({
  request: r,
  money,
  onConfirmar,
  onDescartar,
  onBorrar,
  onVerPedido,
  trabajando,
}: {
  request: StoreRequest;
  money: (n: number) => string;
  onConfirmar: () => void;
  onDescartar: () => void;
  onBorrar: () => void;
  onVerPedido: () => void;
  trabajando: boolean;
}) {
  const esNueva = r.status === 'NEW';
  const total = Number(r.totalUsd);
  // El saludo por WhatsApp lo abre el dueño: es la respuesta al cliente, no un
  // aviso automático. Sin teléfono no habría a dónde escribir, pero el contrato
  // lo exige, así que siempre hay uno.
  const saludo = whatsappHref(
    r.customerPhone,
    `Hola ${r.customerName}, recibimos tu ${r.kind === 'CUSTOM' ? 'consulta' : 'pedido'}.`,
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.customerName}</span>
              <Badge variant={r.kind === 'CUSTOM' ? 'warning' : 'brand'}>
                {r.kind === 'CUSTOM' ? 'Pieza a medida' : 'Pedido'}
              </Badge>
              {r.status === 'CONFIRMED' && <Badge variant="success">Confirmada</Badge>}
              {r.status === 'DISCARDED' && <Badge variant="outline">Descartada</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {r.customerPhone} · {fecha(r.createdAt)}
            </p>
          </div>
          {r.kind === 'ORDER' && (
            <div className="text-right">
              <div className="text-lg font-semibold tabular-nums">{money(total)}</div>
              <p className="text-xs text-muted-foreground">calculado por el servidor</p>
            </div>
          )}
        </div>

        {r.kind === 'ORDER' && r.lines.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {r.lines.map((l, i) => {
              const opciones = Object.entries(l.options)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ');
              return (
                <li key={`${l.slug}-${i}`} className="flex items-baseline gap-3 px-3 py-2 text-sm">
                  <span className="tabular-nums text-muted-foreground">{l.quantity}×</span>
                  <span className="flex-1">
                    {l.description}
                    {opciones && (
                      <span className="block text-xs text-muted-foreground">{opciones}</span>
                    )}
                  </span>
                  <span className="tabular-nums">{money(l.unitPrice)}</span>
                </li>
              );
            })}
          </ul>
        )}

        {r.description && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
            {r.description}
          </div>
        )}

        {r.customerNote && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Nota: </span>
            {r.customerNote}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {esNueva ? (
            <>
              <Button onClick={onConfirmar} disabled={trabajando}>
                <Check className="size-4" /> Confirmar y crear pedido
              </Button>
              <Button variant="ghost" onClick={onDescartar} disabled={trabajando}>
                <X className="size-4" /> Descartar
              </Button>
            </>
          ) : (
            <>
              {r.order && (
                <Button variant="secondary" onClick={onVerPedido}>
                  Ver pedido #{r.order.code}
                </Button>
              )}
              <Button variant="ghost" onClick={onBorrar}>
                <Trash2 className="size-4" /> Borrar de la bandeja
              </Button>
            </>
          )}
          <a
            href={saludo}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <MessageCircle className="size-4" /> Escribirle
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
