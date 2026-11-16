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
 * nada; sin esa línea el dueño leería esa subida como una venta. La fila SOLO se
 * dibuja cuando el ajuste no es 0 (una fila que casi siempre dice «—» se aprende a
 * saltear, y el día que aparezca un número no se vería); el concepto se nombra
 * una vez en el encabezado de la tarjeta para que se sepa que la app lo vigila.
 * Hoy ningún rollo está pesado: se enciende sola en el primer cierre que pese uno.
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
            Toda la historia (no depende del rango de arriba). Consumo = lo que había + lo que compraste − lo que queda
            + el ajuste por medición, si lo hay.
          </p>
          <p className="text-xs text-muted-foreground">
            Cuando un rollo pasa de «sin pesar» a pesado (o al revés), su valor aparece o desaparece del inventario sin que se
            haya comprado ni gastado nada: eso se muestra aparte, en una fila de «Ajuste por medición» bajo el mes.
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

  // ⚠️ Se decide por el DATO, no por el flag: una fila cerrada que llegara con
  // `null` no puede dibujarse como $0.00 («no se consumió nada»), que afirma algo.
  const { consumo, ajuste } = fila;
  const hayAjuste = ajuste !== null && ajuste !== 0;

  return (
    <Fragment>
      <tr className={hayAjuste ? undefined : "border-b border-border/40"} data-testid={`mes-${fila.mes}`}>
        <th scope="row" className="p-3 text-left font-medium">{nombreDelMes(fila.mes)}</th>
        <td className="p-3 text-right tabular-nums">{money(fila.compras)}</td>
        <td className="p-3 text-right tabular-nums">{money(fila.inventarioFinal)}</td>
        {consumo === null ? (
          <td className="p-3 text-right text-muted-foreground">—</td>
        ) : (
          <td className={consumo < 0 ? 'p-3 text-right tabular-nums text-destructive' : 'p-3 text-right tabular-nums'}>
            {money(consumo)}
            {consumo < 0 && <span className="block text-[11px]">Conviene revisar el conteo de ese mes</span>}
          </td>
        )}
      </tr>
      {/* EL AJUSTE, EN SU PROPIA FILA y bajo la columna que modifica (Consumo): nunca sumado al número de arriba. */}
      {hayAjuste && (
        <>
          <tr className="text-xs" data-testid={`ajuste-${fila.mes}`}>
            <td className="px-3 pb-1 pt-0 text-muted-foreground">
              <span className="pl-4">Ajuste por medición</span>
            </td>
            <td className="px-3 pb-1 pt-0" />
            <td className="px-3 pb-1 pt-0" />
            <td className="px-3 pb-1 pt-0 text-right tabular-nums text-muted-foreground">
              {`${ajuste > 0 ? '+' : '−'}${money(Math.abs(ajuste))}`}
            </td>
          </tr>
          <tr className="border-b border-border/40" data-testid={`ajuste-explicacion-${fila.mes}`}>
            <td colSpan={4} className="px-3 pb-3 pt-0 text-xs text-muted-foreground">
              No es plata nueva: {explicacionDelAjuste(fila, ajuste)}
            </td>
          </tr>
        </>
      )}
    </Fragment>
  );
}

/**
 * QUÉ PASÓ CON LOS ROLLOS DE ESTE MES, en los términos del motor nuevo.
 *
 * ⚠️ **Las frases viejas decían lo que NO pasó**, y con el motor del crédito
 * (shared 0.101.0) además cambiaron de significado: «volvieron a «sin pesar»»
 * contaba rollos que **se terminaron**, «pasaron de «sin pesar» a pesado»
 * contaba rollos **recién abiertos de un sellado** (que hoy ni generan ajuste), y
 * «sin que se haya comprado ni gastado nada… no lo leas como un consumo»
 * afirmaba, de un rollo que SÍ se consumió, exactamente lo contrario.
 *
 * Lo que el ajuste dice de verdad, y es lo que se escribe acá:
 * - **positivo** (`rollosConCreditoNuevo`): se pesó por primera vez un rollo que
 *   estaba sin pesar. Su valor vuelve al inventario, pero ya se había contado
 *   como consumo, así que no baja el consumo de este mes.
 * - **negativo** (`rollosConCreditoLiberado`): rollos que gastaron parte de lo
 *   que se les había reservado — se consumieron, se terminaron o quedaron sin
 *   pesar. Esa caída del inventario ya se había contado como consumo antes.
 */
function explicacionDelAjuste(fila: FilaDeConsumoPorMes, ajuste: number): string {
  const nuevos = fila.rollosConCreditoNuevo;
  const liberados = fila.rollosConCreditoLiberado;
  const partes: string[] = [];
  if (nuevos > 0) {
    partes.push(
      `${plural(nuevos, 'rollo que estaba sin pesar se pesó', 'rollos que estaban sin pesar se pesaron')} por primera vez`,
    );
  }
  if (liberados > 0) {
    // ⚠️ El paréntesis va DENTRO del plural: con un texto fijo, «1 rollo … gastó» se
    // cerraba con «(se consumieron, se terminaron…)» y la frase no concordaba.
    partes.push(
      plural(
        liberados,
        'rollo ya pesado gastó parte de su valor (se consumió, se terminó o quedó sin pesar)',
        'rollos ya pesados gastaron parte de su valor (se consumieron, se terminaron o quedaron sin pesar)',
      ),
    );
  }
  const cierre =
    ajuste > 0
      ? 'ese valor ya se había contado como consumo cuando el rollo estaba sin pesar, así que vuelve al inventario y no baja el consumo de este mes. No lo leas como una venta.'
      : 'ese valor ya se había contado como consumo antes, así que la baja del inventario no es un consumo nuevo. No lo cuentes dos veces.';
  // Sin contadores (no debería pasar con un ajuste ≠ 0) se dice solo lo cierto.
  return partes.length > 0 ? `${partes.join(' y ')}; ${cierre}` : cierre;
}
