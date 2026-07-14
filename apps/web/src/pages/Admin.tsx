import { useState } from 'react';
import { ShieldCheck, Check, X } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api';
import { useAuth } from '@/auth/AuthContext';
import {
  useAdminMetrics,
  useAdminOrgs,
  usePendingPayments,
  useReviewPayment,
  METHOD_LABEL,
  PLAN_LABEL,
} from '@/features/billing/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Stat, TableSkeleton } from '@/components/ui';
import { notify } from '@/components/toast';

export function AdminPage() {
  const { user } = useAuth();
  const metrics = useAdminMetrics();
  const pending = usePendingPayments();
  const orgs = useAdminOrgs();
  const review = useReviewPayment();
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});

  if (!user?.isSuperadmin) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Acceso restringido.</div>;
  }

  const act = (id: string, action: 'approve' | 'reject') =>
    review.mutate(
      { id, dto: { action, note: rejectNote[id] || null } },
      {
        onSuccess: () => notify.success(action === 'approve' ? 'Pago aprobado y plan activado' : 'Pago rechazado'),
        onError: (e) => notify.error(apiErrorMessage(e)),
      },
    );

  const m = metrics.data;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg bg-brand-blue text-white shadow-glow-blue">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold">Administración</h1>
          <p className="text-sm text-muted-foreground">Panel de plataforma · solo superadmin.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Talleres" value={String(m?.orgs ?? '—')} />
        <Stat label="Nuevos (7 días)" value={String(m?.newThisWeek ?? '—')} accent="yellow" />
        <Stat label="Pagos pendientes" value={String(m?.pendingPayments ?? '—')} accent={m?.pendingPayments ? 'yellow' : undefined} />
        <Stat label="Aprobados este mes" value={String(m?.approvedThisMonth ?? '—')} accent="success" />
      </div>

      {/* Pagos pendientes */}
      <Card>
        <CardHeader>
          <CardTitle>Pagos por aprobar</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.isLoading ? (
            <TableSkeleton rows={3} cols={2} />
          ) : (pending.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada pendiente. Todo al día.</p>
          ) : (
            (pending.data ?? []).map((r) => (
              <div key={r.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{r.organization.name}</span>
                  <Badge variant="brand">{PLAN_LABEL[r.plan]}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {r.months === 12 ? 'anual' : 'mensual'} · {METHOD_LABEL[r.method]} · ref{' '}
                    <span className="font-mono">{r.reference}</span> · <span className="tabular">${r.amount}</span>
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString('es-VE')}
                  </span>
                </div>
                {r.note && <p className="mt-1 text-sm text-muted-foreground">Nota del taller: {r.note}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button variant="accent" size="sm" disabled={review.isPending} onClick={() => act(r.id, 'approve')}>
                    <Check className="h-4 w-4" /> Aprobar
                  </Button>
                  <Input
                    value={rejectNote[r.id] ?? ''}
                    placeholder="Motivo del rechazo (opcional)"
                    onChange={(e) => setRejectNote((s) => ({ ...s, [r.id]: e.target.value }))}
                    className="h-9 max-w-xs"
                  />
                  <Button variant="outline" size="sm" disabled={review.isPending} onClick={() => act(r.id, 'reject')}>
                    <X className="h-4 w-4" /> Rechazar
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Organizaciones */}
      <Card>
        <CardHeader>
          <CardTitle>Talleres</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Nombre</th>
                <th className="px-4 py-2.5 font-semibold">Plan</th>
                <th className="px-4 py-2.5 font-semibold">Estado</th>
                <th className="px-4 py-2.5 text-center font-semibold">Miembros</th>
                <th className="px-4 py-2.5 font-semibold">Registrado</th>
              </tr>
            </thead>
            <tbody>
              {(orgs.data ?? []).map((o) => (
                <tr key={o.id} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-3 font-medium">{o.name}</td>
                  <td className="px-4 py-3">{PLAN_LABEL[o.status.tier]}</td>
                  <td className="px-4 py-3">
                    {o.status.active ? (
                      <Badge variant="success">
                        {o.status.isTrial ? `prueba · ${o.status.daysLeft}d` : 'activo'}
                      </Badge>
                    ) : (
                      <Badge variant="default">vencido</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center tabular">{o.members}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(o.createdAt).toLocaleDateString('es-VE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
