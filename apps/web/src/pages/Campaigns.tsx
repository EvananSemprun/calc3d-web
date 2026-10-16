import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Plus, Trash2, Pencil, Download } from 'lucide-react';
import { roas, campaignHealth } from '@calc3d/shared';
import { apiErrorMessage, downloadFile } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import {
  useCampaigns,
  useDeleteCampaign,
  CAMPAIGN_STATUS,
  campaignDisplayStatus,
  HEALTH_META,
  PLATFORM_LABELS,
  PLATFORM_OPTIONS,
  STATUS_OPTIONS,
  type Campaign,
} from '@/features/campaigns/api';
import { CampaignCharts } from '@/features/campaigns/CampaignCharts';
import { CampaignModal } from '@/features/campaigns/CampaignModal';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  FilterBar,
  Select,
  SortHeader,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { useConfirm, Tooltip } from '@/components/overlays';
import { usePersistentState } from '@/lib/usePersistentState';
import { useSortable } from '@/lib/useSortable';
import { notify } from '@/components/toast';

/** ROAS como "3.2x" o "—" si no hay inversión. */
function roasLabel(revenue: number, invested: number): string {
  const r = roas(revenue, invested);
  return r == null ? '—' : `${r.toLocaleString('es-VE', { maximumFractionDigits: 2 })}×`;
}

