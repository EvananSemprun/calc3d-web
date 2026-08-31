import { useQuery } from '@tanstack/react-query';
import { formatMoney, formatPercent } from '@calc3d/shared';
import { api } from '@/lib/api';
import { useExchangeRates } from './useExchangeRates';

export interface Settings {
  currency: string;
  locale: string;
  secondaryCurrency: string | null;
  kwhPrice: string;
  defaultWastePct: number;
  wasteAppliesTo: string[];
  defaultMargins: number[];
  marginMode: 'MARKUP' | 'MARGIN';
  componentProrationMode: 'USED' | 'FULL_PACKAGE';
  roundingMode: 'NONE' | 'NEAREST' | 'UP' | 'DOWN';
  roundingIncrement: number;
  taxPercent: number | null;
  fixedCosts: { concept: string; monthlyAmount: number }[];
  breakEvenMarginPct: number;
  productAlertMinMarginPct: number;
  defaultRateLabel: string | null;
  protectionRateLabel: string | null;
  /** Nombre del negocio (vive en la organización; es el emisor de los documentos). */
  businessName: string;
  businessRif: string | null;
  businessPhone: string | null;
  businessAddress: string | null;
  businessSigner: string | null;
  /** El backend nunca manda los bytes del logo en este payload, solo si existe. */
  hasLogo: boolean;
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<Settings>('/settings')).data,
  });
}

/** Locale de presentación para monedas secundarias (Bs, etc.). */
const SECONDARY_LOCALE = 'es-VE';

/** Devuelve funciones de formateo con la moneda/locale del usuario (multi-moneda). */
export function useMoney() {
  const { data } = useSettings();
  const defaultLabel = data?.defaultRateLabel ?? null;
  // Se consultan las tasas si hay una por defecto (vista ambiental) — cacheado.
  const { data: ratesData } = useExchangeRates({ enabled: !!defaultLabel });
  const rates = ratesData?.rates ?? [];
  const currency = data?.currency ?? 'USD';
  const locale = data?.locale ?? 'en-US';
  const defaultRate = defaultLabel ? (rates.find((r) => r.label === defaultLabel) ?? null) : null;

  return {
    currency,
    locale,
    rates,
    money: (n: number) => formatMoney(n, currency, locale),
    percent: (f: number, digits = 1) => formatPercent(f, locale, digits),
    /** Monto en la moneda por defecto a tasa VIGENTE, o null si no hay tasa. */
    moneyAlt: defaultRate
      ? (n: number) => formatMoney(n * defaultRate.rate, defaultRate.currencyCode, SECONDARY_LOCALE)
      : null,
    /** Formatea un monto USD en una tasa cualquiera (para el selector en vivo). */
    moneyInRate: (n: number, rate: number, code: string) =>
      formatMoney(n * rate, code, SECONDARY_LOCALE),
    /** Para documentos históricos: formatea con una tasa CONGELADA. */
    moneyAtRate: (n: number, rate: number, code = 'VES') =>
      formatMoney(n * rate, code, SECONDARY_LOCALE),
    rateByLabel: (label?: string | null) =>
      label ? (rates.find((r) => r.label === label) ?? null) : null,
    defaultRate,
  };
}
