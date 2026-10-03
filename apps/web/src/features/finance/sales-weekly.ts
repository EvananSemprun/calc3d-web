import { diaGuardado } from '@/features/finance/sales-view';

const DIA_MS = 86_400_000;

/** El día `AAAA-MM-DD` corrido `n` días, en UTC (donde viven estas fechas). */
export function masDias(dia: string, n: number): string {
  return new Date(new Date(`${dia}T00:00:00.000Z`).getTime() + n * DIA_MS).toISOString().slice(0, 10);
}

/** El LUNES de la semana del día `AAAA-MM-DD` (UTC; la semana del Excel va lunes→domingo). */
export function lunesDe(dia: string): string {
  const d = new Date(`${dia}T00:00:00.000Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lunes = 0
  return masDias(dia, -dow);
}

/** Un día dentro de una semana del resumen. */
export interface DiaSemana {
  /** `AAAA-MM-DD`. */
  dia: string;
  /** Lo vendido ese día. 0 = no vendió (o está fuera del rango filtrado). */
  monto: number;
  /** Cuántas ventas se registraron ese día. */
  ventas: number;
  /**
   * ¿El día cae dentro del rango de fechas elegido?
   * ⚠️ Importa para no mentir: un día que quedó FUERA del filtro no es un día
   * sin ventas, es un día que no se está mirando.
   */
  enRango: boolean;
}

/** Una semana del resumen: sus 7 días y su total. */
export interface SemanaVentas {
  /** El lunes, `AAAA-MM-DD`: identifica la semana. */
  lunes: string;
  /** El domingo, `AAAA-MM-DD`. */
  domingo: string;
  dias: DiaSemana[];
  total: number;
  /** Cuántos de los 7 días tuvieron al menos una venta. */
  diasConVenta: number;
  /** El día más vendedor de la semana, o null si la semana no vendió nada. */
  mejorDia: string | null;
}

/**
 * Agrupa las ventas por semana (lunes→domingo) y, dentro de cada semana, por
 * día — como la hoja "Ventas" del Excel, que anotaba el día y sumaba la semana.
 *
 * Solo se arman las semanas que **tienen al menos una venta**: inventar las
 * semanas vacías del rango llenaría la pantalla de ceros. Dentro de una semana
 * sí van los 7 días, para que un día sin ventas se vea.
 *
 * ⚠️ Las fechas se leen en **UTC** (`AAAA-MM-DD` tal como se guardó). En zona
 * local todas las ventas se correrían un día para atrás.
 *
 * ⚠️ Esta vista recibe SOLO las ventas de mostrador. El histórico importado es
 * semanal y está todo fechado el lunes: metido acá, cada lunes de febrero a
 * agosto aparecería como el mejor día de su semana por construcción.
 */
export function agruparPorSemana(
  filas: { date: string; amount: number }[],
  rango: { from?: string; to?: string },
): SemanaVentas[] {
  const porDia = new Map<string, { monto: number; ventas: number }>();
  for (const f of filas) {
    const dia = diaGuardado(f.date);
    const acum = porDia.get(dia) ?? { monto: 0, ventas: 0 };
    acum.monto += f.amount;
    acum.ventas += 1;
    porDia.set(dia, acum);
  }

  const lunes = [...new Set([...porDia.keys()].map(lunesDe))].sort().reverse();

  return lunes.map((inicio) => {
    const dias: DiaSemana[] = Array.from({ length: 7 }, (_, i) => {
      const dia = masDias(inicio, i);
      const acum = porDia.get(dia);
      return {
        dia,
        monto: acum?.monto ?? 0,
        ventas: acum?.ventas ?? 0,
        enRango: (!rango.from || dia >= rango.from) && (!rango.to || dia <= rango.to),
      };
    });
    const total = dias.reduce((s, d) => s + d.monto, 0);
    const mejor = dias.reduce<DiaSemana | null>(
      (mejorHasta, d) => (d.monto > 0 && (!mejorHasta || d.monto > mejorHasta.monto) ? d : mejorHasta),
      null,
    );
    return {
      lunes: inicio,
      domingo: masDias(inicio, 6),
      dias,
      total,
      diasConVenta: dias.filter((d) => d.ventas > 0).length,
      mejorDia: mejor?.dia ?? null,
    };
  });
}

/**
 * Promedio por **día con venta** (no por día del calendario).
 *
 * ⚠️ No se puede dividir entre los días del periodo: la base no sabe qué días
 * se trabajó —en el Excel eso se pintaba a mano— y repartir entre 30 días
 * cuando se trabajaron 20 da un número que no significa nada. Lo único que se
 * puede distinguir es "vendió" de "no vendió".
 */
export function promedioPorDiaConVenta(semanas: SemanaVentas[]): { promedio: number; dias: number } {
  const dias = semanas.reduce((s, w) => s + w.diasConVenta, 0);
  const total = semanas.reduce((s, w) => s + w.total, 0);
  return { promedio: dias ? total / dias : 0, dias };
}
