import type { ReactNode } from 'react';
import { usdDesdeMoneda } from '@calc3d/shared';
import { Checkbox, Field, FieldGrid, Input, NumberInput, Select } from '@/components/ui';
import { useExchangeRates } from '@/features/settings/useExchangeRates';

/**
 * FORMULARIO DE PAGO compartido (fase B, tarea 6).
 *
 * Es un COMPONENTE, no una entidad: las tablas de pago (`PurchaseInvoicePayment`,
 * `LoanPayment`, `OwnerMovement`) no se fusionan; cada una tiene su semántica.
 * Hoy lo usa un solo consumidor: el modal «Abonar» de Compras.
 *
 * ⚠️ **LA TASA SE MUESTRA, NO SE MANDA.** El formulario entrega solo
 * `{currencyLabel, amountForeign}`; el servidor resuelve la tasa por el NOMBRE
 * y calcula el USD. Si la tasa viajara, quien tenga el token elegiría cuánto
 * vale lo que pagó. Lo que se dibuja acá (tasa y equivalente) es una
 * ESTIMACIÓN con la tasa de hoy: las tasas AUTO se refrescan solas y al
 * guardar manda la del servidor.
 *
 * ⚠️ **Si algún día se usa para abonos de PEDIDO, hay que DECIDIR cómo maneja
 * la tasa.** Los abonos de pedido sí toman la tasa del cliente a propósito y la
 * semántica es distinta: no se hereda esta en silencio. Por eso acá no existe un
 * modo de «tasa editable»: sin consumidor, sería una variante sin dueño.
 *
 * No hay campo «referencia»: `PurchaseInvoicePayment` no tiene esa columna (la
 * tiene `LoanPayment`) y un campo que se descarta al guardar hace escribir algo
 * que desaparece sin aviso.
 */
export interface ValorDePago {
  date: string;
  /** Monto en USD (editable solo cuando NO hay moneda). */
  amount: number;
  /** `''` = USD. Si no, el NOMBRE de la tasa. */
  currencyLabel: string;
  /** Lo pagado en esa moneda (solo con `currencyLabel`). */
  amountForeign: number;
  /** `''` = la caja del negocio. */
  counterpartyId: string;
  /** `''` = sin decir. */
  accountId: string;
  /** Solo se lee con contraparte. */
  refundable: boolean;
  note: string;
}

export interface OpcionDeContraparte {
  id: string;
  name: string;
  kind: string;
}
export interface OpcionDeCuenta {
  id: string;
  name: string;
  active: boolean;
}

/** ¿Este valor se paga en otra moneda? (nunca con el saldo a favor). */
export const pagaEnMoneda = (v: ValorDePago, soloUsd: boolean) =>
  !soloUsd && v.currencyLabel !== '';

