import * as React from 'react';
import type { CalcInput, CalcResult, WasteCategory } from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { useSettings } from '@/features/settings/useSettings';
import { useCatalogData } from '@/features/calculator/useCatalogData';

export interface MatLine {
  name: string;
  rollPrice: number;
  rollGrams: number;
  grams: number; // gramos TOTALES del lote
}
export interface PackLine {
  name: string;
  packagePrice: number;
  unitsPerPackage: number;
  unitsPerPiece: number;
  scope: 'PER_PIECE' | 'PER_ORDER';
  prorationMode: 'USED' | 'FULL_PACKAGE';
}
export interface LaborLine {
  name: string;
  hourlyRate: number;
  hours: number;
  scope: 'PER_PIECE' | 'PER_ORDER';
}
export interface Tier {
  minQty: number;
  marginPct: number;
}

export const num = (v: string) => (v === '' ? 0 : Number(v));

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

interface CalculatorCtx {
  quantity: number;
  setQuantity: (n: number) => void;
  quoteName: string;
  setQuoteName: (s: string) => void;
  clientId: string;
  setClientId: (s: string) => void;

  materials: MatLine[];
  setMaterials: React.Dispatch<React.SetStateAction<MatLine[]>>;
  printerEnabled: boolean;
  setPrinterEnabled: (b: boolean) => void;
  printer: {
    name: string;
    price: number;
    lifetimeHours: number;
    hours: number;
    powerKw: number;
    maintPerHour: number;
  };
  setPrinter: React.Dispatch<React.SetStateAction<CalculatorCtx['printer']>>;
  electricity: { enabled: boolean; kwhPrice: number };
  setElectricity: React.Dispatch<React.SetStateAction<{ enabled: boolean; kwhPrice: number }>>;
  insumos: PackLine[];
  setInsumos: React.Dispatch<React.SetStateAction<PackLine[]>>;
  labor: LaborLine[];
  setLabor: React.Dispatch<React.SetStateAction<LaborLine[]>>;
  waste: { pct: number; appliesTo: WasteCategory[] };
  setWaste: React.Dispatch<React.SetStateAction<{ pct: number; appliesTo: WasteCategory[] }>>;
  /** Porcentajes de ganancia como FRACCIÓN (0.3 = 30 %). */
  profitRates: number[];
  setProfitRates: React.Dispatch<React.SetStateAction<number[]>>;
  /** Ganancia elegida para vender (fracción). null = automático (la del medio). */
  selectedRate: number | null;
  setSelectedRate: (rate: number) => void;
  roundingMode: 'NONE' | 'NEAREST' | 'UP' | 'DOWN';
  setRoundingMode: (m: 'NONE' | 'NEAREST' | 'UP' | 'DOWN') => void;
  roundingIncrement: number;
  setRoundingIncrement: (n: number) => void;
  tiers: Tier[];
  setTiers: React.Dispatch<React.SetStateAction<Tier[]>>;
  proration: 'USED' | 'FULL_PACKAGE';
  /** Piezas que caben en una impresión/tanda. Default 1 (gramos/horas = una pieza).
   *  null = todo el pedido en una sola impresión (comportamiento clásico). */
  piecesPerBatch: number | null;
  setPiecesPerBatch: (n: number | null) => void;
  setupCost: number;
  setSetupCost: (n: number) => void;
  designFee: number;
  setDesignFee: (n: number) => void;
  rushPct: number;
  setRushPct: (n: number) => void;
  minOrderPrice: number;
  setMinOrderPrice: (n: number) => void;

  catalogs: ReturnType<typeof useCatalogData>;
  input: CalcInput;
  result: CalcResult | null;
  calcError: string | null;
}

const Ctx = React.createContext<CalculatorCtx | null>(null);

