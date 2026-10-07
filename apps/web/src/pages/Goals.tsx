import { useEffect, useState } from 'react';
import { Plus, Sparkles, Target, Trash2, TriangleAlert } from 'lucide-react';
import { GROWTH_LEVELS, type GrowthLevel, type MetricSuggestion } from '@calc3d/shared';
import { Badge, Button, Card, CardContent, EmptyState, Field, Input, NumberInput, PageSkeleton, ProgressBar, Select, Stat } from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { currentMonthKey } from '@/lib/today';
import { apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import {
  type GoalMonth,
  useDeleteGoal,
  useGoalSuggestion,
  useGoals,
  useMonthActuals,
  useSaveGoal,
} from '@/features/goals/api';

/**
 * METAS MENSUALES — la hoja "Metas" del Excel.
 *
 * Solo se cargan las metas: **lo cumplido lo deriva el servidor** de las ventas,
 * los pedidos y los clientes del mes, con las mismas definiciones de la hoja.
 *
 * "Sugerir metas" **rellena el formulario y no guarda nada**. La regla no es que
 * las metas no se proyecten: es que **la última palabra no la tiene el
 * promedio**. Los números del Excel llevan adentro una decisión sobre la
 * temporada (diciembre sube, enero cae) y por eso la propuesta se puede editar
 * entera, y avisa cuando la base la va a engañar.
 */

/** Dónde está parado un mes respecto de hoy, en hora LOCAL (la del dueño). */
type EstadoMes = 'FUTURO' | 'EN_CURSO' | 'CERRADO';
const estadoDeMes = (month: string): EstadoMes => {
  const actual = currentMonthKey();
  if (month > actual) return 'FUTURO';
  if (month === actual) return 'EN_CURSO';
  return 'CERRADO';
};

export function GoalsPage() {
  const { data, isLoading } = useGoals();
  const [mes, setMes] = useState(currentMonthKey());
  const [editando, setEditando] = useState<GoalMonth | 'nuevo' | null>(null);

  if (isLoading) return <PageSkeleton />;

  const meses = data?.months ?? [];
  const delMes = meses.find((m) => m.month === mes) ?? null;

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
        <Button className="w-full sm:w-auto" onClick={() => setEditando('nuevo')}>
          <Plus className="h-4 w-4" /> Meta del mes
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold first-letter:uppercase">
                {nombreDeMes(mes)}
              </h2>
              <p className="text-sm text-muted-foreground">{leyenda(mes, delMes)}</p>
            </div>
            <Field label="Mes">
              <Input
                type="month"
                value={mes}
                onChange={(e) => e.target.value && setMes(e.target.value)}
                aria-label="Mes a mostrar"
              />
            </Field>
          </div>
          <ResumenDelMes month={mes} meta={delMes} onCargar={() => setEditando('nuevo')} />
        </CardContent>
      </Card>

      {meses.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Sin metas cargadas"
          description="Poné cuánto querés vender, cuántos encargos y cuántos clientes nuevos. El cumplimiento sale solo de lo que ya está registrado."
          action={<Button onClick={() => setEditando('nuevo')}>Cargar la primera</Button>}
        />
      ) : (
        <div className="space-y-4">
          <h2 className="font-display text-lg font-bold">Histórico</h2>
          {meses.map((m) => (
            <Card key={m.id}>
              <CardContent className="space-y-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-base font-bold first-letter:uppercase">
                    {nombreDeMes(m.month)}
                  </h3>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditando(m)}>
                      Editar
                    </Button>
                    <BorrarMeta meta={m} />
                  </div>
                </div>
                <Renglones month={m.month} meta={m} />
                {m.notes && <p className="text-xs text-muted-foreground">{m.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editando && (
        <GoalDialog
          meta={editando === 'nuevo' ? null : editando}
          mesSugerido={editando === 'nuevo' ? mes : undefined}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}

const leyenda = (month: string, meta: GoalMonth | null) => {
  const e = estadoDeMes(month);
  if (e === 'FUTURO') return 'Todavía no empezó: la meta ya está puesta y el resultado se va a ir llenando solo.';
  if (!meta) return 'No hay meta cargada para este mes. Esto es lo que pasó igual.';
  return e === 'EN_CURSO' ? 'El mes está en curso: el avance es parcial.' : 'Mes cerrado.';
};

/**
 * Las tres tarjetas del mes elegido.
 *
 * Un mes **sin meta** igual tuvo ventas, y hay que poder verlas: por eso se
 * piden aparte en vez de quedarse en blanco.
 */
function ResumenDelMes({
  month,
  meta,
  onCargar,
}: {
  month: string;
  meta: GoalMonth | null;
  onCargar: () => void;
}) {
  const { money } = useMoney();
  // Solo cuando no hay meta: si la hay, lo real ya viene con ella.
  const sueltos = useMonthActuals(meta ? '' : month);
  const real = meta ?? sueltos.data;

  if (!real) return <div className="h-20 animate-pulse rounded-xl bg-muted/40" />;

  const futuro = estadoDeMes(month) === 'FUTURO';

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Ventas"
          value={futuro ? '—' : money(real.sales)}
          sub={meta ? `de ${money(meta.salesTarget)} · ${pct(meta.salesProgress, futuro)}` : SIN_META}
          accent="yellow"
        />
        <Stat
          label="Encargos"
          value={futuro ? '—' : String(real.orders)}
          sub={meta ? `de ${meta.ordersTarget} · ${pct(meta.ordersProgress, futuro)}` : SIN_META}
        />
        <Stat
          label="Clientes nuevos"
          value={futuro ? '—' : String(real.newClients)}
          sub={meta ? `de ${meta.newClientsTarget} · ${pct(meta.newClientsProgress, futuro)}` : SIN_META}
        />
      </div>
      {!meta && (
        <Button size="sm" variant="ghost" onClick={onCargar}>
          <Plus className="h-4 w-4" /> Cargar la meta de este mes
        </Button>
      )}
    </>
  );
}

function Renglones({ month, meta }: { month: string; meta: GoalMonth }) {
  const { money } = useMoney();
  const futuro = estadoDeMes(month) === 'FUTURO';
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Renglon titulo="Ventas" real={money(meta.sales)} metaTxt={money(meta.salesTarget)} progreso={meta.salesProgress} futuro={futuro} />
      <Renglon titulo="Encargos" real={String(meta.orders)} metaTxt={String(meta.ordersTarget)} progreso={meta.ordersProgress} futuro={futuro} />
      <Renglon titulo="Clientes nuevos" real={String(meta.newClients)} metaTxt={String(meta.newClientsTarget)} progreso={meta.newClientsProgress} futuro={futuro} />
    </div>
  );
}

function Renglon({
  titulo,
  real,
  metaTxt,
  progreso,
  futuro,
}: {
  titulo: string;
  real: string;
  metaTxt: string;
  progreso: number | null;
  futuro: boolean;
}) {
  const logrado = progreso != null && progreso >= 1;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{titulo}</span>
        <span className="tabular-nums text-muted-foreground">
          {futuro ? (
            <>meta {metaTxt}</>
          ) : (
            <>
              {real} de {metaTxt}
              {progreso != null && ` · ${(progreso * 100).toFixed(0)} %`}
            </>
          )}
        </span>
      </div>
      {/* Un mes que no empezó no fracasó: una barra vacía al lado de la meta se
          lee como un 0 % que nadie dejó de cumplir todavía. */}
      {futuro ? (
        <p className="text-xs text-muted-foreground">Aún no empezó</p>
      ) : (
        <>
          {/* El avance no se recorta en el motor, pero la barra sí (lo hace
              `ProgressBar`): el número al lado sigue diciendo el 180 %. */}
          <ProgressBar value={progreso ?? 0} tone={logrado ? 'success' : 'gold'} />
          {logrado && <p className="mt-1 text-xs text-success">Meta superada</p>}
        </>
      )}
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

function GoalDialog({
  meta,
  mesSugerido,
  onClose,
}: {
  meta: GoalMonth | null;
  mesSugerido?: string;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(meta?.month ?? mesSugerido ?? currentMonthKey());
  const [salesTarget, setSalesTarget] = useState(meta?.salesTarget ?? 0);
  const [ordersTarget, setOrdersTarget] = useState(meta?.ordersTarget ?? 0);
  const [newClientsTarget, setNewClientsTarget] = useState(meta?.newClientsTarget ?? 0);

  const [pedida, setPedida] = useState(false);
  const [growth, setGrowth] = useState<GrowthLevel>('CONSERVADOR');
  const confirm = useConfirm();
  const guardar = useSaveGoal();
  const propuesta = useGoalSuggestion(month, growth, pedida);

  // Rellenar cuando llega una propuesta nueva. No pisa lo que el dueño editó a
  // mano después: `data` solo cambia al volver a pedirla (otro mes, otro nivel).
  const datos = propuesta.data;
  useEffect(() => {
    if (!datos) return;
    if (datos.sales.value != null) setSalesTarget(datos.sales.value);
    if (datos.orders.value != null) setOrdersTarget(datos.orders.value);
    if (datos.newClients.value != null) setNewClientsTarget(datos.newClients.value);
  }, [datos]);

  const hayValores = salesTarget > 0 || ordersTarget > 0 || newClientsTarget > 0;

  const sugerir = async () => {
    if (hayValores && !pedida) {
      const ok = await confirm({
        title: '¿Reemplazar lo que ya cargaste?',
        description: 'La propuesta pisa los tres valores. Después los podés editar antes de guardar.',
        confirmLabel: 'Reemplazar',
      });
      if (!ok) return;
    }
    setPedida(true);
  };

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
              onError: (err) => notify.error(apiErrorMessage(err)),
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

        <div className="space-y-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!month || propuesta.isFetching}
            onClick={sugerir}
          >
            <Sparkles className="h-4 w-4" />
            {propuesta.isFetching ? 'Calculando…' : 'Sugerir metas'}
          </Button>
          {!month && (
            <p className="text-xs text-muted-foreground">Elegí primero el mes para poder sugerir.</p>
          )}
          {pedida && propuesta.isError && (
            <p className="text-xs text-destructive">{apiErrorMessage(propuesta.error)}</p>
          )}
        </div>

        {pedida && datos && (
          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
            <Field label="Crecimiento sobre la base">
              <Select value={growth} onChange={(e) => setGrowth(e.target.value as GrowthLevel)}>
                {(Object.keys(GROWTH_LEVELS) as GrowthLevel[]).map((n) => (
                  <option key={n} value={n}>
                    {`${NOMBRE_NIVEL[n]} · ${GROWTH_LEVELS[n] === 0 ? 'sin crecer' : `+${Math.round(GROWTH_LEVELS[n] * 100)} %`}`}
                  </option>
                ))}
              </Select>
            </Field>
            {/* El aviso va ARRIBA de Guardar y no al pie: es lo último que hay
                que leer antes de fijar el número. */}
            {datos.seasonal.status === 'ATIPICO' && (
              <p className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 p-2 text-xs">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>
                  Ojo: {nombreDeMes(datos.seasonal.month)} se despegó{' '}
                  {Math.abs(Math.round(datos.seasonal.deviationPct * 100))} %{' '}
                  {datos.seasonal.deviationPct < 0 ? 'por debajo' : 'por encima'} de su propia base.
                  Este mes suele no parecerse a los tres anteriores.
                </span>
              </p>
            )}
            {datos.seasonal.status === 'SIN_HISTORIA' && (
              <p className="text-xs text-muted-foreground">
                Todavía no hay un año de historial, así que no se puede saber si este mes suele
                despegarse de su base. Que no haya aviso no quiere decir que no pase.
              </p>
            )}
          </div>
        )}

        <Field label="Meta de ventas">
          <NumberInput step="0.01" value={salesTarget} onChange={setSalesTarget} autoFocus={!!meta} />
          <Explicacion s={datos?.sales} />
        </Field>
        <Field label="Meta de encargos">
          <NumberInput value={ordersTarget} onChange={setOrdersTarget} />
          <Explicacion s={datos?.orders} />
        </Field>
        <Field label="Meta de clientes nuevos">
          <NumberInput value={newClientsTarget} onChange={setNewClientsTarget} />
          <Explicacion s={datos?.newClients} />
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

/**
 * De dónde salió la propuesta. **Nombra los meses**, no solo los cuenta: la base
 * son los últimos completos que existen hoy, así que cargando enero puede estar
 * sugiriendo sobre julio-septiembre — defendible, pero solo si se ve.
 */
function Explicacion({ s }: { s?: MetricSuggestion }) {
  if (!s) return null;
  if (s.value == null) {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        Sin datos suficientes para sugerir: cargalo a mano.
      </p>
    );
  }
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <Badge variant="outline">Sugerido</Badge>
      <span className="tabular-nums">
        base {s.base} · mes anterior {s.previous ?? '—'}
      </span>
      <span>· {s.monthsUsed.map(nombreCorto).join(', ')}</span>
    </p>
  );
}

const NOMBRE_NIVEL: Record<GrowthLevel, string> = {
  CONSERVADOR: 'Conservador',
  MODERADO: 'Moderado',
  AMBICIOSO: 'Ambicioso',
};

const SIN_META = 'Sin meta definida';

const pct = (p: number | null, futuro: boolean) => {
  if (futuro) return 'aún no empezó';
  if (p == null) return SIN_META;
  return `${(p * 100).toFixed(0)} % cumplido`;
};

/** `2026-09` → "septiembre de 2026". El mes se lee en UTC. */
function nombreDeMes(month: string) {
  const [a, m] = month.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString('es-VE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** `2026-09` → "sep". Para listar los meses usados sin ocupar tres renglones. */
function nombreCorto(month: string) {
  const [a, m] = month.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString('es-VE', {
    month: 'short',
    timeZone: 'UTC',
  });
}
