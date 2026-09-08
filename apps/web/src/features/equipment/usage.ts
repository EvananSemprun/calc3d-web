import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Medición de la producción: horas, fallos y mantenimiento por máquina. */
export interface PrinterUsage {
  id: string;
  name: string;
  lifetimeHours: number;
  maintPerHour: number;
  /** Pedidos asignados a esta máquina. */
  jobs: number;
  /** Horas del CONTADOR (última lectura). 0 si nunca se leyó. */
  hours: number;
  lastReading: { month: string; hours: number } | null;
  /** Horas impresas en el mes en curso; null si falta alguna lectura. */
  hoursThisMonth: number | null;
  /** Cuántos de esos trabajos tienen los fallos anotados. */
  measuredJobs: number;
  pieces: number;
  reprints: number;
  /** null mientras no haya ningún trabajo medido: no se inventa. */
  failureRate: number | null;
  lifeUsed: number | null;
  maintenance: { spent: number; charged: number; difference: number };
}

export interface UsageResponse {
  printers: PrinterUsage[];
  /** Mes en curso, `AAAA-MM`. */
  month: string;
  total: {
    hours: number;
    /** Máquinas sin ninguna lectura del contador. */
    printersWithoutReading: number;
    measuredJobs: number;
    pieces: number;
    reprints: number;
    failureRate: number | null;
    /** Pedidos sin ninguna medición cargada. */
    unmeasuredJobs: number;
    jobs: number;
  };
}

export function usePrinterUsage() {
  return useQuery({
    queryKey: ['printer-usage'],
    queryFn: async () => (await api.get<UsageResponse>('/printers/usage')).data,
  });
}