export function CalculatorProvider({ children }: { children: React.ReactNode }) {
  const { data: settings } = useSettings();
  const catalogs = useCatalogData();

  const [quantity, setQuantity] = React.useState(1);
  const [quoteName, setQuoteName] = React.useState('');
  const [clientId, setClientId] = React.useState('');
  const [materials, setMaterials] = React.useState<MatLine[]>([
    { name: '', rollPrice: 0, rollGrams: 1000, grams: 0 },
  ]);
  const [printerEnabled, setPrinterEnabled] = React.useState(true);
  const [printer, setPrinter] = React.useState({
    name: '',
    price: 0,
    lifetimeHours: 5000,
    hours: 0,
    powerKw: 0,
    maintPerHour: 0,
  });
  const [electricity, setElectricity] = React.useState({ enabled: false, kwhPrice: 0 });
  const [insumos, setInsumos] = React.useState<PackLine[]>([]);
  const [labor, setLabor] = React.useState<LaborLine[]>([]);
  const [waste, setWaste] = React.useState<{ pct: number; appliesTo: WasteCategory[] }>({
    pct: 0.08,
    appliesTo: ['MATERIAL', 'WEAR', 'POWER'],
  });
  const [profitRates, setProfitRates] = React.useState<number[]>([0.3, 0.5, 1.0]);
  const [selectedRate, setSelectedRate] = React.useState<number | null>(null);
  const [roundingMode, setRoundingMode] = React.useState<'NONE' | 'NEAREST' | 'UP' | 'DOWN'>('NONE');
  const [roundingIncrement, setRoundingIncrement] = React.useState(1);
  const [tiers, setTiers] = React.useState<Tier[]>([
    { minQty: 1, marginPct: 1.0 },
    { minQty: 10, marginPct: 0.5 },
    { minQty: 50, marginPct: 0.3 },
  ]);
  const [proration, setProration] = React.useState<'USED' | 'FULL_PACKAGE'>('FULL_PACKAGE');
  // Default: 1 pieza por impresión → los gramos/horas del slicer son de UNA pieza
  // y el motor multiplica por la cantidad. El usuario lo sube si caben más.
  const [piecesPerBatch, setPiecesPerBatch] = React.useState<number | null>(1);
  const [setupCost, setSetupCost] = React.useState(0);
  const [designFee, setDesignFee] = React.useState(0);
  const [rushPct, setRushPct] = React.useState(0);
  const [minOrderPrice, setMinOrderPrice] = React.useState(0);

  // Sembrar defaults desde la configuración del usuario.
  React.useEffect(() => {
    if (!settings) return;
    setElectricity((e) => ({ ...e, kwhPrice: Number(settings.kwhPrice) }));
    setWaste({ pct: settings.defaultWastePct, appliesTo: settings.wasteAppliesTo as WasteCategory[] });
    setProfitRates(settings.defaultMargins);
    setRoundingMode(settings.roundingMode);
    setRoundingIncrement(settings.roundingIncrement);
    setProration(settings.componentProrationMode);
  }, [settings]);

  const input: CalcInput = React.useMemo(
    () => ({
      quantity,
      materials,
      printer: printerEnabled ? printer : undefined,
      electricity,
      components: [],
      packaging: insumos,
      labor,
      waste,
      margins: {
        markups: profitRates.filter((n) => !Number.isNaN(n)),
        mode: 'MARKUP', // siempre "ganancia sobre el costo" (sin jerga financiera)
        rounding: { mode: roundingMode, increment: roundingIncrement || 1 },
      },
      wholesale: { tiers },
      // piecesPerBatch ya viene normalizado a int positivo o null desde el setter;
      // el schema trata undefined como "una sola tanda".
      batch: { piecesPerBatch: piecesPerBatch ?? undefined, setupCost },
      surcharges: { designFee, rushPct, minOrderPrice },
      currency: settings?.currency ?? 'USD',
      locale: settings?.locale ?? 'en-US',
    }),
    [
      quantity,
      materials,
      printerEnabled,
      printer,
      electricity,
      insumos,
      labor,
      waste,
      profitRates,
      roundingMode,
      roundingIncrement,
      tiers,
      piecesPerBatch,
      setupCost,
      designFee,
      rushPct,
      minOrderPrice,
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

  const value: CalculatorCtx = {
    quantity,
    setQuantity,
    quoteName,
    setQuoteName,
    clientId,
    setClientId,
    materials,
    setMaterials,
    printerEnabled,
    setPrinterEnabled,
    printer,
    setPrinter,
    electricity,
    setElectricity,
    insumos,
    setInsumos,
    labor,
    setLabor,
    waste,
    setWaste,
    profitRates,
    setProfitRates,
    selectedRate,
    setSelectedRate,
    roundingMode,
    setRoundingMode,
    roundingIncrement,
    setRoundingIncrement,
    tiers,
    setTiers,
    proration,
    piecesPerBatch,
    setPiecesPerBatch,
    setupCost,
    setSetupCost,
    designFee,
    setDesignFee,
    rushPct,
    setRushPct,
    minOrderPrice,
    setMinOrderPrice,
    catalogs,
    input,
    result,
    calcError,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCalculator() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useCalculator debe usarse dentro de CalculatorProvider');
  return ctx;
}
