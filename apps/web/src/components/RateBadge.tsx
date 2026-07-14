import { Link } from 'react-router-dom';
import { rateAge } from '@/features/settings/useExchangeRates';
import { useMoney } from '@/features/settings/useSettings';

/**
 * Indicador global de la tasa del día: "Bs 667,05 · BCV · hoy".
 * Se pinta de oro cuando la tasa tiene 2+ días (posible tasa vieja).
 * Click lleva a Configuración > Moneda. No se muestra sin moneda secundaria.
 */
export function RateBadge() {
  const { defaultRate } = useMoney();
  if (!defaultRate) return null;

  const age = rateAge(defaultRate.updatedAt);
  const secondaryRate = defaultRate;
  const symbol = secondaryRate.currencyCode === 'VES' ? 'Bs' : secondaryRate.currencyCode;

  return (
    <Link
      to="/settings"
      title="Tasa de cambio — click para actualizarla"
      className={
        'hidden items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs transition-colors sm:flex ' +
        (age.stale
          ? 'border-brand-yellow/60 text-brand-yellow-ink hover:bg-brand-yellow/10'
          : 'border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground')
      }
    >
      <span className="font-semibold">
        {symbol} {secondaryRate.rate.toLocaleString('es-VE')}
      </span>
      <span>· {secondaryRate.source === 'AUTO' ? 'BCV' : 'manual'}</span>
      <span>· {age.label}</span>
    </Link>
  );
}
