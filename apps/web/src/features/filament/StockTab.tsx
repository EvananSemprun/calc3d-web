import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Lock,
  LockOpen,
  PackageCheck,
} from 'lucide-react';
import {
  BUSINESS_TIME_ZONE,
  monthKey,
  monthStart,
  previousMonth,
  stockTotal,
  type RestockGroup,
  type StockCountRow,
} from '@calc3d/shared';
import {
  Badge,
  Button,
  Card,
  CardContent,
  FilterBar,
  NumberInput,
  SearchInput,
  Select,
  TableSkeleton,
} from '@/components/ui';
import { useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { apiErrorMessage } from '@/lib/api';
import { currentMonthKey } from '@/lib/today';
import { usePersistentState } from '@/lib/usePersistentState';
import { cn } from '@/lib/utils';
import {
  useCloseStockMonth,
  useFilamentMonthStatus,
  useFilamentStock,
  useFilamentSummary,
  useReopenStockMonth,
} from '@/features/filament/api';
import { FichaDialog } from '@/features/filament/FichaDialog';

// Arreglo estable: si `data` viene undefined (cargando o con error), el default
// `= []` del destructuring crearía un arreglo NUEVO en cada render y el efecto
// de más abajo (que depende de `filas`) entraría en bucle de renders.
const SIN_FILAS: StockCountRow[] = [];

/**
 * STOCK AL CIERRE DE MES — la hoja "Stock mensual" del Excel.
 *
 * El conteo es un ACTO DE CIERRE (decisión del dueño, 2026-09-13): el último día
 * del mes (o después) se llenan las casillas y se toca "Guardar y cerrar". Hasta
 * entonces lo escrito vive en un borrador del navegador; después el mes queda de
 * solo lectura y se corrige reabriéndolo. El bloqueo REAL está en el servidor.
 *
 * Casillas vacías = no hay, como en el Excel: al cerrar, lo que no se marcó es 0.
 * Las filas se agrupan por color, con una fila por marca.
 */
export function StockTab() {
  const [month, setMonth] = usePersistentState('filament:stock:month', currentMonthKey());
  // Consulta cruda (no solo `filas`): en TanStack v5 un refetch en segundo
  // plano que falla deja `isError` en true aunque `data` conserve lo último
  // bueno; distinguir "nunca cargó" de "falló refrescando" evita tapar la
  // grilla con el aviso de error cuando en realidad hay datos para mostrar.
  const stockQuery = useFilamentStock(month);
  const filas = stockQuery.data ?? SIN_FILAS;
  const isLoading = stockQuery.isLoading;
  const stockFallo = stockQuery.isError;
  const { data: resumen } = useFilamentSummary(month);
  const { data: estado, isError: estadoFallo } = useFilamentMonthStatus(month);
  const cerrar = useCloseStockMonth();
  const reabrir = useReopenStockMonth();
  const confirm = useConfirm();

  // La ficha abierta en el diálogo (2026-09-14: reemplaza a la página Materiales).
  const [fichaAbierta, setFichaAbierta] = useState<StockCountRow | null>(null);

  const cerrado = !!estado?.closed;
  // Listo para dibujar filas/botón: cargó, no falló ninguna de las dos consultas
  // y el estado del mes llegó. Sin esto, un fallo de red dejaba `filas` en []
  // con `isLoading` en false: el botón de cerrar quedaba habilitado y mandaba
  // un cierre con TODO en cero, borrando de paso el borrador del navegador.
  const listo = !isLoading && !stockFallo && !!estado;
  const claveBorrador = `filament:stock:draft:${month}`;

  // Borrador: lo escrito y todavía no cerrado. Arranca con lo guardado en este
  // navegador o, si no hay (o el mes está cerrado), con lo que tiene la base
  // (un mes reabierto trae sus números para corregirlos).
  //
  // Espera a tener `estado` antes de leer localStorage: el borrador guarda con
  // qué reapertura se escribió (`reopenedAt`), y sin `estado` no hay con qué
  // comparar. Un borrador de OTRO dispositivo, escrito antes de que ESTE
  // navegador viera la reapertura vigente, queda desactualizado y se descarta
  // (ver `leerBorrador`) para no pisar correcciones ya guardadas en la base.
  const [draft, setDraft] = useState<Record<string, Partes>>({});
  useEffect(() => {
    if (!estado) {
      setDraft(Object.fromEntries(filas.map((f) => [f.materialId, partesDe(f)])));
      return;
    }
    setDraft(
      (!cerrado && leerBorrador(claveBorrador, estado.reopenedAt)) ||
        Object.fromEntries(filas.map((f) => [f.materialId, partesDe(f)])),
    );
  }, [claveBorrador, filas, cerrado, estado?.reopenedAt]);

  // Un mes cerrado manda: si quedó un borrador viejo en este navegador (se cerró
  // desde otro lado), se descarta para que al reabrir aparezca lo guardado.
  useEffect(() => {
    if (cerrado) borrarBorrador(claveBorrador);
  }, [cerrado, claveBorrador]);

  // Filtros (2026-09-14): solo cambian lo que SE VE. Cerrar el mes guarda TODAS
  // las fichas, filtradas o no — por eso el Estado arranca en "Todas" y hay aviso.
  const [busqueda, setBusqueda] = usePersistentState('filament:stock:q', '');
  const [tipoF, setTipoF] = usePersistentState('filament:stock:type', '');
  const [estadoRaw, setEstadoF] = usePersistentState('filament:stock:status', '');
  // Un valor viejo o raro en localStorage dejaría la grilla vacía y el selector en blanco.
  const estadoF = ESTADOS.includes(estadoRaw) ? estadoRaw : '';

  const tipos = useMemo(
    () =>
      [...new Set(filas.map((f) => f.type).filter((t): t is string => !!t))].sort((a, b) =>
        a.localeCompare(b, 'es'),
      ),
    [filas],
  );
  // Un tipo guardado que ya no existe este mes (cambió de mes o se editó la
  // ficha) dejaría el Select en blanco y la grilla vacía, igual que `estadoF`.
  const tipoSeguro = tipos.includes(tipoF) ? tipoF : '';
  const filasVisibles = useMemo(() => {
    const q = norm(busqueda.trim());
    return filas.filter(
      (f) =>
        (!tipoSeguro || f.type === tipoSeguro) &&
        (!estadoF || f.status === estadoF) &&
        (!q || norm(`${claveDeColor(f)} ${f.brand ?? ''} ${f.name}`).includes(q)),
    );
  }, [filas, busqueda, tipoSeguro, estadoF]);
  const hayOcultas = filasVisibles.length < filas.length;
  const quitarFiltros = () => {
    setBusqueda('');
    setTipoF('');
    setEstadoF('');
  };

  const grupos = useMemo(() => agruparPorColor(filasVisibles), [filasVisibles]);
  // El total del encabezado es SIEMPRE de TODAS las marcas de ese color, aunque
  // el filtro oculte alguna: el dueño decide reposición por el total real del
  // color, no por lo que quedó visible.
  const gruposCompletos = useMemo(
    () => new Map(agruparPorColor(filas).map((g) => [g.clave, g.filas])),
    [filas],
  );

  // Cerrado: lo guardado, de solo lectura. Abierto: el borrador — así el total
  // de cada grupo (en el encabezado) sigue lo que se está escribiendo en vez
  // de quedarse pegado al valor viejo de la base.
  const valores = (f: StockCountRow): Partes => (cerrado ? partesDe(f) : draft[f.materialId] ?? CERO);

  const set = (id: string, patch: Partial<Partes>) => {
    const next = { ...draft, [id]: { ...(draft[id] ?? CERO), ...patch } };
    setDraft(next);
    // La grilla solo se dibuja con `estado` cargado (ver `listo`/skeleton más
    // abajo), así que acá `estado` ya existe.
    guardarBorrador(claveBorrador, next, estado?.reopenedAt ?? null);
  };

  const cerrarMes = async () => {
    const counts = filas.map((f) => ({ materialId: f.materialId, ...(draft[f.materialId] ?? CERO) }));
    const rollos = counts.reduce((s, c) => s + stockTotal(c), 0);
    const colores = new Set(
      filas.filter((f) => stockTotal(draft[f.materialId] ?? CERO) > 0).map(claveDeColor),
    ).size;
    const mes = etiquetaMes(month);
    const avisoOcultas = hayOcultas
      ? ' Se guardan TODAS las fichas, también las que ocultan los filtros.'
      : '';
    const ok = await confirm(
      rollos === 0
        ? {
            title: `¿Cerrar ${mes}?`,
            description: `No cargaste ningún rollo: ${mes} se va a cerrar con TODO en 0. Después solo se corrige reabriendo el mes.${avisoOcultas}`,
            confirmLabel: 'Guardar y cerrar',
            tone: 'destructive',
          }
        : {
            title: `¿Cerrar ${mes}?`,
            description: `Vas a cerrar ${mes} con ${rollos} rollo(s) en ${colores} color(es). Lo que dejaste vacío queda en 0. Después solo se corrige reabriendo el mes.${avisoOcultas}`,
            confirmLabel: 'Guardar y cerrar',
          },
    );
    if (!ok) return;
    cerrar.mutate(
      { month, counts },
      {
        onSuccess: () => {
          borrarBorrador(claveBorrador);
          notify.success(`Stock de ${mes} cerrado`);
        },
        // El borrador NO se borra: si el cierre falla, lo escrito sigue ahí.
        onError: (e) => notify.error('No se pudo cerrar el mes', apiErrorMessage(e)),
      },
    );
  };

  const reabrirMes = async () => {
    const mes = etiquetaMes(month);
    const ok = await confirm({
      title: `¿Reabrir ${mes}?`,
      description: `Vas a reabrir ${mes} para corregirlo. Mientras esté abierto no cuenta para el resumen ni la reposición.`,
      confirmLabel: 'Reabrir',
    });
    if (!ok) return;
    reabrir.mutate(month, {
      onSuccess: () => notify.success(`${mes} reabierto`),
      onError: (e) => notify.error('No se pudo reabrir el mes', apiErrorMessage(e)),
    });
  };

  const pendientes = filas.filter((f) => f.needsBrandCheck);
  const urgentes = resumen?.restock.filter((g) => g.status !== 'SUGGEST').length ?? 0;
  const sugeridos = resumen?.restock.filter((g) => g.status === 'SUGGEST').length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <MonthPicker month={month} onChange={setMonth} />
          <p className="text-sm text-muted-foreground">
            El último día del mes contá los rollos, llená las casillas y cerrá el mes. Tocá una
            marca para corregir o descontinuar su ficha.
          </p>
        </div>

        {estado &&
          (cerrado ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant="outline" className="gap-1 border-success/50 text-success">
                <Lock className="h-3 w-3" aria-hidden />
                Cerrado el {fechaNegocio(estado.closedAt as string)}
              </Badge>
              {estado.reopenedAt && (
                <span className="text-xs text-muted-foreground">
                  reabierto el {fechaNegocio(estado.reopenedAt)}
                </span>
              )}
              <Button size="sm" variant="outline" onClick={reabrirMes} disabled={reabrir.isPending}>
                <LockOpen className="h-4 w-4" /> Reabrir mes
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="accent"
                onClick={cerrarMes}
                disabled={!estado.canClose || cerrar.isPending || !listo || filas.length === 0}
              >
                <Lock className="h-4 w-4" /> Guardar y cerrar {etiquetaMes(month)}
              </Button>
              {!estado.canClose && (
                <p className="text-xs text-muted-foreground">
                  Se puede cerrar desde el {diaLargo(estado.closableFrom)}.
                </p>
              )}
            </div>
          ))}
      </div>

      {cerrado ? (
        // El resumen se pide APARTE del estado y puede llegar antes o después
        // (a propósito). Entre que el estado ya dice "cerrado" y el resumen
        // todavía no se refrescó con el cierre nuevo, `resumen` puede seguir
        // siendo el del mes ABIERTO: `resumen.complete` es la marca de que ese
        // resumen corresponde de verdad a un mes cerrado, no `resumen` a secas.
        resumen?.complete ? (
          <>
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
                    ? `Falta cerrar ${etiquetaMes(previousMonth(month))}`
                    : `Se compraron ${resumen.purchased}`
                }
              />
              <Metric
                label="Hay que reponer"
                value={String(urgentes)}
                hint={sugeridos > 0 ? `+ ${sugeridos} que conviene reponer` : undefined}
                tone={urgentes > 0 ? 'warn' : undefined}
              />
            </div>
            {resumen.restock.length > 0 && (
              <RestockCard grupos={resumen.restock} promedio={resumen.averagePurchased} />
            )}
          </>
        ) : null
      ) : (
        listo && (
          <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            Cuando cierres {etiquetaMes(month)} vas a ver el total, el consumo y la reposición.
          </p>
        )
      )}

      {pendientes.length > 0 && (
        <Card className="border-brand-blue/40">
          <CardContent className="pt-5">
            <h3 className="mb-1 flex items-center gap-2 font-display text-base font-semibold">
              <HelpCircle className="h-4 w-4 text-brand-blue-bright" />
              {pendientes.length} rollo(s) por identificar
            </h3>
            <p className="text-sm text-muted-foreground">
              Vinieron del Excel sin saber de qué marca eran. Al cerrar el mes contándolos de nuevo
              mirando el estante, el aviso se apaga solo.
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

      {filas.length > 0 && (
        <div className="space-y-2">
          <FilterBar>
            <SearchInput
              value={busqueda}
              onChange={setBusqueda}
              placeholder="Buscar color o marca…"
              className="col-span-full w-full sm:w-64"
            />
            <Select
              className="w-full sm:w-40"
              value={tipoSeguro}
              onChange={(e) => setTipoF(e.target.value)}
            >
              <option value="">Tipo: todos</option>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select className="w-full sm:w-44" value={estadoF} onChange={(e) => setEstadoF(e.target.value)}>
              <option value="">Estado: todas</option>
              <option value="ACTIVE">Activas</option>
              <option value="DISCONTINUED">Descontinuadas</option>
            </Select>
          </FilterBar>
          {hayOcultas && (
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              Se ven {filasVisibles.length} de {filas.length} fichas. Al cerrar el mes se guardan todas,
              también las ocultas.
              <button
                type="button"
                onClick={quitarFiltros}
                className="font-medium text-foreground underline underline-offset-4"
              >
                Quitar filtros
              </button>
            </p>
          )}
        </div>
      )}

      {(stockFallo && !stockQuery.data) || (estadoFallo && !estado) ? (
        <p className="text-sm text-destructive">No se pudo cargar el conteo del mes. Recargá la página.</p>
      ) : !stockQuery.data || !estado ? (
        // Esqueleto solo sin datos: si falla un refetch en segundo plano, la grilla
        // sigue a la vista (el botón de cerrar igual queda bloqueado por `listo`).
        <TableSkeleton rows={8} cols={5} />
      ) : (
        <Card>
          <CardContent className="space-y-5 pt-5">
            {filas.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Todavía no hay fichas de filamento: se crean al registrar una compra en Gastos.
              </p>
            )}
            {filas.length > 0 && grupos.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Ninguna ficha coincide con los filtros.
              </p>
            )}
            {grupos.map((g) => {
              const todas = gruposCompletos.get(g.clave) ?? g.filas;
              const rollosDelColor = todas.reduce((s, f) => s + stockTotal(valores(f)), 0);
              const marcas =
                todas.length > g.filas.length
                  ? `${g.filas.length} de ${todas.length} marca(s)`
                  : `${todas.length} marca(s)`;
              return (
              <section key={g.clave}>
                <header className="mb-2 flex items-baseline justify-between gap-2 border-b border-border/60 pb-1">
                  <h3 className="font-display text-sm font-semibold">{g.clave}</h3>
                  <span className="text-xs text-muted-foreground">
                    {rollosDelColor} rollo(s) · {marcas}
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
                    const p = valores(f);
                    const total = stockTotal(p);
                    const ficha = `${g.clave} ${f.brand ?? 'Sin marca'}`;
                    return (
                      <div
                        key={f.materialId}
                        className="grid grid-cols-3 items-center gap-2 sm:grid-cols-[1fr_5rem_5rem_5rem_4rem]"
                      >
                        <div className="col-span-3 flex items-center gap-2 sm:col-span-1">
                          <button
                            type="button"
                            onClick={() => setFichaAbierta(f)}
                            aria-label={`Ficha de ${ficha}`}
                            className="truncate rounded text-left text-sm underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {f.brand ?? 'Sin marca'}
                          </button>
                          {f.status === 'DISCONTINUED' && (
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              descontinuado
                            </Badge>
                          )}
                          {f.needsBrandCheck && (
                            <AlertTriangle
                              className="h-3.5 w-3.5 shrink-0 text-brand-blue-bright"
                              role="img"
                              aria-label="Marca por identificar"
                            />
                          )}
                        </div>
                        <Campo
                          etiqueta={`Sin abrir · ${ficha}`}
                          value={p.sealed}
                          disabled={cerrado || cerrar.isPending}
                          onChange={(n) => set(f.materialId, { sealed: n })}
                        />
                        <Campo
                          etiqueta={`En uso · ${ficha}`}
                          value={p.inUse}
                          disabled={cerrado || cerrar.isPending}
                          onChange={(n) => set(f.materialId, { inUse: n })}
                        />
                        <Campo
                          etiqueta={`Por acabarse · ${ficha}`}
                          value={p.running}
                          disabled={cerrado || cerrar.isPending}
                          onChange={(n) => set(f.materialId, { running: n })}
                        />
                        <div
                          className={cn(
                            'col-span-3 text-right text-sm font-semibold tabular-nums sm:col-span-1 sm:text-center',
                            // Rojo solo en un mes CERRADO: ahí un 0 es "no hay".
                            // Mientras se llena el borrador todavía no es un dato.
                            cerrado && total === 0 && f.status === 'ACTIVE' && 'text-destructive',
                            total > 0 && p.running > 0 && 'text-brand-yellow-ink',
                          )}
                        >
                          {total}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
              );
            })}
          </CardContent>
        </Card>
      )}

      {fichaAbierta && <FichaDialog fila={fichaAbierta} onClose={() => setFichaAbierta(null)} />}
    </div>
  );
}

