import type { ResultadoDeOperacion } from '@calc3d/shared';
import { labelMes } from '@/lib/today';

/** «octubre y noviembre de 2026» / «a, b y c»: lista en español. */
function enEspanol(partes: string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

interface Props {
  resultado: ResultadoDeOperacion;
  money: (n: number) => string;
}

/**
 * LO QUE EL «RESULTADO DE LA OPERACIÓN» NO DICE SOLO.
 *
 * ⚠️ Acá no se calcula nada: todo viene del servidor (`/expenses/resultado`).
 * Cada nota existe porque sin ella el número de arriba se lee mal, y cada una
 * **dice qué quedó afuera** en vez de «hay tramos sueltos»: un aviso que no
 * dice qué no se contó enseña a ignorarlo.
 *
 * - Tramos sueltos: el filamento de esos meses no entra en el número.
 * - Consumo negativo: un conteo mal tipeado FABRICA ganancia. Va en rojo
 *   porque algo ya está mal (ver «Rojo vs ámbar» del CLAUDE.md).
 * - Ajuste por medición: sube el inventario valorado pero no es plata nueva.
 *   Solo se dice cuando no es 0.
 */
export function NotasDelResultado({ resultado, money }: Props) {
  const sinContar = resultado.mesesSinContar.map(labelMes);
  const completos = resultado.mesesCompletos.map(labelMes);
  const hayNegativos = resultado.mesesConConsumoNegativo.length > 0;

  if (!resultado.tramosSueltos && !hayNegativos && resultado.ajustePorMedicion === 0) return null;

  return (
    <div className="space-y-2">
      {hayNegativos && (
        <p role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm">
          {`El conteo de filamento de ${enEspanol(
            resultado.mesesConConsumoNegativo.map((m) => `${labelMes(m.mes)} (consumo de ${money(m.consumo)})`),
          )} da un consumo negativo: casi seguro es un error de tipeo y el resultado de arriba queda inflado. Conviene revisar ese conteo en Stock del mes.`}
        </p>
      )}
      {resultado.tramosSueltos && (
        <p role="note" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {completos.length > 0 ? `Se restó el consumo de filamento de ${enEspanol(completos)}. ` : ''}
          {`El filamento de ${enEspanol(sinContar)} no entra en este número: el consumo se conoce solo por meses con conteo cerrado y enteros dentro del rango, así que lo comprado en ese tramo queda como inventario y no se resta.`}
        </p>
      )}
      {resultado.ajustePorMedicion !== 0 && (
        <p role="note" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {`Del inventario de filamento valorado, ${money(Math.abs(resultado.ajustePorMedicion))} es un rollo que recién se pesó, no plata nueva: no se cuenta como ganancia.`}
        </p>
      )}
    </div>
  );
}
