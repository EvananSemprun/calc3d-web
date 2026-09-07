import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, HelpCircle, PackageCheck } from 'lucide-react';
import { monthKey, monthStart, previousMonth, stockTotal, type StockCountRow } from '@calc3d/shared';
import { Badge, Card, CardContent, NumberInput, TableSkeleton } from '@/components/ui';
import { notify } from '@/components/toast';
import { usePersistentState } from '@/lib/usePersistentState';
import { cn } from '@/lib/utils';
import { useFilamentStock, useFilamentSummary, useSaveStockCount } from '@/features/filament/api';

/**
 * STOCK AL CIERRE DE MES — la hoja "Stock mensual" del Excel.
 *
 * El conteo es MANUAL: el último día del mes se cuentan los rollos y se llenan
 * las tres casillas. No se descuenta lo que consumen los presupuestos porque no
 * todo lo cotizado se imprime ni todo lo impreso sale bien; el estante es lo
 * único que no miente.
 *
 * Las filas se agrupan por color (como la hoja), pero cada marca cuenta aparte:
 * el PLA de Bambu y el de Creality ni cuestan ni imprimen igual.
 */
export function StockTab() {
  const [month, setMonth] = usePersistentState('filament:stock:month', monthKey(new Date()));
  const { data: filas = [], isLoading } = useFilamentStock(month);
  const { data: resumen } = useFilamentSummary(month);
  const guardar = useSaveStockCount();

  // Borrador local: escribir dispara un guardado por campo sería un bombardeo
  // con 39 materiales; se manda al salir del campo.
  const [draft, setDraft] = useState<Record<string, Partes>>({});
  useEffect(() => {
    setDraft(
      Object.fromEntries(
        filas.map((f) => [f.materialId, { sealed: f.sealed, inUse: f.inUse, running: f.running }]),
      ),
    );
  }, [filas]);

  const grupos = useMemo(() => agruparPorColor(filas), [filas]);

  const enviar = (fila: StockCountRow) => {
    const p = draft[fila.materialId];
    if (!p) return;
    if (p.sealed === fila.sealed && p.inUse === fila.inUse && p.running === fila.running) return;
    guardar.mutate(
      { materialId: fila.materialId, month, ...p },
      { onError: () => notify.error('No se pudo guardar el conteo') },
    );
  };

  const set = (id: string, patch: Partial<Partes>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const pendientes = filas.filter((f) => f.needsBrandCheck);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthPicker month={month} onChange={setMonth} />
        <p className="text-sm text-muted-foreground">
          El último día del mes contá los rollos y llená las tres casillas.
        </p>
      </div>

      {resumen && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Rollos en total" value={String(resumen.totalRolls)} />
          <Metric
            label="Por acabarse"
            value={String(resumen.running)}
            tone={resumen.running > 0 ? 'warn' : undefined}
          />
          <Metric
            label="Consumidos en el mes"
            value={resumen.consumption == null ? 'Sin dato' : String(resumen.consumption)}
            hint={
              resumen.consumption == null
                ? `Falta el conteo de ${etiquetaMes(previousMonth(month))}`
                : `Se compraron ${resumen.purchased}`
            }
          />
          <Metric
            label="Hay que reponer"
            value={String(resumen.restock.length)}
            tone={resumen.restock.length > 0 ? 'warn' : undefined}
          />
        </div>
      )}

      {resumen && resumen.restock.length > 0 && (
        <Card className="border-brand-yellow/40">
          <CardContent className="pt-5">
            <h3 className="mb-2 flex items-center gap-2 font-display text-base font-semibold">
              <PackageCheck className="h-4 w-4 text-brand-yellow-ink" />
              Lista de reposición
            </h3>
            <div className="flex flex-wrap gap-2">
              {resumen.restock.map((r) => (
                // Rojo = cero rollos, ámbar = por acabarse. Los mismos colores
                // que usa la hoja para leerla de un vistazo.
                <Badge
                  key={r.materialId}
                  variant={r.status === 'OUT' ? 'outline' : 'warning'}
                  className={
                    r.status === 'OUT'
                      ? 'border-destructive/50 bg-destructive/10 text-destructive'
                      : undefined
                  }
                >
                  {r.name} · {r.status === 'OUT' ? 'sin rollos' : 'por acabarse'}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Los colores descontinuados no entran, aunque estén en cero.
            </p>
          </CardContent>
        </Card>
      )}

      {pendientes.length > 0 && (
        <Card className="border-brand-blue/40">
          <CardContent className="pt-5">
            <h3 className="mb-1 flex items-center gap-2 font-display text-base font-semibold">
              <HelpCircle className="h-4 w-4 text-brand-blue-bright" />
              {pendientes.length} rollo(s) por identificar
            </h3>
            <p className="text-sm text-muted-foreground">
              Vinieron del Excel sin saber de qué marca eran. Al contarlos de nuevo mirando el
              estante, el aviso se apaga solo.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {pendientes.map((p) => (
                <Badge key={p.materialId} variant="outline">
                  {p.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : (
        <Card>
          <CardContent className="space-y-5 pt-5">
            {grupos.map((g) => (
              <section key={g.clave}>
                <header className="mb-2 flex items-baseline justify-between gap-2 border-b border-border/60 pb-1">
                  <h3 className="font-display text-sm font-semibold">{g.clave}</h3>
                  <span className="text-xs text-muted-foreground">
                    {g.total} rollo(s) · {g.filas.length} marca(s)
                  </span>
                </header>

                <div className="hidden grid-cols-[1fr_5rem_5rem_5rem_4rem] gap-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground sm:grid">
                  <span>Marca</span>
                  <span className="text-center">Sin abrir</span>
                  <span className="text-center">En uso</span>
                  <span className="text-center">Por acabarse</span>
                  <span className="text-center">Total</span>
                </div>

                <div className="space-y-2">
                  {g.filas.map((f) => {
                    const p = draft[f.materialId] ?? { sealed: 0, inUse: 0, running: 0 };
                    const total = stockTotal(p);
                    return (
                      <div
                        key={f.materialId}
                        className="grid grid-cols-3 items-center gap-2 sm:grid-cols-[1fr_5rem_5rem_5rem_4rem]"
                      >
                        <div className="col-span-3 flex items-center gap-2 sm:col-span-1">
                          <span className="truncate text-sm">{f.brand ?? 'Sin marca'}</span>
                          {f.status === 'DISCONTINUED' && (
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              descontinuado
                            </Badge>
                          )}
                          {f.needsBrandCheck && (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-brand-blue-bright" />
                          )}
                        </div>
                        <Campo
                          etiqueta="Sin abrir"
                          value={p.sealed}
                          onChange={(n) => set(f.materialId, { sealed: n })}
                          onBlur={() => enviar(f)}
                        />
                        <Campo
                          etiqueta="En uso"
                          value={p.inUse}
                          onChange={(n) => set(f.materialId, { inUse: n })}
                          onBlur={() => enviar(f)}
                        />
                        <Campo
                          etiqueta="Por acabarse"
                          value={p.running}
                          onChange={(n) => set(f.materialId, { running: n })}
                          onBlur={() => enviar(f)}
                        />
                        <div
                          className={cn(
                            'col-span-3 text-right text-sm font-semibold tabular-nums sm:col-span-1 sm:text-center',
                            // Rojo solo si se contó y dio cero: "no hay" no es
                            // lo mismo que "todavía no miré".
                            f.counted && total === 0 && f.status === 'ACTIVE' && 'text-destructive',
                            total > 0 && p.running > 0 && 'text-brand-yellow-ink',
                            !f.counted && 'text-muted-foreground',
                          )}
                          title={f.counted ? undefined : 'Este mes todavía no se contó'}
                        >
                          {total}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface Partes {
  sealed: number;
  inUse: number;
  running: number;
}

function Campo({
  etiqueta,
  value,
  onChange,
  onBlur,
}: {
  etiqueta: string;
  value: number;
  onChange: (n: number) => void;
  onBlur: () => void;
}) {
  return (
    <NumberInput
      className="h-9 text-center"
      min={0}
      value={value}
      onChange={(n) => onChange(Math.max(0, Math.round(n)))}
      onBlur={onBlur}
      aria-label={etiqueta}
      placeholder="0"
    />
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'warn';
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            'font-display text-2xl font-bold tabular-nums',
            tone === 'warn' && 'text-brand-yellow-ink',
          )}
        >
          {value}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** ‹ Septiembre 2026 › — el conteo es de cierre de mes, se navega de a un mes. */
function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const mover = (delta: number) => {
    const d = monthStart(month);
    d.setUTCMonth(d.getUTCMonth() + delta);
    onChange(monthKey(d));
  };
  const esFuturo = month >= monthKey(new Date());

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-background/40 p-1">
      <button
        type="button"
        onClick={() => mover(-1)}
        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-brand-blue/15 hover:text-foreground"
        aria-label="Mes anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[9rem] text-center text-sm font-semibold first-letter:uppercase">
        {etiquetaMes(month)}
      </span>
      <button
        type="button"
        onClick={() => mover(1)}
        disabled={esFuturo}
        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-brand-blue/15 hover:text-foreground disabled:opacity-40"
        aria-label="Mes siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/** `'2026-09'` → `'septiembre 2026'`, leyendo el mes en UTC. */
function etiquetaMes(month: string): string {
  return monthStart(month).toLocaleDateString('es-VE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

interface Grupo {
  clave: string;
  filas: StockCountRow[];
  total: number;
}

/** Agrupa por tipo + color, como las filas de la hoja. */
function agruparPorColor(filas: StockCountRow[]): Grupo[] {
  const mapa = new Map<string, StockCountRow[]>();
  for (const f of filas) {
    const clave = [f.type, f.color].filter(Boolean).join(' ') || f.name;
    const lista = mapa.get(clave) ?? [];
    lista.push(f);
    mapa.set(clave, lista);
  }
  return [...mapa.entries()]
    .map(([clave, lista]) => ({
      clave,
      filas: lista,
      total: lista.reduce((s, f) => s + f.total, 0),
    }))
    .sort((a, b) => a.clave.localeCompare(b.clave, 'es'));
}
