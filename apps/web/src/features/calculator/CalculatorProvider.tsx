import * as React from 'react';
import type { CalcInput, CalcResult, RoundingMode } from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { useSettings } from '@/features/settings/useSettings';
import { useCatalogData } from '@/features/calculator/useCatalogData';

export interface SupplyLine {
  name: string;
  /** cuántas lleva CADA pieza */
  qty: number;
  unitCost: number;
}

export interface Tier {
  minQty: number;
  /** fracción: 0.1 = 10 % de descuento sobre el precio final */
  discountPct: number;
}

export function updateAt<T>(
  setter: React.Dispatch<React.SetStateAction<T[]>>,
  index: number,
  patch: Partial<T>,
) {
  setter((arr) => arr.map((item, i) => (i === index ? { ...item, ...patch } : item)));
}
export function removeAt<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, index: number) {
  setter((arr) => arr.filter((_, i) => i !== index));
}

interface Filament {
  name: string;
  rollPrice: number;
  rollGrams: number;
  /** gramos de UNA tanda, tal como los reporta el laminador */
  grams: number;
}

interface Printer {
  name: string;
  price: number;
  lifetimeHours: number;
  /** horas de UNA tanda */
  hours: number;
  powerKw: number;
  maintPerHour: number;
}

interface CalculatorCtx {
  // 1. La pieza
  quantity: number;
  setQuantity: (n: number) => void;
  piecesPerBatch: number;
  setPiecesPerBatch: (n: number) => void;
  quoteName: string;
  setQuoteName: (s: string) => void;
  clientId: string;
  setClientId: (s: string) => void;

  // 2. Filamento
  filament: Filament;
  setFilament: React.Dispatch<React.SetStateAction<Filament>>;
  waste: number;
  setWaste: (n: number) => void;

  // 3. Insumos
  supplies: SupplyLine[];
  setSupplies: React.Dispatch<React.SetStateAction<SupplyLine[]>>;

  // 4. Máquina y energía
  printerEnabled: boolean;
  setPrinterEnabled: (b: boolean) => void;
  printer: Printer;
  setPrinter: React.Dispatch<React.SetStateAction<Printer>>;
  electricity: { enabled: boolean; kwhPrice: number };
  setElectricity: React.Dispatch<React.SetStateAction<{ enabled: boolean; kwhPrice: number }>>;
  parallelPrinters: number;
  setParallelPrinters: (n: number) => void;

  // 5. Tu tiempo
  labor: { minutes: number; hourlyRate: number };
  setLabor: React.Dispatch<React.SetStateAction<{ minutes: number; hourlyRate: number }>>;

  // 6. Empaque y otros
  extras: { packagingPerPiece: number; otherPerOrder: number };
  setExtras: React.Dispatch<React.SetStateAction<{ packagingPerPiece: number; otherPerOrder: number }>>;

  // 7-8. Precio
  /** margen objetivo como FRACCIÓN (1.0 = 100 %) */
  markup: number;
  setMarkup: (n: number) => void;
  /** piso de margen real bajo el cual la app avisa (fracción) */
  minMarginPct: number;
  setMinMarginPct: (n: number) => void;
  roundingMode: RoundingMode;
  setRoundingMode: (m: RoundingMode) => void;
  roundingIncrement: number;
  setRoundingIncrement: (n: number) => void;
  /** precio por pieza escrito a mano; null = usar el sugerido redondeado */
  manualPrice: number | null;
  setManualPrice: (n: number | null) => void;

  // 11. Mayoreo
  tiers: Tier[];
  setTiers: React.Dispatch<React.SetStateAction<Tier[]>>;

  catalogs: ReturnType<typeof useCatalogData>;
  input: CalcInput;
  result: CalcResult | null;
  calcError: string | null;
  /** Datos mínimos que faltan para que el cálculo signifique algo. */
  missing: string[];
}

const Ctx = React.createContext<CalculatorCtx | null>(null);