export function CampaignsPage() {
  const { money } = useMoney();
  const { data: campaigns = [], isLoading } = useCampaigns();
  const [modal, setModal] = useState<{ campaign: Campaign | null } | null>(null);
  const del = useDeleteCampaign();
  const confirm = useConfirm();

  const [platformF, setPlatformF] = usePersistentState('campaigns:platform', '');
  const [statusF, setStatusF] = usePersistentState('campaigns:status', '');

  const totalInvertido = campaigns.reduce((s, c) => s + c.stats.invested, 0);
  const totalVendido = campaigns.reduce((s, c) => s + c.stats.revenue, 0);

  const rows = useMemo(
    () =>
      campaigns
        .filter(
          (c) =>
            (!platformF || c.platform === platformF) &&
            // El estado DERIVADO, no el guardado: con el guardado, elegir
            // "Activa" seguía trayendo campañas vencidas (2026-10-02).
            (!statusF || campaignDisplayStatus(c) === statusF),
        )
        .map((c) => ({
          ...c,
          invested: c.stats.invested,
          revenue: c.stats.revenue,
          orders: c.stats.orders,
          roasVal: roas(c.stats.revenue, c.stats.invested) ?? -1,
        })),
    [campaigns, platformF, statusF],
  );
  type CampaignRow = (typeof rows)[number];
  const { sorted, sortKey, sortDir, toggle } = useSortable<CampaignRow>(rows, 'revenue', 'desc');
  const sort = { sortKey, sortDir, toggle };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Publicidad</h1>
            <p className="text-sm text-muted-foreground">
              Campañas pagadas: cuánto inviertes y si te devuelve ventas. Todo en dólares.
            </p>
          </div>
        </div>
        <div className="grid w-full auto-cols-fr grid-flow-col gap-2 sm:flex sm:w-auto sm:items-center">
          {campaigns.length > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                downloadFile('/campaigns/export.csv', 'calc3d-campanas.csv').catch((e) =>
                  notify.error(apiErrorMessage(e)),
                )
              }
            >
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          )}
          <Button variant="accent" onClick={() => setModal({ campaign: null })}>
            <Plus className="h-4 w-4" /> Nueva campaña
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Campañas" value={String(campaigns.length)} />
        <Stat label="Invertido" value={money(totalInvertido)} accent="yellow" />
        <Stat label="Vendido (atribuido)" value={money(totalVendido)} accent="success" />
        <Stat label="ROAS global" value={roasLabel(totalVendido, totalInvertido)} />
      </div>

      {campaigns.length > 0 && <CampaignCharts campaigns={campaigns} money={money} />}

      {campaigns.length > 0 && (
        <FilterBar>
          <Select className="w-full sm:w-44" value={platformF} onChange={(e) => setPlatformF(e.target.value)}>
            <option value="">Plataforma: todas</option>
            {PLATFORM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select className="w-full sm:w-40" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            <option value="">Estado: todos</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </FilterBar>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton cols={6} />
          ) : campaigns.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              description="Sin campañas todavía. Crea una para medir si tu publicidad genera ventas."
              action={
                <Button variant="accent" onClick={() => setModal({ campaign: null })}>
                  <Plus className="h-4 w-4" /> Nueva campaña
                </Button>
              }
            />
          ) : sorted.length === 0 ? (
            <EmptyState icon={Megaphone} description="Ninguna campaña con esos filtros." />
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <SortHeader<CampaignRow> label="Campaña" sortKey="name" sort={sort} />
                      <th className="px-4 py-2.5 font-semibold">Plataforma</th>
                      <th className="px-4 py-2.5 font-semibold">Salud</th>
                      <SortHeader<CampaignRow> label="Invertido" sortKey="invested" sort={sort} className="text-right" />
                      <SortHeader<CampaignRow> label="Vendido" sortKey="revenue" sort={sort} className="text-right" />
                      <SortHeader<CampaignRow> label="Encargos" sortKey="orders" sort={sort} className="text-right" />
                      <SortHeader<CampaignRow> label="ROAS" sortKey="roasVal" sort={sort} className="text-right" />
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {sorted.map((c) => (
                      <tr key={c.id} className="border-b border-border/70 last:border-0 hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <Link to={`/campaigns/${c.id}`} className="font-medium text-brand-yellow-ink hover:underline">
                            {c.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{PLATFORM_LABELS[c.platform]}</td>
                        <td className="px-4 py-3">
                          <Badge variant={HEALTH_META[campaignHealth(c.stats)].variant}>
                            {HEALTH_META[campaignHealth(c.stats)].label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">{money(c.stats.invested)}</td>
                        <td className="px-4 py-3 text-right text-success">{money(c.stats.revenue)}</td>
                        <td className="px-4 py-3 text-right">{c.stats.orders}</td>
                        <td className="px-4 py-3 text-right font-semibold text-brand-yellow-ink">
                          {roasLabel(c.stats.revenue, c.stats.invested)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Tooltip label="Editar">
                              <Button variant="ghost" size="icon" onClick={() => setModal({ campaign: c })}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </Tooltip>
                            <Tooltip label="Eliminar">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={async () => {
                                  if (
                                    await confirm({
                                      title: `¿Eliminar la campaña "${c.name}"?`,
                                      description:
                                        'Las ventas, encargos y gastos NO se borran: solo dejan de estar atribuidos.',
                                      confirmLabel: 'Eliminar',
                                      tone: 'destructive',
                                    })
                                  ) {
                                    del.mutate(c.id, { onError: (e) => notify.error(apiErrorMessage(e)) });
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Móvil */}
              <div className="divide-y divide-border/70 md:hidden">
                {sorted.map((c) => (
                  <Link key={c.id} to={`/campaigns/${c.id}`} className="block p-4 hover:bg-accent/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-brand-yellow-ink">{c.name}</span>
                      <span className={`text-xs ${CAMPAIGN_STATUS[campaignDisplayStatus(c)].tone}`}>
                        {CAMPAIGN_STATUS[campaignDisplayStatus(c)].label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular">
                      <span>{PLATFORM_LABELS[c.platform]}</span>
                      <span>Inv. {money(c.stats.invested)}</span>
                      <span className="text-success">Vta. {money(c.stats.revenue)}</span>
                      <span className="text-brand-yellow-ink">ROAS {roasLabel(c.stats.revenue, c.stats.invested)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {modal && <CampaignModal campaign={modal.campaign} onClose={() => setModal(null)} />}
    </div>
  );
}
