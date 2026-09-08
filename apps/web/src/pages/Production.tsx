import { Activity } from 'lucide-react';
import { Card, CardContent, EmptyState, PageSkeleton, ProgressBar, Stat } from '@/components/ui';
import { useMoney } from '@/features/settings/useSettings';
import { usePrinterUsage } from '@/features/equipment/usage';
import { ReadingsCard } from '@/features/equipment/ReadingsCard';

/**
 * MEDICIÓN DE LA PRODUCCIÓN (punto 9 del backlog).
 *
 * Las tres cosas que ni el Excel ni la app medían. Nada de esto se migró: son
 * datos que se empiezan a juntar hoy, anotando cada pedido al imprimirlo.
 *
 * ⚠️ La pantalla dice SIEMPRE cuántos trabajos hay medidos. Una tasa de fallos
 * sacada de dos pedidos no es una tasa; esconder el tamaño de la muestra la
 * haría parecer un dato firme.
 */

/** La merma que el motor asume mientras no haya medición (`waste.pct`). */
const MERMA_ASUMIDA = 0.08;

export function ProductionPage() {
  const { data, isLoading } = usePrinterUsage();
  const { money } = useMoney();

  if (isLoading) return <PageSkeleton />;

  const t = data?.total;
  const printers = data?.printers ?? [];
  const horas = (h: number) => `${h.toLocaleString('es-VE', { maximumFractionDigits: 1 })} h`;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
        <div>
          <h1 className="font-display text-2xl font-bold">Producción</h1>
          <p className="text-sm text-muted-foreground">
            Lo que de verdad cuesta imprimir: horas de máquina, fallas y mantenimiento.
          </p>
        </div>
      </div>

      {/* Solo cuando NO hay nada de nada: con una sola lectura cargada, decir
          "todavía no hay nada medido" es falso y desalienta. */}
      {t && t.printersWithoutReading === printers.length && t.unmeasuredJobs === t.jobs && (
        <div className="rounded-xl border border-brand-blue/40 bg-brand-blue/[0.06] p-4 text-sm">
          <strong>Todavía no hay nada medido.</strong> Son dos cosas distintas y se cargan en dos
          lugares: las <strong>horas</strong>, una vez por mes acá abajo con lo que marca cada
          máquina; los <strong>fallos</strong>, en cada pedido, anotando cuántas piezas hubo que
          repetir. Con dos meses cargados, la merma del 8 % deja de ser un supuesto.
        </div>
      )}

      <ReadingsCard />

      {t && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Horas de máquina"
            value={t.printersWithoutReading === printers.length ? 'Sin leer' : horas(t.hours)}
            sub={
              t.printersWithoutReading > 0
                ? `${t.printersWithoutReading} de ${printers.length} máquinas sin lectura`
                : 'Según el contador de cada máquina'
            }
          />
          <Stat
            label="Tasa real de fallos"
            value={t.failureRate == null ? 'Sin datos' : `${(t.failureRate * 100).toFixed(1)} %`}
            sub={
              t.failureRate == null
                ? `Mientras tanto, el motor asume ${(MERMA_ASUMIDA * 100).toFixed(0)} %`
                : `${t.reprints} reimpresas de ${t.pieces} piezas · el motor asume ${(MERMA_ASUMIDA * 100).toFixed(0)} %`
            }
            accent={t.failureRate != null && t.failureRate > MERMA_ASUMIDA ? 'yellow' : 'plain'}
          />
          <Stat
            label="Pedidos con fallos anotados"
            value={`${t.measuredJobs} de ${t.jobs}`}
            sub={
              t.measuredJobs < 5
                ? 'Con tan pocos, la tasa todavía no significa nada'
                : 'Muestra suficiente para mirarla'
            }
          />
        </div>
      )}

      {printers.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Sin impresoras cargadas"
          description="Cargá tus equipos en Catálogos para poder medir sus horas."
        />
      ) : (
        <div className="space-y-4">
          {printers.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-lg font-bold">{p.name}</h2>
                  <span className="text-sm text-muted-foreground">
                    {p.hoursThisMonth != null && `${p.hoursThisMonth} h este mes · `}
                    {p.jobs} {p.jobs === 1 ? 'pedido' : 'pedidos'} asignados
                  </span>
                </div>

                <div>
                  <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">Vida útil consumida</span>
                    <span className="tabular-nums text-muted-foreground">
                      {p.lastReading
                        ? `${horas(p.hours)} de ${p.lifetimeHours.toLocaleString('es-VE')} h`
                        : `Sin lectura · vida útil ${p.lifetimeHours.toLocaleString('es-VE')} h`}
                      {p.lifeUsed != null && ` · ${(p.lifeUsed * 100).toFixed(1)} %`}
                    </span>
                  </div>
                  <ProgressBar
                    value={p.lifeUsed ?? 0}
                    tone={(p.lifeUsed ?? 0) >= 1 ? 'danger' : 'gold'}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Dato titulo="Repuestos comprados" valor={money(p.maintenance.spent)} />
                  <Dato
                    titulo="Mantenimiento cobrado"
                    valor={money(p.maintenance.charged)}
                    detalle={
                      p.maintPerHour > 0
                        ? `${money(p.maintPerHour)} por hora`
                        : 'La tarifa por hora está en cero'
                    }
                  />
                  <Dato
                    titulo="Diferencia"
                    valor={money(p.maintenance.difference)}
                    detalle={
                      p.maintenance.spent === 0 && p.maintenance.charged === 0
                        ? 'Todavía sin movimientos'
                        : p.maintenance.difference < 0
                          ? 'Gastaste más de lo que cobraste'
                          : 'Cubierto'
                    }
                    rojo={p.maintenance.difference < 0}
                  />
                </div>

                {p.maintenance.difference < 0 && p.maintPerHour === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Con la tarifa en cero, esos {money(p.maintenance.spent)} de repuestos no entran
                    en ningún precio. Se ajusta en Catálogos → Impresoras.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Dato({
  titulo,
  valor,
  detalle,
  rojo,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  rojo?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </div>
      <div
        className={`mt-0.5 font-display text-lg font-bold tabular-nums ${
          rojo ? 'text-destructive' : ''
        }`}
      >
        {valor}
      </div>
      {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}
