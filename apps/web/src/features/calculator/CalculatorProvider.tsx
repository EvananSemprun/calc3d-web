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
  /**
   * Con qué se está cotizando el filamento: `'tipo:PLA'`, `'ficha:<id>'` o `''`
   * (precio escrito a mano). ⚠️ Vive FUERA de `filament` a propósito: ese
   * objeto se manda tal cual como `input.filament` al motor y se guarda en el
   * presupuesto, así que un campo de más viajaría en cada `POST /calc`.
   */
  filamentSource: string;
  /** Aplica una opción del selector (o `''` para volver a "a mano"). */
  pickFilament: (key: string, op?: { name: string; rollPrice: number; rollGrams: number }) => void;
  waste: number;
  setWaste: (n: number) => void;

  // 3. Insumos
  supplies: SupplyLine[];
  setSupplies: React.Dispatch<React.SetStateAction<SupplyLine[]>>;

  // 4. Máquina · 5. Luz
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
  const [filamentSource, setFilamentSource] = React.useState('');
  const [waste, setWaste] = React.useState(0.08);
  const [supplies, setSupplies] = React.useState<SupplyLine[]>([]);
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

  /**
   * Elegir en el selector, o volver a "a mano" con `key: ''`.
   *
   * Es UNA función y no dos setters porque el origen y los números tienen que
   * moverse juntos: dejar el origen en "PLA (promedio)" con un precio escrito a
   * mano sería un cartel que miente.
   */
  const pickFilament = React.useCallback(
    (key: string, op?: { name: string; rollPrice: number; rollGrams: number }) => {
      setFilamentSource(key);
      if (op) setFilament((f) => ({ ...f, ...op }));
    },
    [],
  );

  /**
   * ARRANCAR EN EL PROMEDIO DEL TIPO (2026-10-10, decisión del dueño).
   *
   * El primero de la lista es el tipo que más se compra: el servidor los ordena
   * por rollos. ⚠️ Siembra **una sola vez** (`sembrado`) y solo si el dueño no
   * tocó nada: sin ese candado, volver a cargar los catálogos le pisaría el
   * precio que acabó de escribir.
   */
  const sembrado = React.useRef(false);
  const tipos = catalogs.filamentTypes.data;
  React.useEffect(() => {
    if (sembrado.current || !tipos?.length) return;
    if (filamentSource || filament.rollPrice > 0 || filament.name) return;
    sembrado.current = true;
    const t = tipos[0];
    pickFilament(`tipo:${t.type}`, {
      name: `${t.type} (promedio)`,
      rollPrice: t.rollPrice,
      rollGrams: t.rollGrams,
    });
  }, [tipos, filamentSource, filament.rollPrice, filament.name, pickFilament]);

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
      printer,
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
    printer.hours <= 0 && 'tiempo de impresión',
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
    filamentSource,
    pickFilament,
    waste,
    setWaste,
    supplies,
    setSupplies,
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