export function FormularioDePago({
  valor,
  onChange,
  contrapartes,
  cuentas,
  hintMonto,
  soloUsd = false,
  ranuraDeOrigen,
}: {
  valor: ValorDePago;
  onChange: (cambio: Partial<ValorDePago>) => void;
  contrapartes: OpcionDeContraparte[];
  cuentas: OpcionDeCuenta[];
  hintMonto?: string;
  /**
   * El pago sale del saldo a favor: no hay moneda, ni quién pagó, ni cuenta.
   * El contrato lo PROHÍBE, así que la pantalla no lo ofrece.
   */
  soloUsd?: boolean;
  /** Lo propio de cada consumidor, justo debajo del monto (p. ej. «¿Con qué lo pagas?»). */
  ranuraDeOrigen?: ReactNode;
}) {
  const { data } = useExchangeRates();
  const tasas = data?.rates ?? [];
  const tasa = tasas.find((r) => r.label === valor.currencyLabel) ?? null;
  // Solo la etiqueta decide el modo (igual que `guardar`): si la tasa desapareció
  // de la lista, el formulario sigue en moneda y sin estimación, no cambia de modo.
  const enMoneda = pagaEnMoneda(valor, soloUsd);

  const usdEstimado = estimarUsd(valor.amountForeign, tasa?.rate);

  return (
    <div className="space-y-3">
      <FieldGrid min="11rem">
        <Field label="Fecha" required>
          <Input type="date" value={valor.date} onChange={(e) => onChange({ date: e.target.value })} />
        </Field>
        {!soloUsd && tasas.length > 0 && (
          <Field label="Moneda">
            <Select
              value={valor.currencyLabel}
              onChange={(e) => onChange({ currencyLabel: e.target.value, amountForeign: 0 })}
            >
              <option value="">Dólares (USD)</option>
              {tasas.map((r) => (
                <option key={r.label} value={r.label}>
                  {r.label} ({r.currencyCode})
                </option>
              ))}
            </Select>
          </Field>
        )}
      </FieldGrid>

      {enMoneda ? (
        <>
          <Field
            label={`Monto pagado (${tasa?.currencyCode ?? valor.currencyLabel})`}
            required
            hint={
              tasa
                ? `Tasa de hoy: ${tasa.rate} ${tasa.currencyCode} por USD (${tasa.label}).`
                : undefined
            }
          >
            <NumberInput
              value={valor.amountForeign}
              onChange={(n) => onChange({ amountForeign: n })}
            />
          </Field>
          <Field
            label="Equivalente en USD"
            hint="Es una estimación con la tasa de hoy. Al guardar se usa la tasa vigente del servidor, que puede haberse actualizado."
          >
            <Input
              readOnly
              value={usdEstimado == null ? '' : String(usdEstimado)}
              placeholder="—"
            />
          </Field>
        </>
      ) : (
        <Field label="Monto (USD)" required hint={hintMonto}>
          {/* La etiqueta de `Field` no está asociada al control (no lleva
              `htmlFor`), así que el nombre accesible lo da el ámbito del campo. */}
          <NumberInput value={valor.amount} onChange={(n) => onChange({ amount: n })} />
        </Field>
      )}

      {ranuraDeOrigen}

      {/* Con el saldo a favor no hay a quién preguntarle: nadie puso plata.
          Mostrar el campo invitaría a mandar un dato que el servidor rechaza. */}
      {!soloUsd && (
        <Field
          label="¿Quién lo pagó?"
          hint="Si lo puso una persona, la Caja lo cuenta como aporte que el negocio le debe."
        >
          <Select
            value={valor.counterpartyId}
            onChange={(e) => onChange({ counterpartyId: e.target.value })}
          >
            <option value="">La caja del negocio</option>
            {contrapartes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind === 'EXTERNAL_LENDER' ? c.name : `${c.name}, de su bolsillo`}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {/* «¿Se te devuelve?» solo significa algo con contraparte: sin ella el
          servidor lo deja siempre en `true`, y preguntarlo es pedir una
          respuesta que no cambia nada. */}
      {!soloUsd && valor.counterpartyId !== '' && (
        <Field label="¿Se te devuelve?">
          <Checkbox
            checked={valor.refundable}
            onChange={(v) => onChange({ refundable: v })}
            label="Sí, el negocio se lo devuelve"
          />
        </Field>
      )}

      {!soloUsd && cuentas.some((c) => c.active) && (
        <Field label="¿De qué cuenta salió?" hint="Opcional. Antes lo anotabas en la nota.">
          <Select
            value={valor.accountId}
            onChange={(e) => onChange({ accountId: e.target.value })}
          >
            <option value="">Sin decir</option>
            {cuentas
              .filter((c) => c.active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
      )}

      <Field label="Nota (opcional)">
        <Input
          value={valor.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="Opcional"
        />
      </Field>
    </div>
  );
}

/** USD estimado de un pago en otra moneda; `null` si falta algo para calcularlo. */
export function estimarUsd(montoEnMoneda: number, tasa: number | undefined): number | null {
  if (tasa == null || !(montoEnMoneda > 0)) return null;
  try {
    return usdDesdeMoneda(montoEnMoneda, tasa);
  } catch {
    // Redondea a cero o la tasa no sirve: no hay estimación que mostrar.
    return null;
  }
}