interface Partes {
  sealed: number;
  inUse: number;
  running: number;
}

const CERO: Partes = { sealed: 0, inUse: 0, running: 0 };

/** Valores válidos del filtro de estado: '' = todas. */
const ESTADOS = ['', 'ACTIVE', 'DISCONTINUED'];

/** Minúsculas y sin acentos, para que "limon" encuentre "Limón". */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const partesDe = (f: StockCountRow): Partes => ({ sealed: f.sealed, inUse: f.inUse, running: f.running });

/** Tipo + color, como las filas de la hoja. */
const claveDeColor = (f: StockCountRow) => [f.type, f.color].filter(Boolean).join(' ') || f.name;

/**
 * El borrador del mes en este navegador. Además de las casillas, guarda con
 * qué reapertura estaba vigente cuando se escribió (`reopenedAt`): así, si el
 * mes se cerró y reabrió desde OTRO dispositivo mientras este quedaba con la
 * pestaña abierta, el borrador viejo no pisa las correcciones ya guardadas.
 */
interface Borrador {
  reopenedAt: string | null;
  valores: Record<string, Partes>;
}

function esBorradorNuevo(x: unknown): x is Borrador {
  return (
    !!x &&
    typeof x === 'object' &&
    'valores' in x &&
    'reopenedAt' in x &&
    typeof (x as { valores: unknown }).valores === 'object'
  );
}

