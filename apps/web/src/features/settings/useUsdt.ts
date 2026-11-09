import {
  D,
  DEFAULT_PROTECTION_LABEL,
  RATE_LABELS,
  brechaUsdt,
  enUsdt,
  precioParaPublicar,
  productStatus,
  roundToIncrement,
} from '@calc3d/shared';
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
    /**
     * El camino INVERSO, para publicar una pieza costeada: de los USDT que calculó la
     * calculadora al precio en dólares BCV que hay que poner en la vitrina, ya redondeado
     * con la regla del negocio.
     *
     * ⚠️ Es la pieza que faltaba: hasta el 2026-11-08 el modal de guardar copiaba el
     * precio en USDT tal cual al campo de la tienda —que se lee como BCV— y publicaba un
     * 12 % más barato de lo costeado.
     *
     * El redondeo sale de Configuración (el dueño usa hacia arriba a 0,50) y se aplica
     * DESPUÉS de convertir: es el precio que el cliente ve el que tiene que quedar
     * redondo, no el de costeo.
     */
    paraPublicar: (precioEnUsdt: number) =>
      precioParaPublicar(precioEnUsdt, bcv, usdt, (v) =>
        roundToIncrement(D(v), data?.roundingMode ?? 'NONE', data?.roundingIncrement || 1).toNumber(),
      ),
    /**
     * El margen de un producto, con el precio YA traducido a USDT.
     *
     * ⚠️ Sale de `productStatus`, el MISMO motor con el que el servidor decide la alerta
     * de rentabilidad. Si el panel hiciera su propia cuenta, la pantalla podría decir que
     * el producto está bien mientras el recosteo lo marca en rojo.
     *
     * El panel solo conoce el costo congelado al publicar, así que `costAtSave` y
     * `costNow` son el mismo número: acá no hay recosteo, eso lo hace el servidor.
     *
     * `null` si no hay costo (ficha cargada a mano). `convertido: false` significa que
     * faltó una tasa y los márgenes son NOMINALES: quien los muestre tiene que decirlo.
     */
    margen: (precio: number, costo: number | null | undefined) => {
      if (costo == null || !(costo > 0)) return null;
      const s = productStatus(precio, costo, costo, 0, bcv && usdt ? { tasaBcv: bcv, tasaUsdt: usdt } : null);
      return {
        /** Markup contra lo que REALMENTE entra. Es el que manda. */
        real: s.markupNow,
        /** El mismo markup contra el precio de etiqueta en BCV. Solo referencia. */
        nominal: s.markupNominal,
        /** El precio publicado, traducido a USDT. */
        precioUsdt: s.priceUsdt,
        convertido: s.converted,
      };
    },
  };
}
