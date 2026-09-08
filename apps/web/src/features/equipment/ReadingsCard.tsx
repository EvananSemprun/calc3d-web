import { useEffect, useState } from 'react';
import { Card, CardContent, Input } from '@/components/ui';
import { notify } from '@/components/toast';
import { apiErrorMessage } from '@/lib/api';
import { currentMonthKey } from '@/lib/today';
import {
  type PrinterReadingRow,
  usePrinterReadings,
  useSavePrinterReading,
} from '@/features/equipment/readings';

/**
 * LECTURA DEL MES — el contador de horas de cada máquina.
 *
 * Mismo ritual que el conteo de rollos: una vez por mes se anota lo que MARCA
 * la impresora. Va así y no sumando las horas de cada pedido porque **también
 * se imprime fuera del negocio** —pruebas, calibraciones, regalos, una tanda
 * que salió mal— y todo eso gasta vida útil igual.
 *
 * ⚠️ Vacío es "sin leer", no "cero horas". Sin la lectura anterior tampoco se
 * puede saber cuánto se imprimió en el mes, y eso se dice en vez de rellenarlo.
 */
export function ReadingsCard() {
  const [month, setMonth] = useState(currentMonthKey);
  const { data: filas = [], isLoading } = usePrinterReadings(month);

  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold">Lectura del mes</h2>
            <p className="text-xs text-muted-foreground">
              Anotá las horas que muestra cada máquina. Cuenta todo lo que imprimiste, sea del
              negocio o no.
            </p>
          </div>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-44"
            aria-label="Mes de la lectura"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay impresoras cargadas. Se agregan en Catálogos → Impresoras.
          </p>
        ) : (
          <div className="space-y-3">
            {filas.map((f) => (
              <Fila key={f.printerId} fila={f} month={month} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Fila({ fila, month }: { fila: PrinterReadingRow; month: string }) {
  const [texto, setTexto] = useState(fila.hours?.toString() ?? '');
  const guardar = useSavePrinterReading();

  useEffect(() => {
    setTexto(fila.hours?.toString() ?? '');
  }, [fila.printerId, fila.hours, month]);

  const guardarSiCambio = () => {
    const limpio = texto.trim();
    if (limpio === '' || Number(limpio) === fila.hours) return;
    const hours = Number(limpio);
    if (!Number.isFinite(hours) || hours < 0) return;
    guardar.mutate(
      { printerId: fila.printerId, month, hours },
      {
        onSuccess: () => notify.success(`Lectura de ${fila.name} guardada`),
        onError: (e) => notify.error(apiErrorMessage(e)),
      },
    );
  };

  // Un contador que BAJA respecto del mes anterior casi siempre es un error de
  // tipeo, y arruinaría el consumo del mes sin que nadie lo note.
  const retrocede =
    fila.previous != null && texto.trim() !== '' && Number(texto) < fila.previous.hours;

  return (
    <div className="grid gap-2 border-b border-border/40 pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_10rem_auto] sm:items-center">
      <div>
        <div className="font-medium">{fila.name}</div>
        <div className="text-xs text-muted-foreground">
          {fila.previous
            ? `Mes anterior (${fila.previous.month}): ${fila.previous.hours} h`
            : 'Sin lectura anterior'}
          {fila.lifeUsed != null && ` · ${(fila.lifeUsed * 100).toFixed(1)} % de su vida útil`}
        </div>
      </div>
      <Input
        type="number"
        min="0"
        step="0.1"
        inputMode="decimal"
        placeholder="Sin leer"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardarSiCambio}
        aria-label={`Horas del contador de ${fila.name}`}
      />
      <div className="text-sm tabular-nums text-muted-foreground sm:text-right">
        {fila.hoursThisMonth != null ? (
          <>
            <strong className="text-foreground">{fila.hoursThisMonth} h</strong> este mes
          </>
        ) : (
          'Sin dato del mes'
        )}
      </div>
      {retrocede && (
        <p className="text-xs text-destructive sm:col-span-3">
          Estás anotando menos horas que el mes anterior ({fila.previous!.hours} h). El contador
          solo sube: revisá el número antes de salir del campo.
        </p>
      )}
    </div>
  );
}
