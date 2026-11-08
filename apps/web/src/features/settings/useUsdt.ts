import { DEFAULT_PROTECTION_LABEL, RATE_LABELS, brechaUsdt, enUsdt } from '@calc3d/shared';
import { useMoney, useSettings } from './useSettings';

/**
 * Lectura INTERNA: cuánto entra de verdad por un precio puesto en dólares BCV.
 *
 * Los precios de la tienda están en dólares BCV (lo que paga el cliente), y el dólar BCV
 * vale menos que el USDT, así que la etiqueta no dice cuánto se recibe. Esto lo traduce
 * para el dueño, de su lado del panel.
 *
 * ⚠️ **No cambia nada de lo que se cobra ni de lo que ve el cliente.** La tienda sigue
 * mostrando el precio tal cual.
 *
 * ⚠️ **La tasa BCV se resuelve por su ETIQUETA** (`RATE_LABELS.BCV_USD`), no por una
 * configuración, porque no existe una que diga «los precios están en BCV»: es una
 * convención del negocio. Si alguien renombra esa tasa, el renglón deja de dibujarse —
 * que es lo correcto: mejor no decir nada que decir un número sacado de otra tasa.
 *
 * ⚠️ La de USDT sí sale de `protectionRateLabel`, que el dueño ya configura (es la misma
 * «tasa de referencia» del cobro protegido de la calculadora). Una definición, dos usos.
 */
export function useUsdt() {
  const { data } = useSettings();
  const { rateByLabel } = useMoney();

  const bcv = rateByLabel(RATE_LABELS.BCV_USD)?.rate ?? null;
  const usdt = rateByLabel(data?.protectionRateLabel ?? DEFAULT_PROTECTION_LABEL)?.rate ?? null;

  return {
    /** true si se puede calcular: faltando una tasa no se dibuja nada. */
    listo: bcv != null && usdt != null,
    bcv,
    usdt,
    /** El precio en USDT, o null. */
    enUsdt: (precio: number) => enUsdt(precio, bcv, usdt),
    /** Cuánto menos se recibe, en fracción (0.123 = 12,3 %), o null. */
    brecha: (precio: number) => brechaUsdt(precio, bcv, usdt),
  };
}
