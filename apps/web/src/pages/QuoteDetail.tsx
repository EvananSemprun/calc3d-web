import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Download, FileSpreadsheet } from 'lucide-react';
import type { CalcResult, ExchangeRateSnapshot } from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { notify } from '@/components/toast';
import { ResultPanel } from '@/features/calculator/ResultPanel';
import { useDocRate } from '@/features/settings/useExchangeRates';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, PageSkeleton, Select } from '@/components/ui';

interface Quote {
  id: string;
  name: string;
  quantity: number;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';
  version: number;
  createdAt: string;
  client?: { id: string; name: string } | null;
  totals: CalcResult;
  /** Snapshot de tasa congelado al crear el presupuesto (solo la moneda secundaria). */
  exchangeRates?: ExchangeRateSnapshot | null;
}

interface VersionRow {
  id: string;
  version: number;
  status: string;
  createdAt: string;
  totals: CalcResult;
}

const statuses = [
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'SENT', label: 'Enviado' },
  { value: 'ACCEPTED', label: 'Aceptado' },
  { value: 'REJECTED', label: 'Rechazado' },
];

export function QuoteDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: quote, isLoading } = useQuery({
    queryKey: ['quotes', id],
    queryFn: async () => (await api.get<Quote>(`/quotes/${id}`)).data,
  });
  const { data: versions = [] } = useQuery({
    queryKey: ['quotes', id, 'versions'],
    queryFn: async () => (await api.get<VersionRow[]>(`/quotes/${id}/versions`)).data,
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/quotes/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotes', id] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
  });

  const duplicate = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/quotes/${id}/duplicate`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      navigate(`/quotes/${res.data.id}`);
    },
  });

  const download = async (kind: 'pdf' | 'csv') => {
    try {
      const res = await api.get(`/quotes/${id}/${kind}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cotizacion-${id}.${kind}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify.error(apiErrorMessage(e));
    }
  };

  // Tasa de presentación en Bs: EN VIVO (tasa de hoy) mientras el presupuesto vive;
  // los presupuestos no se cierran, así que siempre se recalcula al valor actual.
  const docRate = useDocRate(quote?.exchangeRates);

  if (isLoading || !quote) return <PageSkeleton />;

  const rateSymbol = docRate && (docRate.currencyCode === 'VES' ? 'Bs' : docRate.currencyCode);

  return (
    <div className="space-y-5">
      <Link to="/quotes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Presupuestos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-9 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">{quote.name}</h1>
            <p className="text-sm text-muted-foreground">
              {quote.quantity} piezas · v{quote.version}
              {quote.client ? ` · ${quote.client.name}` : ''}
            </p>
            {docRate && (
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {docRate.live ? 'Tasa de hoy' : 'Tasa congelada'}: {docRate.rate.toLocaleString('es-VE')}{' '}
                {rateSymbol}/{quote.totals.currency}
                {docRate.label ? ` · ${docRate.label}` : ''}
                {docRate.live ? ' · en vivo' : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select
            className="w-full sm:w-40"
            value={quote.status}
            onChange={(e) => setStatus.mutate(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button variant="outline" onClick={() => duplicate.mutate()} disabled={duplicate.isPending}>
            <Copy className="h-4 w-4" /> Duplicar versión
          </Button>
          <Button variant="outline" onClick={() => download('pdf')}>
            <Download className="h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" onClick={() => download('csv')}>
            <FileSpreadsheet className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <ResultPanel
          result={quote.totals}
          frozenRate={docRate ? { rate: docRate.rate, currencyCode: docRate.currencyCode } : null}
        />

        <Card className="lg:sticky lg:top-6 lg:self-start">
          <CardHeader>
            <CardTitle>Versiones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {versions.map((v) => (
              <Link
                key={v.id}
                to={`/quotes/${v.id}`}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted/50 ${
                  v.id === quote.id
                    ? 'border-brand-yellow/50 bg-brand-yellow/[0.06] shadow-glow-sm'
                    : 'border-border'
                }`}
              >
                <span className="tabular font-medium">v{v.version}</span>
                <Badge variant={v.id === quote.id ? 'brand' : 'outline'}>
                  {v.totals?.costPerUnit?.toFixed(2)}/u
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