export function CalculatorProvider({ children }: { children: React.ReactNode }) {
  const { data: settings } = useSettings();
  const catalogs = useCatalogData();

  const [quantity, setQuantity] = React.useState(1);
  const [piecesPerBatch, setPiecesPerBatch] = React.useState(1);
  const [quoteName, setQuoteName] = React.useState('');
  const [clientId, setClientId] = React.useState('');
  const [filament, setFilament] = React.useState<Filament>({
    name: '',
    rollPrice: 0,
    rollGrams: 1000,
    grams: 0,
  });
  const [waste, setWaste] = React.useState(0.08);
  const [supplies, setSupplies] = React.useState<SupplyLine[]>([]);
  const [printerEnabled, setPrinterEnabled] = React.useState(true);
  const [printer, setPrinter] = React.useState<Printer>({
    name: '',
    price: 0,
    lifetimeHours: 5000,
    hours: 0,
    powerKw: 0,
    maintPerHour: 0,
  });
  const [electricity, setElectricity] = React.useState({ enabled: false, kwhPrice: 0 });
  const [parallelPrinters, setParallelPrinters] = React.useState(1);
  const [labor, setLabor] = React.useState({ minutes: 0, hourlyRate: 0 });
  const [extras, setExtras] = React.useState({ packagingPerPiece: 0, otherPerOrder: 0 });
  const [markup, setMarkup] = React.useState(1);
  const [minMarginPct, setMinMarginPct] = React.useState(0.6);
  const [roundingMode, setRoundingMode] = React.useState<RoundingMode>('NONE');
  const [roundingIncrement, setRoundingIncrement] = React.useState(1);
  const [manualPrice, setManualPrice] = React.useState<number | null>(null);
  const [tiers, setTiers] = React.useState<Tier[]>([]);

  // Sembrar defaults desde la configuración del negocio.
  React.useEffect(() => {
    if (!settings) return;
    setElectricity((e) => ({ ...e, kwhPrice: Number(settings.kwhPrice) }));
    setWaste(settings.defaultWastePct);
    setMarkup(settings.defaultMarkup);
    setMinMarginPct(settings.minMarginPct);
    setRoundingMode(settings.roundingMode);
    setRoundingIncrement(settings.roundingIncrement);
  }, [settings]);

  const input: CalcInput = React.useMemo(
    () => ({
      quantity,
      piecesPerBatch,
      filament,
      waste: { pct: waste },
      supplies,
      printer: printerEnabled ? printer : undefined,
      electricity,
      parallelPrinters,
      labor,
      extras,
      margins: {
        markup,
        minMarginPct,
        rounding: { mode: roundingMode, increment: roundingIncrement || 1 },
      },
      manualPrice,
      wholesale: { tiers },
      currency: settings?.currency ?? 'USD',
      locale: settings?.locale ?? 'en-US',
    }),
    [
      quantity,
      piecesPerBatch,
      filament,
      waste,
      supplies,
      printerEnabled,
      printer,
      electricity,
      parallelPrinters,
      labor,
      extras,
      markup,
      minMarginPct,
      roundingMode,
      roundingIncrement,
      manualPrice,
      tiers,
      settings,
    ],
  );

  const [result, setResult] = React.useState<CalcResult | null>(null);
  const [calcError, setCalcError] = React.useState<string | null>(null);
  const inputKey = JSON.stringify(input);

  React.useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await api.post<CalcResult>('/calc', input);
        setResult(res.data);
        setCalcError(null);
      } catch (e) {
        setCalcError(apiErrorMessage(e));
      }
    }, 300);
    return () => clearTimeout(t);
  }, [inputKey]); // eslint-disable-line

  const missing = [
    quantity < 1 && 'cantidad de piezas',
    filament.grams <= 0 && 'gramos de la tanda',
    filament.rollPrice <= 0 && 'precio del rollo',
    printerEnabled && printer.hours <= 0 && 'tiempo de impresión',
  ].filter(Boolean) as string[];

  const value: CalculatorCtx = {
    quantity,
    setQuantity,
    piecesPerBatch,
    setPiecesPerBatch,
    quoteName,
    setQuoteName,
    clientId,
    setClientId,
    filament,
    setFilament,
    waste,
    setWaste,
    supplies,
    setSupplies,
    printerEnabled,
    setPrinterEnabled,
    printer,
    setPrinter,
    electricity,
    setElectricity,
    parallelPrinters,
    setParallelPrinters,
    labor,
    setLabor,
    extras,
    setExtras,
    markup,
    setMarkup,
    minMarginPct,
    setMinMarginPct,
    roundingMode,
    setRoundingMode,
    roundingIncrement,
    setRoundingIncrement,
    manualPrice,
    setManualPrice,
    tiers,
    setTiers,
    catalogs,
    input,
    result,
    calcError,
    missing,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCalculator() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useCalculator debe usarse dentro de CalculatorProvider');
  return ctx;
}