/**
 * `reopenedAtVigente` es el `reopenedAt` que devuelve HOY `GET
 * /filament/stock/status` para este mes (null si nunca se reabrió). El
 * borrador solo sirve si coincide con esa marca:
 * - Formato viejo (objeto plano de partes, de antes de este cambio): no hay
 *   forma de saber con qué reapertura se escribió → se descarta.
 * - `reopenedAtVigente` no nulo y distinto del guardado (nulo o de una
 *   reapertura anterior): el mes se reabrió después de este borrador → hay
 *   correcciones más nuevas en la base, no se pisan.
 */
function leerBorrador(clave: string, reopenedAtVigente: string | null): Record<string, Partes> | null {
  try {
    const raw = localStorage.getItem(clave);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!esBorradorNuevo(parsed)) {
      localStorage.removeItem(clave);
      return null;
    }
    if (reopenedAtVigente !== null && parsed.reopenedAt !== reopenedAtVigente) {
      localStorage.removeItem(clave);
      return null;
    }
    return parsed.valores;
  } catch {
    return null;
  }
}

function guardarBorrador(clave: string, valores: Record<string, Partes>, reopenedAt: string | null) {
  try {
    const borrador: Borrador = { reopenedAt, valores };
    localStorage.setItem(clave, JSON.stringify(borrador));
  } catch {
    // Sin almacenamiento (modo privado, cuota): el borrador queda solo en memoria.
  }
}

