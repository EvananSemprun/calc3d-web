import { Fragment } from 'react';
import type { FilaDeConsumoPorMes } from '@calc3d/shared';
import { Card, CardContent } from '@/components/ui';
import { useMoney } from '@/features/settings/useSettings';
import { useResultadoDeOperacion } from '@/features/finance/api';
import { useConsumoPorMes } from '@/features/filament/api';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** `2026-09` → `Septiembre 2026`. Sin `Date`: el mes ya viene como texto y un huso lo correría. */
function nombreDelMes(mes: string): string {
  const [anio, numero] = mes.split('-');
  return `${MESES[Number(numero) - 1] ?? mes} ${anio}`;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * LA TABLA MES A MES: de dónde sale cada número del filamento.
 *
 * El filamento resta del resultado cuando se CONSUME, no cuando se compra, y el
 * consumo de un mes es `inventario anterior + compras − inventario final (+
 * ajuste)`. Esta tabla pone las cuatro piezas a la vista para que el dueño pueda
 * ver de dónde sale cada número.
 *
 * ⚠️ **El panel no calcula nada**: las filas las arma el servidor
 * (`GET /filament/consumo`, la misma cuenta que usa el Resultado) y lo que
 * «sigue en el estante» es el `filamentoEnEstante` que ya viaja en
 * `/expenses/resultado`. Una cuenta propia acá sería la segunda definición.
 *
 * ⚠️ **El ajuste va en su PROPIA fila, nunca sumado al consumo.** Un rollo que
 * pasa de «sin pesar» a pesado hace APARECER inventario sin que se haya comprado
 * nada; sin esa línea el dueño leería esa subida como una venta. Hoy ningún rollo
 * está pesado y el ajuste es 0 en todos los meses: la fila existe igual y se
 * enciende sola en el primer cierre que pese uno.
 *
 * ⚠️ **El mes abierto no inventa consumo**: dice cuánto se compró y que sigue en
 * el estante. El consumo se conoce al cerrar el mes.
 */
export function ConsumoPorMes() {
  const { money } = useMoney();
  const { data: filas = [] } = useConsumoPorMes();
  // Toda la historia: el mismo dato que el Dashboard dibuja, no una cuenta nueva.
  const { data: resultado } = useResultadoDeOperacion({});

  // Sin nada comprado ni contado no hay tabla que mostrar (todo seguiría en 0).
  const hayAlgo = filas.some((f) => f.compras !== 0 || f.inventarioFinal !== 0 || !f.abierto);
  if (!hayAlgo) return null;

  // El más reciente primero: es el que el dueño viene a mirar.
  const ordenadas = [...filas].sort((a, b) => (a.mes < b.mes ? 1 : -1));

  return (
    <Card>
      <CardContent className="p-0">
        <div className="space-y-1 border-b border-border/70 p-4">
          <h2 className="font-display text-base font-bold">Mes a mes: compras, inventario y consumo</h2>
          <p className="text-xs text-muted-foreground">
            Toda la historia (no depende del rango de arriba). Consumo = lo que había + lo que compraste − lo que queda.
          </p>
          {resultado && (
            <p className="pt-1 text-sm" data-testid="en-el-estante">
              De lo que compraste, <strong className="tabular-nums">{money(resultado.filamentoEnEstante)}</strong> sigue en
              el estante: todavía no es un gasto.
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="p-3 font-semibold">Mes</th>
                <th scope="col" className="p-3 text-right font-semibold">Compras</th>
                <th scope="col" className="p-3 text-right font-semibold">Inventario al cierre</th>
                <th scope="col" className="p-3 text-right font-semibold">Consumo</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((f) => (
                <FilaDelMes key={f.mes} fila={f} money={money} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function FilaDelMes({ fila, money }: { fila: FilaDeConsumoPorMes; money: (n: number) => string }) {
  if (fila.abierto) {
    return (
      <Fragment>
        <tr className="border-b border-border/40" data-testid={`mes-${fila.mes}`}>
          <th scope="row" className="p-3 text-left font-medium">
            {nombreDelMes(fila.mes)} <span className="text-xs font-normal text-muted-foreground">(abierto)</span>
          </th>
          <td className="p-3 text-right tabular-nums">{money(fila.compras)}</td>
          <td className="p-3 text-right text-muted-foreground">—</td>
          <td className="p-3 text-right text-muted-foreground">—</td>
        </tr>
        <tr className="border-b border-border/40 last:border-0" data-testid={`abierto-${fila.mes}`}>
          <td colSpan={4} className="px-3 pb-3 pt-0 text-xs text-muted-foreground">
            {fila.compras !== 0
              ? `Se compraron ${money(fila.compras)} y siguen en el estante.`
              : 'No se compró nada en este tramo.'}{' '}
            El consumo se conoce cuando se cierra el mes.
          </td>
        </tr>
      </Fragment>
    );
  }

  const ajuste = fila.ajuste ?? 0;
  const consumo = fila.consumo ?? 0;

  return (
    <Fragment>
      <tr className="border-b-0" data-testid={`mes-${fila.mes}`}>
        <th scope="row" className="p-3 text-left font-medium">{nombreDelMes(fila.mes)}</th>
        <td className="p-3 text-right tabular-nums">{money(fila.compras)}</td>
        <td className="p-3 text-right tabular-nums">{money(fila.inventarioFinal)}</td>
        <td className={consumo < 0 ? 'p-3 text-right tabular-nums text-destructive' : 'p-3 text-right tabular-nums'}>
          {money(consumo)}
          {consumo < 0 && <span className="block text-[11px]">Conviene revisar el conteo de ese mes</span>}
        </td>
      </tr>
      {/* EL AJUSTE, EN SU PROPIA FILA: nunca va sumado al consumo de arriba. */}
      <tr className="border-b border-border/40 text-xs" data-testid={`ajuste-${fila.mes}`}>
        <td className="px-3 pb-3 pt-0 text-muted-foreground">
          <span className="pl-4">Ajuste por medición</span>
        </td>
        <td className="px-3 pb-3 pt-0" />
        <td className="px-3 pb-3 pt-0 text-right tabular-nums text-muted-foreground">
          {ajuste === 0 ? '—' : `${ajuste > 0 ? '+' : '−'}${money(Math.abs(ajuste))}`}
        </td>
        <td className="px-3 pb-3 pt-0" />
      </tr>
      {ajuste !== 0 && (
        <tr className="border-b border-border/40" data-testid={`ajuste-explicacion-${fila.mes}`}>
          <td colSpan={4} className="px-3 pb-3 pt-0 text-xs text-muted-foreground">
            No es plata nueva: {explicacionDelAjuste(fila, ajuste)}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** Dice CUÁNTOS rollos cambiaron de medición y por qué eso no es una venta ni un consumo. */
function explicacionDelAjuste(fila: FilaDeConsumoPorMes, ajuste: number): string {
  const total = fila.rollosPesados + fila.rollosSinPesar;
  const detalle: string[] = [];
  if (fila.rollosPesados > 0) detalle.push(`${plural(fila.rollosPesados, 'pasó', 'pasaron')} de «sin pesar» a pesado`);
  if (fila.rollosSinPesar > 0) detalle.push(`${plural(fila.rollosSinPesar, 'volvió', 'volvieron')} a «sin pesar»`);
  return (
    `${plural(total, 'rollo cambió', 'rollos cambiaron')} de medición (${detalle.join(' y ')}), ` +
    `y su valor ${ajuste > 0 ? 'aparece en' : 'desaparece de'} el inventario sin que se haya comprado ni gastado nada. ` +
    `No lo leas como ${ajuste > 0 ? 'una venta' : 'un consumo'}.`
  );
}
