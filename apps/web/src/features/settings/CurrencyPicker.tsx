import { Select } from '@/components/ui';
import { useMoney } from '@/features/settings/useSettings';

/**
 * Selector de moneda de presentación para un documento. La base siempre es USD;
 * esto elige en qué moneda se MUESTRA/cobra (se congela en el documento).
 * `value` = etiqueta de la tasa, o null = "Solo USD".
 */
export function CurrencyPicker({
  value,
  onChange,
  label = 'Moneda del documento',
}: {
  value: string | null;
  onChange: (label: string | null) => void;
  label?: string;
}) {
  const { rates } = useMoney();
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Solo USD</option>
        {rates.map((r) => (
          <option key={r.label} value={r.label}>
            {r.label} ({r.currencyCode})
          </option>
        ))}
      </Select>
    </div>
  );
}
