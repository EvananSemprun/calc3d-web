import { useState } from 'react';
import { Plus, Target, Trash2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  NumberInput,
  PageSkeleton,
  Stat,
} from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { currentMonthKey } from '@/lib/today';
import { useMoney } from '@/features/settings/useSettings';
import {
  type GoalMonth,
  useDeleteGoal,
  useGoals,
  useSaveGoal,
} from '@/features/goals/api';

/**
 * METAS MENSUALES — la hoja "Metas" del Excel.
 *
 * Solo se cargan las metas: **lo cumplido lo deriva el servidor** de las ventas,
 * los pedidos y los clientes del mes, con las mismas definiciones de la hoja.
 *
 * Las metas se escriben a mano, mes a mes, y no se proyectan: los números del
 * Excel llevan adentro una decisión sobre la temporada (diciembre sube, enero
 * cae) que una proyección automática borraría.
 */
export function GoalsPage() {
  const { data, isLoading } = useGoals();
  const { money } = useMoney();
  const [editando, setEditando] = useState<GoalMonth | 'nuevo' | null>(null);

  if (isLoading) return <PageSkeleton />;

  const meses = data?.months ?? [];
  const t = data?.summary;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Metas</h1>
            <p className="text-sm text-muted-foreground">
              Lo que te proponés cada mes, contra lo que pasó de verdad.
            </p>
          </div>
        </div>
        <Button onClick={() => setEditando('nuevo')}>
          <Plus className="h-4 w-4" /> Meta del mes
        </Button>
      </div>

      {meses.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Sin metas cargadas"
          description="Poné cuánto querés vender, cuántos encargos y cuántos clientes nuevos. El cumplimiento sale solo de lo que ya está registrado."
          action={<Button onClick={() => setEditando('nuevo')}>Cargar la primera</Button>}
        />
      ) : (
        <>
          {t && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Ventas"
                value={`${money(t.sales)} de ${money(t.salesTarget)}`}
                sub={pct(t.salesProgress)}
                accent="yellow"
              />
              <Stat
                label="Encargos"
                value={`${t.orders} de ${t.ordersTarget}`}
                sub={pct(t.ordersProgress)}
              />
              <Stat
                label="Clientes nuevos"
                value={`${t.newClients} de ${t.newClientsTarget}`}
                sub={pct(t.newClientsProgress)}
              />
            </div>
          )}

          <div className="space-y-4">
            {meses.map((m) => (
              <Card key={m.id}>
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-lg font-bold first-letter:uppercase">
                      {nombreDeMes(m.month)}
                    </h2>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditando(m)}>
                        Editar
                      </Button>
                      <BorrarMeta meta={m} />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Renglon
                      titulo="Ventas"
                      real={money(m.sales)}
                      meta={money(m.salesTarget)}
                      progreso={m.salesProgress}
                    />
                    <Renglon
                      titulo="Encargos"
                      real={String(m.orders)}
                      meta={String(m.ordersTarget)}
                      progreso={m.ordersProgress}
                    />
                    <Renglon
                      titulo="Clientes nuevos"
                      real={String(m.newClients)}
                      meta={String(m.newClientsTarget)}
                      progreso={m.newClientsProgress}
                    />
                  </div>
                  {m.notes && <p className="text-xs text-muted-foreground">{m.notes}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {editando && (
        <GoalDialog
          meta={editando === 'nuevo' ? null : editando}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function Renglon({
  titulo,
  real,
  meta,
  progreso,
}: {
  titulo: string;
  real: string;
  meta: string;
  progreso: number | null;
}) {
  const logrado = progreso != null && progreso >= 1;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{titulo}</span>
        <span className="tabular-nums text-muted-foreground">
          {real} de {meta}
          {progreso != null && ` · ${(progreso * 100).toFixed(0)} %`}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className={`h-full rounded-full shadow-glow-sm transition-all ${
            logrado ? 'bg-success' : 'bg-brand-yellow'
          }`}
          // El avance no se recorta en el motor, pero la barra sí: no puede
          // pasarse del ancho. El número al lado sigue diciendo el 180 %.
          style={{ width: `${Math.min(1, progreso ?? 0) * 100}%` }}
        />
      </div>
    </div>
  );
}

function BorrarMeta({ meta }: { meta: GoalMonth }) {
  const borrar = useDeleteGoal();
  const confirm = useConfirm();
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label={`Borrar la meta de ${nombreDeMes(meta.month)}`}
      onClick={async () => {
        if (await confirm({ title: `¿Borrar la meta de ${nombreDeMes(meta.month)}?` })) {
          borrar.mutate(meta.id, { onSuccess: () => notify.success('Meta borrada') });
        }
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

const mesActual = () => currentMonthKey();

function GoalDialog({ meta, onClose }: { meta: GoalMonth | null; onClose: () => void }) {
  const [month, setMonth] = useState(meta?.month ?? mesActual());
  const [salesTarget, setSalesTarget] = useState(meta?.salesTarget ?? 0);
  const [ordersTarget, setOrdersTarget] = useState(meta?.ordersTarget ?? 0);
  const [newClientsTarget, setNewClientsTarget] = useState(meta?.newClientsTarget ?? 0);
  const guardar = useSaveGoal();

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={meta ? `Meta de ${nombreDeMes(meta.month)}` : 'Nueva meta'}
      description="Solo cargás la meta: lo cumplido lo calcula la app sola."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate(
            { month, salesTarget, ordersTarget, newClientsTarget },
            {
              onSuccess: () => {
                notify.success('Meta guardada');
                onClose();
              },
            },
          );
        }}
      >
        <Field label="Mes" hint={meta ? undefined : 'Si ya hay una meta para ese mes, la reemplaza'}>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={!!meta}
            autoFocus={!meta}
          />
        </Field>
        <Field label="Meta de ventas">
          <NumberInput step="0.01" value={salesTarget} onChange={setSalesTarget} autoFocus={!!meta} />
        </Field>
        <Field label="Meta de encargos">
          <NumberInput value={ordersTarget} onChange={setOrdersTarget} />
        </Field>
        <Field label="Meta de clientes nuevos">
          <NumberInput value={newClientsTarget} onChange={setNewClientsTarget} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={!month || guardar.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const pct = (p: number | null) => (p == null ? 'Sin meta' : `${(p * 100).toFixed(0)} % cumplido`);

/** `2026-09` → "septiembre de 2026". El mes se lee en UTC. */
function nombreDeMes(month: string) {
  const [a, m] = month.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString('es-VE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
