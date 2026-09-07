import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Megaphone, Plus, Trash2, Pencil, Download } from 'lucide-react';
import { roas, campaignHealth } from '@calc3d/shared';
import { apiErrorMessage, downloadFile } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import {
  useCampaigns,
  useSaveCampaign,
  useDeleteCampaign,
  CAMPAIGN_STATUS,
  HEALTH_META,
  PLATFORM_LABELS,
  PLATFORM_OPTIONS,
  OBJECTIVE_OPTIONS,
  STATUS_OPTIONS,
  type Campaign,
} from '@/features/campaigns/api';
import { CampaignCharts } from '@/features/campaigns/CampaignCharts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  NumberInput,
  SearchInput,
  Select,
  SortHeader,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { Dialog, useConfirm, Tooltip } from '@/components/overlays';
import { usePersistentState } from '@/lib/usePersistentState';
import { useSortable } from '@/lib/useSortable';
import { notify } from '@/components/toast';

const todayIso = () => new Date().toISOString().slice(0, 10);

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

  const [search, setSearch] = useState('');
  const [platformF, setPlatformF] = usePersistentState('campaigns:platform', '');
  const [statusF, setStatusF] = usePersistentState('campaigns:status', '');

  const totalInvertido = campaigns.reduce((s, c) => s + c.stats.invested, 0);
  const totalVendido = campaigns.reduce((s, c) => s + c.stats.revenue, 0);

  const q = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      campaigns
        .filter(
          (c) =>
            (!platformF || c.platform === platformF) &&
            (!statusF || c.status === statusF) &&
            (!q || c.name.toLowerCase().includes(q)),
        )
        .map((c) => ({
          ...c,
          invested: c.stats.invested,
          revenue: c.stats.revenue,
          orders: c.stats.orders,
          roasVal: roas(c.stats.revenue, c.stats.invested) ?? -1,
        })),
    [campaigns, platformF, statusF, q],
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
        <div className="flex items-center gap-2">
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
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar campaña…"
            className="w-full sm:max-w-xs"
          />
          <Select className="w-40" value={platformF} onChange={(e) => setPlatformF(e.target.value)}>
            <option value="">Todas las plataformas</option>
            {PLATFORM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select className="w-40" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            <option value="">Todos los estados</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
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
                      <SortHeader<CampaignRow> label="Pedidos" sortKey="orders" sort={sort} className="text-right" />
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
                                        'Las ventas, pedidos y gastos NO se borran: solo dejan de estar atribuidos.',
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
                      <span className={`text-xs ${CAMPAIGN_STATUS[c.status].tone}`}>
                        {CAMPAIGN_STATUS[c.status].label}
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

function CampaignModal({ campaign, onClose }: { campaign: Campaign | null; onClose: () => void }) {
  const save = useSaveCampaign();
  const [form, setForm] = useState({
    name: campaign?.name ?? '',
    platform: campaign?.platform ?? 'INSTAGRAM',
    objective: campaign?.objective ?? '',
    status: campaign?.status ?? 'ACTIVE',
    startDate: campaign?.startDate?.slice(0, 10) ?? todayIso(),
    endDate: campaign?.endDate?.slice(0, 10) ?? '',
    budget: campaign?.budget ?? 0,
    reach: campaign?.reach ?? 0,
    conversations: campaign?.conversations ?? 0,
    profileVisits: campaign?.profileVisits ?? 0,
    notes: campaign?.notes ?? '',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || save.isPending) return;
    save.mutate(
      {
        id: campaign?.id,
        name: form.name.trim(),
        platform: form.platform,
        objective: form.objective || null,
        status: form.status,
        startDate: form.startDate,
        endDate: form.endDate || null,
        budget: form.budget || null,
        reach: form.reach || null,
        conversations: form.conversations || null,
        profileVisits: form.profileVisits || null,
        notes: form.notes || null,
      },
      {
        onSuccess: () => {
          notify.success(campaign ? 'Campaña actualizada' : 'Campaña creada');
          onClose();
        },
        onError: (err) => notify.error(apiErrorMessage(err)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(n) => !n && onClose()} title={campaign ? 'Editar campaña' : 'Nueva campaña'}>
      <form className="space-y-3" onSubmit={submit}>
        <Field label="Nombre de la campaña" required>
          <Input autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej. Promo llaveros diciembre" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plataforma">
            <Select value={form.platform} onChange={(e) => set({ platform: e.target.value as typeof form.platform })}>
              {PLATFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Objetivo (opcional)">
            <Select value={form.objective} onChange={(e) => set({ objective: e.target.value as typeof form.objective })}>
              <option value="">Sin objetivo</option>
              {OBJECTIVE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Inicio">
            <Input type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          </Field>
          <Field label="Fin (opcional)">
            <Input type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          </Field>
          <Field label="Presupuesto estimado (USD)">
            <NumberInput step="0.01" value={form.budget} onChange={(v) => set({ budget: v })} />
          </Field>
          <Field label="Alcance" hint="Lo que reporta la plataforma">
            <NumberInput value={form.reach} onChange={(v) => set({ reach: v })} />
          </Field>
          <Field label="Conversaciones">
            <NumberInput value={form.conversations} onChange={(v) => set({ conversations: v })} />
          </Field>
          <Field label="Visitas al perfil">
            <NumberInput value={form.profileVisits} onChange={(v) => set({ profileVisits: v })} />
          </Field>
          <Field label="Estado">
            <Select value={form.status} onChange={(e) => set({ status: e.target.value as typeof form.status })}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notas (opcional)">
          <Input value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="accent" disabled={save.isPending || !form.name.trim()}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
