import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import { Badge, Button, Card, CardContent, EmptyState, SearchInput, TableSkeleton } from '@/components/ui';

interface QuoteRow {
  id: string;
  name: string;
  quantity: number;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';
  version: number;
  updatedAt: string;
  client?: { id: string; name: string } | null;
  totals: { costPerUnit: number };
}

const statusLabels: Record<QuoteRow['status'], { label: string; variant: 'default' | 'outline' | 'success' | 'warning' }> = {
  DRAFT: { label: 'Borrador', variant: 'outline' },
  SENT: { label: 'Enviado', variant: 'warning' },
  ACCEPTED: { label: 'Aceptado', variant: 'success' },
  REJECTED: { label: 'Rechazado', variant: 'default' },
};

/** Días de validez de un presupuesto: pasados estos, precios y tasa quedan viejos. */
const VALID_DAYS = 7;
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
/** Un presupuesto DRAFT/SENT más viejo que VALID_DAYS está vencido (recotizar). */
const isExpired = (q: QuoteRow) =>
  (q.status === 'DRAFT' || q.status === 'SENT') && daysSince(q.updatedAt) > VALID_DAYS;

export function QuotesPage() {
  const { money } = useMoney();
  const navigate = useNavigate();
  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: async () => (await api.get<QuoteRow[]>('/quotes')).data,
  });

  // Ciclo de vida: conversión, seguimiento y vencidos.
  const decididos = quotes.filter((q) => q.status === 'ACCEPTED' || q.status === 'REJECTED').length;
  const aceptados = quotes.filter((q) => q.status === 'ACCEPTED').length;
  const conversion = decididos > 0 ? Math.round((aceptados / decididos) * 100) : null;
  const porSeguir = quotes.filter((q) => q.status === 'SENT').length;
  const vencidos = quotes.filter(isExpired).length;

  const [search, setSearch] = useState('');
  const sq = search.trim().toLowerCase();
  const visible = quotes.filter(
    (x) => !sq || x.name.toLowerCase().includes(sq) || (x.client?.name ?? '').toLowerCase().includes(sq),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
        <div>
          <h1 className="font-display text-2xl font-bold">Presupuestos</h1>
          <p className="text-sm text-muted-foreground">
            Cotizaciones guardadas, con historial de versiones.
            {conversion != null && ` · Conversión: ${conversion}% (${aceptados}/${decididos})`}
            {porSeguir > 0 && ` · ${porSeguir} por seguir`}
            {vencidos > 0 && ` · ${vencidos} vencidos`}
          </p>
        </div>
      </div>

      {quotes.length > 0 && (
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre o cliente…"
          className="w-full sm:max-w-md"
        />
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton cols={5} />
          ) : quotes.length === 0 ? (
            <EmptyState
              icon={FileText}
              description="No hay presupuestos todavía. Créalos costeando una pieza en la calculadora."
              action={
                <Button variant="accent" onClick={() => navigate('/')}>
                  Ir a la calculadora
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState icon={FileText} description={`Sin presupuestos para «${search.trim()}».`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Nombre</th>
                    <th className="px-4 py-3 font-semibold">Cliente</th>
                    <th className="px-4 py-3 font-semibold">Cantidad</th>
                    <th className="px-4 py-3 font-semibold">Costo/unidad</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Versión</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((q) => (
                    <tr
                      key={q.id}
                      className="border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          to={`/quotes/${q.id}`}
                          className="font-medium text-brand-yellow-ink hover:underline"
                        >
                          {q.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{q.client?.name ?? '—'}</td>
                      <td className="px-4 py-3 tabular">{q.quantity}</td>
                      <td className="px-4 py-3 tabular">{money(q.totals?.costPerUnit ?? 0)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusLabels[q.status].variant}>
                          {statusLabels[q.status].label}
                        </Badge>
                        {isExpired(q) && (
                          <Badge variant="warning" className="ml-1" title="Precios y tasa viejos: conviene recotizar">
                            vencido
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular">v{q.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
