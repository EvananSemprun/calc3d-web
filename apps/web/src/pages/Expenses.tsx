import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Receipt, Trash2 } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  FilterBar,
  Select,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { useConfirm, Tooltip } from '@/components/overlays';
import { notify } from '@/components/toast';
import { DateRangePicker, useDateRange } from '@/features/finance/DateRange';
import { useExpenses, type ExpenseRow } from '@/features/finance/api';
import {
  TIPOS_DE_GASTO,
  TODOS,
  filaDeGasto,
  pasaTipo,
  tipoSeguro,
  totalesGastos,
  type FilaGasto,
} from '@/features/finance/expenses-view';
import { ExpenseModal } from '@/features/finance/ExpenseModal';
import { useCounterparties } from '@/features/cash/api';
import { usePersistentState } from '@/lib/usePersistentState';

/** Lo que se dibuja en una celda de tabla sin dato. Las tarjetas no dibujan la línea. */
const SIN_DATO = '—';

export function ExpensesPage() {
  const { data: contrapartes = [] } = useCounterparties();
  const range = useDateRange('MONTH', 'expenses');
  const { money } = useMoney();
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useExpenses(range);
  // Los dos filtros se RECUERDAN, como el resto del panel (el rango de fechas
  // de esta misma pantalla ya lo hacía). Cada uno pasa por su valor seguro
  // antes de usarse: ver `tipoSeguro` y `proveedorSeguro`.
  const [tipoGuardado, setTypeFilter] = usePersistentState('expenses:tipo', TODOS);
  const [proveedorFilter, setProveedorFilter] = usePersistentState(
    'expenses:proveedor',
    TODOS,
  );
  const typeFilter = tipoSeguro(tipoGuardado);
  // Las opciones del filtro salen de LAS FILAS CARGADAS, no del directorio
  // entero (el patrón de `PurchasesTab` con `uniqueSorted`): así no se puede
  // elegir un proveedor que deje la tabla vacía. Se agrupa por ID y no por
  // nombre porque dos proveedores que se llamen parecido son contactos
  // distintos, y el nombre de uno no puede arrastrar al otro.
  const proveedores = useMemo(() => {
    const porId = new Map<string, string>();
    for (const e of rows) if (e.provider) porId.set(e.provider.id, e.provider.name);
    return [...porId]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [rows]);
  // Valor "seguro": un proveedor elegido que ya no está entre las opciones
  // (cambió el rango de fechas) cae a "todos", en vez de dejar la tabla vacía.
  const proveedorSeguro = proveedores.some((p) => p.id === proveedorFilter)
    ? proveedorFilter
    : TODOS;
  const matchesProveedor = (e: ExpenseRow) =>
    proveedorSeguro === TODOS || e.provider?.id === proveedorSeguro;
  const visibleRows = rows.filter((e) => pasaTipo(typeFilter, e) && matchesProveedor(e));

  // Qué filtros están puestos, con el mismo texto que el desplegable.
  const filtrosPuestos = [
    typeFilter !== TODOS ? TIPOS_DE_GASTO.find((t) => t.value === typeFilter)?.label : null,
    proveedorSeguro !== TODOS ? proveedores.find((p) => p.id === proveedorSeguro)?.name : null,
  ].filter((t): t is string => !!t);
  // ⚠️ "Con filtros" solo cambia los textos cuando hay algo que filtrar: en un
  // periodo sin ningún gasto, "ninguno de los 0 pasa el filtro" es peor que
  // decir derecho que no hay gastos.
  const hayFiltros = filtrosPuestos.length > 0 && rows.length > 0;
  const quitarFiltros = () => {
    setTypeFilter(TODOS);
    setProveedorFilter(TODOS);
  };
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      notify.success('Gasto eliminado');
    },
    onError: (error) => notify.error(apiErrorMessage(error)),
  });

  // Quién lo pagó se corrige desde la tabla: los gastos viejos nacieron todos
  // como "Negocio" y la Caja depende de que esto esté bien.
  const cambiarPagador = useMutation({
    mutationFn: ({ id, counterpartyId }: { id: string; counterpartyId: string | null }) =>
      api.patch(`/expenses/${id}`, { counterpartyId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['cash'] });
    },
    onError: (error) => notify.error(apiErrorMessage(error)),
  });

  // ⚠️ Sobre `visibleRows`, lo mismo que muestra la tabla.
  const { total, inversion, operativo } = totalesGastos(visibleRows);

  // ⚠️ UN solo array de filas ya resueltas, mapeado por las DOS presentaciones
  // (tabla desde `md`, tarjetas en el teléfono). El JSX de cada lado es tonto:
  // no formatea montos ni decide nada. Es la regla que ya sigue Caja.
  const filas = visibleRows.map((e) => filaDeGasto(e, money));

  // Los dos handlers también viven acá una sola vez: las dos presentaciones les
  // pasan el id de la fila y nada más.
  const borrar = async (id: string) => {
    if (
      await confirm({
        title: '¿Eliminar gasto?',
        description: 'Esta acción no se puede deshacer.',
        confirmLabel: 'Eliminar',
        tone: 'destructive',
      })
    ) {
      remove.mutate(id);
    }
  };
  const elegirPagador = (id: string, valor: string) =>
    cambiarPagador.mutate({ id, counterpartyId: valor || null });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Gastos e inversiones</h1>
            <p className="text-sm text-muted-foreground">
              Todo el dinero que sale, en un solo lugar. Enlaza con tus catálogos sin duplicar.
            </p>
          </div>
        </div>
        <Button variant="accent" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Registrar gasto
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterBar className="w-full sm:w-auto">
          <div className="col-span-full sm:col-span-1">
            <DateRangePicker range={range} />
          </div>
          <Select
            className="w-full sm:w-48"
            value={typeFilter}
            aria-label="Filtrar por tipo de gasto"
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value={TODOS}>Todos los tipos</option>
            {TIPOS_DE_GASTO.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          {/* Solo se dibuja si hay proveedor que elegir: con los 87 gastos sin
              proveedor cargado, un select de una sola opción es ruido que ocupa
              media fila de teléfono. */}
          {proveedores.length > 0 && (
            <Select
              className="w-full sm:w-48"
              value={proveedorSeguro}
              aria-label="Filtrar por proveedor"
              onChange={(e) => setProveedorFilter(e.target.value)}
            >
              <option value={TODOS}>Proveedor: todos</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          )}
        </FilterBar>
        {/* En el teléfono los totales se reparten el ancho en vez de desbordar. */}
        <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
          {/* ⚠️ Los tres suman LO QUE SE VE, así que con un filtro puesto ya no
              son "del periodo": la etiqueta lo dice y el aviso de abajo nombra
              los filtros. Cambiar el número y dejar el cartel viejo sería
              cambiar una mentira por otra. */}
          <Stat
            label={hayFiltros ? 'Total de lo que se ve' : 'Total del periodo'}
            value={money(total)}
            sub={hayFiltros ? `${visibleRows.length} de ${rows.length} gastos` : 'todo lo que salió'}
            accent="yellow"
            className="min-w-[150px]"
          />
          <Stat
            label="Operativo"
            value={money(operativo)}
            sub={hayFiltros ? 'lo que resta ganancia, de lo filtrado' : 'lo que resta ganancia'}
            className="min-w-[150px]"
          />
          <Stat
            label="De inversión"
            value={money(inversion)}
            sub="equipos, incluidos en el total"
            accent="blue"
            className="min-w-[150px]"
          />
        </div>
      </div>

      {/* Qué se está mirando, dicho con los nombres de los filtros, y cómo
          volver a ver todo. Sin esto, los totales de "lo que se ve" obligan a
          revisar dos desplegables para saber qué quedó afuera. */}
      {hayFiltros && !isLoading && visibleRows.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Se ven {visibleRows.length} de {rows.length} gasto(s) del periodo · filtros:{' '}
          {filtrosPuestos.join(' · ')}.{' '}
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={quitarFiltros}
          >
            Quitar filtros
          </button>
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton cols={7} />
          ) : visibleRows.length === 0 ? (
            /* Con un filtro puesto, "sin gastos en este periodo" es falso: los
               gastos están, el filtro los deja afuera. Y ofrecer "Registrar
               gasto" ahí manda a cargar uno que ya existe. */
            <EmptyState
              icon={Receipt}
              description={
                hayFiltros
                  ? `Ninguno de los ${rows.length} gasto(s) del periodo pasa el filtro (${filtrosPuestos.join(
                      ' · ',
                    )}).`
                  : 'Sin gastos en este periodo.'
              }
              action={
                hayFiltros ? (
                  <Button variant="outline" size="sm" onClick={quitarFiltros}>
                    Quitar filtros
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                    <Plus className="h-4 w-4" /> Registrar gasto
                  </Button>
                )
              }
            />
          ) : (
            <>
              {/* Escritorio: la tabla, con las ocho columnas de siempre. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Fecha</th>
                      <th className="px-4 py-3 font-semibold">Tipo / Recurso</th>
                      <th className="px-4 py-3 font-semibold">Descripción</th>
                      <th className="px-4 py-3 font-semibold">Proveedor</th>
                      <th className="px-4 py-3 text-right font-semibold">Cant.</th>
                      <th className="px-4 py-3 text-right font-semibold">Monto</th>
                      <th className="px-4 py-3 font-semibold">Pagó</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr
                        key={f.id}
                        className="border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-4 py-3 tabular">{f.dia}</td>
                        <td className="px-4 py-3">
                          <EtiquetaDeTipo fila={f} />
                        </td>
                        <td className="px-4 py-3">
                          {f.descripcion}
                          {f.duracion && <span className="text-muted-foreground"> {f.duracion}</span>}
                          {f.deFactura && (
                            <span className="ml-2 align-middle">
                              <MarcaDeFactura />
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{f.proveedor ?? SIN_DATO}</td>
                        <td className="px-4 py-3 text-right tabular">{f.cantidad ?? SIN_DATO}</td>
                        <td className="px-4 py-3 text-right tabular font-semibold">{f.monto}</td>
                        <td className="px-4 py-3">
                          <SelectorDePagador
                            fila={f}
                            contrapartes={contrapartes}
                            onElegir={elegirPagador}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!f.deFactura && <BotonBorrar fila={f} onBorrar={borrar} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Teléfono: una tarjeta por gasto. La tabla medía 884 px dentro
                  de un contenedor de 341 a 375 px de pantalla —se veía el 39 %
                  de la fila y el resto había que arrastrarlo de costado—, y era
                  la última lista de finanzas sin tarjetas. */}
              <ul className="divide-y divide-border/70 md:hidden">
                {filas.map((f) => (
                  <li key={f.id} className="space-y-2 p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 font-medium">{f.descripcion}</span>
                      <span className="shrink-0 font-semibold tabular">{f.monto}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <EtiquetaDeTipo fila={f} />
                      {f.deFactura && <MarcaDeFactura />}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span className="tabular">{f.dia}</span>
                      {f.cantidad && <span>Cant. {f.cantidad}</span>}
                      {f.proveedor && <span>{f.proveedor}</span>}
                      {f.duracion && <span>{f.duracion}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        Pagó
                        <SelectorDePagador
                          fila={f}
                          contrapartes={contrapartes}
                          onElegir={elegirPagador}
                        />
                      </span>
                      {!f.deFactura && <BotonBorrar fila={f} onBorrar={borrar} />}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {open && (
        <ExpenseModal
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ['expenses'] });
          }}
        />
      )}
    </div>
  );
}

