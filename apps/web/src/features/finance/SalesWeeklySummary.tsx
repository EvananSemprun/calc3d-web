import { useMemo } from 'react';
import { CalendarRange } from 'lucide-react';
import { Card, CardContent, EmptyState, Stat } from '@/components/ui';
import { cn } from '@/lib/utils';
import { agruparPorSemana, promedioPorDiaConVenta } from '@/features/finance/sales-weekly';
import type { DiaSemana, SemanaVentas } from '@/features/finance/sales-weekly';

/** `AAAA-MM-DD` → "lun" (en UTC: así se guardó el día). */
function diaCorto(dia: string): string {
  return new Date(`${dia}T00:00:00.000Z`).toLocaleDateString('es-VE', {
    timeZone: 'UTC',
    weekday: 'short',
  });
}

/**
 * `AAAA-MM-DD` → "30/09" (sin año: el año ya está en el título de la semana).
 *
 * Se arma partiendo la clave, no con `Intl`: con `day`/`month` en `2-digit` y
 * SIN año, `es-VE` igual devuelve "30/9" y las celdas de los días quedaban de
 * anchos distintos (`30/09` vs `1/10`).
 */
function diaMes(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** `AAAA-MM-DD` → "30/09/2026" (misma razón que `diaMes` para no usar `Intl`). */
function diaCompleto(dia: string): string {
  return `${diaMes(dia)}/${dia.slice(0, 4)}`;
}

/**
 * Vista «Resumen semanal»: cuánto se vendió cada día, agrupado por semana, con
 * el total de cada una — la hoja "Ventas" del Excel, pero adaptada a una
 * pantalla angosta (los días se reparten en una grilla que se acomoda, no en
 * una fila horizontal de 7 columnas que obligaría a hacer scroll en el
 * teléfono).
 *
 * Son los MISMOS datos de la vista «Registros»: se agrega en el cliente, sin
 * una segunda consulta que pudiera decir otra cifra.
 */
export function SalesWeeklySummary({
  filas,
  rango,
  money,
  historicoOculto,
}: {
  /** SOLO ventas de mostrador: el histórico semanal no entra (ver nota al pie). */
  filas: { date: string; amount: number }[];
  rango: { from?: string; to?: string };
  money: (n: number) => string;
  /** Cuántas filas del histórico importado quedaron fuera de esta vista. */
  historicoOculto: number;
}) {
  const semanas = useMemo(() => agruparPorSemana(filas, rango), [filas, rango]);
  const { promedio, dias } = useMemo(() => promedioPorDiaConVenta(semanas), [semanas]);
  const total = semanas.reduce((s, w) => s + w.total, 0);
  const mejorSemana = semanas.reduce((max, w) => Math.max(max, w.total), 0);

  if (semanas.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={CalendarRange}
            description="Sin ventas de mostrador en este periodo: no hay semanas que resumir."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total del periodo" value={money(total)} accent="yellow" />
        <Stat label="Semanas con venta" value={String(semanas.length)} />
        <Stat
          label="Promedio por día con venta"
          value={money(promedio)}
          sub={`sobre ${dias} día(s) que vendieron`}
        />
        <Stat label="Mejor semana" value={money(mejorSemana)} />
      </div>

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-brand-yellow" />
          Mejor día de la semana
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full border border-dashed border-border bg-transparent"
          />
          Día sin ventas
        </span>
      </p>

      <div className="space-y-3">
        {semanas.map((semana) => (
          <SemanaCard key={semana.lunes} semana={semana} money={money} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        El reparto por día sale solo de las ventas de mostrador.
        {historicoOculto > 0 && (
          <>
            {' '}
            {historicoOculto} fila(s) del histórico importado quedan fuera: son totales SEMANALES
            del Excel y están todas fechadas el lunes, así que cada lunes aparecería como el mejor
            día de su semana sin que eso haya pasado.
          </>
        )}{' '}
        Qué días no se trabajó no está en la base, así que acá solo se distingue si se vendió o no;
        por eso el promedio se divide entre los días que vendieron.
      </p>
    </div>
  );
}

function SemanaCard({ semana, money }: { semana: SemanaVentas; money: (n: number) => string }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div>
            <h3 className="font-display text-sm font-bold">
              Semana del {diaMes(semana.lunes)} al {diaCompleto(semana.domingo)}
            </h3>
            <p className="text-xs text-muted-foreground">
              {semana.diasConVenta} de 7 día(s) con venta
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total de la semana
            </div>
            <div className="font-display text-lg font-bold tabular text-brand-yellow-ink">
              {money(semana.total)}
            </div>
          </div>
        </div>

        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 6rem), 1fr))' }}
        >
          {semana.dias.map((dia) => (
            <DiaCelda key={dia.dia} dia={dia} mejor={semana.mejorDia === dia.dia} money={money} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DiaCelda({
  dia,
  mejor,
  money,
}: {
  dia: DiaSemana;
  mejor: boolean;
  money: (n: number) => string;
}) {
  const vendio = dia.ventas > 0;
  // Un día fuera del rango elegido NO es un día sin ventas: se marca distinto
  // para no acusar de vacío a un día que simplemente no se está mirando.
  const titulo = !dia.enRango
    ? `${diaCompleto(dia.dia)} — fuera del rango elegido`
    : vendio
      ? `${diaCompleto(dia.dia)} — ${dia.ventas} venta(s)`
      : `${diaCompleto(dia.dia)} — sin ventas`;

  return (
    <div
      title={titulo}
      className={cn(
        'rounded-lg border p-2 text-center',
        !dia.enRango
          ? 'border-dashed border-border/50 bg-transparent opacity-50'
          : mejor
            ? 'border-brand-yellow/50 bg-brand-yellow/[0.08] shadow-glow-sm'
            : vendio
              ? 'border-border bg-muted/30'
              : 'border-dashed border-border/70 bg-transparent',
      )}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="first-letter:uppercase">{diaCorto(dia.dia)}</span> {diaMes(dia.dia)}
      </div>
      <div
        className={cn(
          'mt-0.5 whitespace-nowrap font-display text-sm font-bold tabular',
          mejor && dia.enRango ? 'text-brand-yellow-ink' : vendio ? '' : 'text-muted-foreground',
        )}
      >
        {!dia.enRango ? '·' : vendio ? money(dia.monto) : '—'}
      </div>
      {dia.enRango && vendio && (
        <div className="text-[10px] text-muted-foreground">
          {dia.ventas} venta{dia.ventas === 1 ? '' : 's'}
        </div>
      )}
      {!dia.enRango && <div className="text-[10px] text-muted-foreground">fuera del rango</div>}
    </div>
  );
}