function borrarBorrador(clave: string) {
  try {
    localStorage.removeItem(clave);
  } catch {
    // Idem: no hay nada que borrar.
  }
}

/** Una fecha guardada (ISO) → `'01/09/2026'`, en la zona del negocio. */
function fechaNegocio(iso: string): string {
  return new Date(iso).toLocaleDateString('es-VE', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** `'2026-08-31'` → `'31 de agosto'`. */
function diaLargo(dia: string): string {
  return new Date(`${dia}T12:00:00Z`).toLocaleDateString('es-VE', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function Campo({
  etiqueta,
  value,
  disabled,
  onChange,
}: {
  etiqueta: string;
  value: number;
  disabled: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <NumberInput
      className="h-9 text-center"
      min={0}
      value={value}
      disabled={disabled}
      onChange={(n) => onChange(Math.max(0, Math.round(n)))}
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

/** Las tres columnas de la lista de reposición, en el orden de urgencia. */
const COLUMNAS: {
  status: RestockGroup['status'];
  titulo: string;
  vacio: string;
  punto: string;
  texto: string;
}[] = [
  { status: 'OUT', titulo: 'Sin rollos', vacio: 'Ningún color en cero.', punto: 'bg-destructive', texto: 'text-destructive' },
  { status: 'LOW', titulo: 'Por acabarse', vacio: 'Ninguno por acabarse.', punto: 'bg-brand-yellow', texto: 'text-brand-yellow-ink' },
  { status: 'SUGGEST', titulo: 'Conviene reponer', vacio: 'Tus colores más comprados tienen repuesto.', punto: 'bg-brand-blue-bright', texto: 'text-foreground' },
];

/**
 * LISTA DE REPOSICIÓN — por tipo + color, no por marca: la marca cambia de un
 * mes a otro, el color es lo que se maneja. Cada columna va de más comprado a
 * menos, para que arriba quede lo que más se usa.
 */
function RestockCard({ grupos, promedio }: { grupos: RestockGroup[]; promedio: number }) {
  return (
    <Card className="border-brand-yellow/40">
      <CardContent className="space-y-4 pt-5">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold">
          <PackageCheck className="h-4 w-4 text-brand-yellow-ink" />
          Lista de reposición
        </h3>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))' }}
        >
          {COLUMNAS.map((col) => {
            const items = grupos.filter((g) => g.status === col.status);
            return (
              <section key={col.status} className="space-y-2 rounded-xl border border-border/60 bg-background/30 p-3">
                <h4 className={cn('flex items-center gap-2 text-sm font-semibold', col.texto)}>
                  <span aria-hidden className={cn('h-2 w-2 rounded-full', col.punto)} />
                  {col.titulo}
                  <span className="ml-auto tabular-nums text-muted-foreground">{items.length}</span>
                </h4>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{col.vacio}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {items.map((g) => (
                      <li key={g.key} className="rounded-lg bg-card/60 px-2.5 py-1.5">
                        <div className="text-sm font-medium">{g.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {g.purchased > 0
                            ? `Compraste ${g.purchased} ${g.purchased === 1 ? 'rollo' : 'rollos'}`
                            : 'Sin compras registradas'}
                          {g.status !== 'OUT' && ` · te ${g.total === 1 ? 'queda 1' : `quedan ${g.total}`}`}
                          {g.brands.length > 0 && ` · ${g.brands.join(', ')}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Por tipo y color, con todas las marcas juntas. «Conviene reponer» son los colores que
          comprás más que el promedio ({promedio.toLocaleString('es', { maximumFractionDigits: 1 })}{' '}
          rollos por color, hasta el cierre del mes) y a los que les queda 1 rollo o menos. Los
          colores descontinuados no entran.
        </p>
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
  const esFuturo = month >= currentMonthKey();

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

/** `'2026-09'` → `'septiembre de 2026'`, leyendo el mes en UTC. */
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
}

/** Agrupa por tipo + color, como las filas de la hoja. */
function agruparPorColor(filas: StockCountRow[]): Grupo[] {
  const mapa = new Map<string, StockCountRow[]>();
  for (const f of filas) {
    const clave = claveDeColor(f);
    const lista = mapa.get(clave) ?? [];
    lista.push(f);
    mapa.set(clave, lista);
  }
  return [...mapa.entries()]
    .map(([clave, lista]) => ({ clave, filas: lista }))
    .sort((a, b) => a.clave.localeCompare(b.clave, 'es'));
}
