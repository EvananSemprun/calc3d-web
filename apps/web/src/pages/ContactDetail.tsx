import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2, Phone, MessageCircle } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import { useContact, CONTACT_TYPE } from '@/features/contacts/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, PageSkeleton, Stat } from '@/components/ui';
import { useConfirm } from '@/components/overlays';
import { PointsMap } from '@/components/LeafletMap';
import { notify } from '@/components/toast';
import { ContactModal } from '@/pages/Contacts';

export function ContactDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const { money } = useMoney();
  const { data: contact, isLoading } = useContact(id);
  const [editing, setEditing] = useState(false);

  const remove = useMutation({
    mutationFn: () => api.delete(`/clients/${id}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['clients'] });
      notify.success('Contacto eliminado');
      navigate('/contacts');
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  if (isLoading) return <PageSkeleton />;
  if (!contact) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Contacto no encontrado.{' '}
        <Link to="/contacts" className="text-brand-yellow-ink hover:underline">
          Volver
        </Link>
      </div>
    );
  }

  const type = CONTACT_TYPE[contact.type];
  const { history } = contact;
  const located = contact.lat != null && contact.lng != null;
  const waPhone = contact.phone ? contact.phone.replace(/\D/g, '').replace(/^0/, '58') : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/contacts')}
            className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Volver"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-bold">{contact.name}</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ background: type.color }} />
                {type.label}
              </span>
            </div>
            {[contact.municipality, contact.city].filter(Boolean).length > 0 && (
              <p className="text-sm text-muted-foreground">
                {[contact.municipality, contact.city].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {waPhone && (
            <a
              href={`https://wa.me/${waPhone}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-success transition-colors hover:bg-accent"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </a>
          )}
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              if (await confirm({ title: `¿Eliminar a “${contact.name}”?` })) remove.mutate();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        {/* Ficha */}
        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="Teléfono" value={contact.phone} icon={<Phone className="h-3.5 w-3.5" />} />
            <InfoRow label="RIF / C.I." value={contact.rif} />
            <InfoRow label="Dirección" value={contact.address} />
            <InfoRow label="Notas" value={contact.notes} />
          </CardContent>
        </Card>

        {/* Mapa */}
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Ubicación</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {located ? (
              <div className="h-64">
                <PointsMap
                  points={[{ id: contact.id, name: contact.name, lat: contact.lat!, lng: contact.lng!, color: type.color }]}
                />
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Sin ubicación. Usa <strong>Editar</strong> para fijarla en el mapa.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Historial */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Presupuestos" value={String(history.quotes.length)} />
        <Stat label="Pedidos" value={String(history.orders.length)} accent="yellow" />
        <Stat label="Ventas" value={String(history.sales.length)} accent="success" />
      </div>

      {history.orders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pedidos</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">N°</th>
                  <th className="px-4 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {history.orders.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-accent/40"
                    onClick={() => navigate(`/orders/${o.id}`)}
                  >
                    <td className="px-4 py-3 font-mono">#{o.code}</td>
                    <td className="px-4 py-3">{o.status}</td>
                    <td className="px-4 py-3 text-right">{money(o.total)}</td>
                    <td className="px-4 py-3 text-right">
                      {o.balance > 0 ? (
                        <span className="font-semibold text-brand-yellow-ink">{money(o.balance)}</span>
                      ) : (
                        <Badge variant="success">saldado</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {history.quotes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Presupuestos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 p-4 text-sm">
            {history.quotes.map((q) => (
              <Link
                key={q.id}
                to={`/quotes/${q.id}`}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent/40"
              >
                <span>{q.name}</span>
                <Badge variant="outline">{q.status}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {editing && <ContactModal contact={contact} onClose={() => setEditing(false)} />}
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-1.5 last:border-0">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-right">{value || '—'}</span>
    </div>
  );
}
