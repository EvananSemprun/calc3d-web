import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PrinterReadingUpsertDto } from '@calc3d/shared';
import { api } from '@/lib/api';

/**
 * LECTURA MENSUAL DEL CONTADOR de cada impresora.
 *
 * Se lleva como el conteo de rollos: una vez por mes se anota lo que MARCA la
 * máquina. `hours` en null significa **sin leer**, que no es lo mismo que cero
 * horas — la pantalla tiene que distinguirlos.
 */
export interface PrinterReadingRow {
  printerId: string;
  name: string;
  lifetimeHours: number;
  /** Horas acumuladas leídas ese mes; null = sin leer. */
  hours: number | null;
  note: string | null;
  /** La última lectura anterior, para saber contra qué se compara. */
  previous: { month: string; hours: number } | null;
  /** Horas impresas en el mes; null si falta alguna de las dos lecturas. */
  hoursThisMonth: number | null;
  lifeUsed: number | null;
}

export function usePrinterReadings(month: string) {
  return useQuery({
    queryKey: ['printer-readings', month],
    queryFn: async () =>
      (await api.get<PrinterReadingRow[]>('/printers/readings', { params: { month } })).data,
  });
}

export function useSavePrinterReading() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: PrinterReadingUpsertDto) => api.put('/printers/readings', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['printer-readings'] });
      qc.invalidateQueries({ queryKey: ['printer-usage'] });
    },
  });
}
