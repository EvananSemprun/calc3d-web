import { useState } from 'react';
import { useSettings } from '@/features/settings/useSettings';
import { useExchangeRates } from '@/features/settings/useExchangeRates';

/**
 * Moneda de presentación de un documento nuevo (pedido/presupuesto), con la
 * regla del **valor seguro** que ya rige para los filtros.
 *
 * Dos fallas que esto evita, las dos dejaban el `<select>` EN BLANCO:
 * 1. `useState(settings?.defaultRateLabel ?? null)` fijaba el valor en el
 *    PRIMER render. Si `settings` todavía no había llegado, el documento nacía
 *    "Solo USD" aunque el negocio tuviera moneda por defecto, y el valor ya no
 *    se recuperaba. Acá la preferencia se DERIVA en cada render, así que no
 *    depende del orden de carga de `settings` y de las tasas.
 * 2. Si la etiqueta guardada en Configuración ya no existe entre las tasas
 *    (se renombró o se borró), no hay opción que la represente: se cae a
 *    "Solo USD" (`null`) en vez de mostrar un selector vacío.
 *
 * `undefined` en el estado = "el usuario todavía no eligió" (distinto de
 * `null`, que es su elección explícita de "Solo USD").
 */
export function useDocumentCurrency() {
  const { data: settings } = useSettings();
  const defaultLabel = settings?.defaultRateLabel ?? null;
  // Misma query (y misma caché) que usa `useMoney`: no agrega una petición.
  const ratesQuery = useExchangeRates({ enabled: !!defaultLabel });
  const [picked, setPicked] = useState<string | null | undefined>(undefined);

  const preferred = picked !== undefined ? picked : defaultLabel;
  const options = ratesQuery.data?.rates ?? [];
  // Mientras no se sepa qué tasas hay, no se puede decidir que la preferida no
  // existe: descartarla ahí perdería la moneda del negocio sin que nadie lo pida.
  const known = !defaultLabel || ratesQuery.isSuccess || ratesQuery.isError;
  const value =
    preferred == null || !known || options.some((r) => r.label === preferred) ? preferred : null;

  return { value: value ?? null, setValue: (label: string | null) => setPicked(label) };
}