/**
 * El badge de tipo de una fila.
 *
 * ⚠️ Los tres controles de abajo (`EtiquetaDeTipo`, `MarcaDeFactura`,
 * `SelectorDePagador`, `BotonBorrar`) existen **una sola vez** y los usan las
 * dos presentaciones. Copiarlos en cada árbol es exactamente cómo se arregla
 * una columna y se olvida la otra — y acá lo que se olvidaría es que la fila de
 * factura va sin tacho y con el pagador apagado.
 */
function EtiquetaDeTipo({ fila }: { fila: FilaGasto }) {
  return (
    <span className="flex items-center gap-2">
      <Badge variant={fila.destacada ? 'brand' : 'outline'}>{fila.etiqueta}</Badge>
      {fila.recurso && <span className="text-muted-foreground">{fila.recurso}</span>}
    </span>
  );
}

/** "De factura": entró por Compras y desde acá no se corrige. */
function MarcaDeFactura() {
  return (
    <Tooltip label="Entró por una factura: se corrige en Compras.">
      <span className="cursor-help align-middle">
        <Badge variant="outline">de factura</Badge>
      </span>
    </Tooltip>
  );
}

/**
 * "¿Quién lo pagó?" — se corrige desde la lista porque los gastos viejos
 * nacieron todos como "Negocio" y la Caja depende de que esto esté bien.
 *
 * ⚠️ Manda un PATCH en cada cambio, y en una fila de factura la API lo rechaza
 * con un 400: ahí va **apagado**.
 */
function SelectorDePagador({
  fila,
  contrapartes,
  onElegir,
}: {
  fila: FilaGasto;
  contrapartes: { id: string; name: string }[];
  onElegir: (id: string, valor: string) => void;
}) {
  return (
    <Select
      className="h-8 w-[9rem] text-xs"
      value={fila.pagadorId}
      aria-label={`Quién pagó: ${fila.descripcion}`}
      disabled={fila.deFactura}
      onChange={(ev) => onElegir(fila.id, ev.target.value)}
    >
      <option value="">Negocio</option>
      {contrapartes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}

/** El tacho. Solo se dibuja en las filas que de verdad se pueden borrar. */
function BotonBorrar({
  fila,
  onBorrar,
}: {
  fila: FilaGasto;
  onBorrar: (id: string) => void;
}) {
  return (
    <Tooltip label="Eliminar gasto">
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Eliminar el gasto: ${fila.descripcion}`}
        onClick={() => onBorrar(fila.id)}
      >
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </Tooltip>
  );
}
