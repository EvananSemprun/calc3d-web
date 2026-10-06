import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApplicationOrder,
  BusinessCash,
  CashCategory,
  CashAccountUpsertDto,
  CashReconciliationConfirmDto,
  CashReconciliationUpsertDto,
  CounterpartyUpsertDto,
  Obligation,
  ObligationCategory,
  ObligationSource,
  OwnerFinancingKey,
  OwnerMovementCreateDto,
  ReconciliationKind,
} from '@calc3d/shared';
import { api } from '@/lib/api';

/**
 * CAJA — todo lo que muestra lo DERIVA el servidor. Acá no se recalcula.
 *
 * Una conciliación CONFIRMADA muestra lo que se congeló el día que se
 * confirmó: es un documento, no una vista. `stale` avisa si DESPUÉS entraron
 * movimientos con fecha anterior (el ajuste propio de la conciliación no
 * cuenta: el servidor ya lo descuenta).
 */
export interface CashSummary {
  counterparty: { id: string; name: string; kind: 'OWNER' | 'PARTNER' | 'EXTERNAL_LENDER' };
  accounts: {
    id: string;
    name: string;
    currency: string;
    shared: boolean;
    sharedWithId: string | null;
    autoAttributeShortfall: boolean;
    isDefault: boolean;
  }[];
  applicationOrder: ApplicationOrder;
  balance: BusinessCash;
  financing: {
    rows: { key: OwnerFinancingKey; put: number; recovered: number; missing: number }[];
    owedToOwner: number;
    owedToLender: number;
    totalOwed: number;
    overWithdrawn: number;
  };
  obligations: Obligation[];
  movements: {
    id: string;
    date: string;
    kind: 'CONTRIBUTION' | 'WITHDRAWAL';
    amount: number;
    concept: string;
    note: string | null;
    refundable: boolean;
    source: RecordSource;
    counterpartyId: string;
    /** Cuánto de este pago fue contra deudas. El resto es retiro puro. */
    applied: number;
    cashReconciliationId: string | null;
  }[];
  reconciliations: {
    id: string;
    accountId: string;
    date: string;
    status: 'DRAFT' | 'CONFIRMED' | 'VOID';
    currency: string;
    rate: number | null;
    totalAmount: number;
    personalAmount: number;
    /** Las cuatro líneas de la conciliación. */
    expectedUsd: number;
    totalUsd: number;
    personalUsd: number;
    businessActualUsd: number;
    differenceUsd: number;
    kind: ReconciliationKind;
    expectedNow: number;
    /** Entraron movimientos con fecha anterior DESPUÉS de confirmar. */
    stale: boolean;
    explanation: string | null;
    note: string | null;
    source: RecordSource;
    confirmedAt: string | null;
    voidedAt: string | null;
    adjustment: { id: string; amount: number; concept: string } | null;
    /**
     * El reparto que el servidor VA A HACER si se confirma este borrador, o
     * `null` si no habría ajuste. Es el reparto POR DEFECTO (sin deuda
     * elegida); el de una deuda elegida sale de `useShortfallPlan`.
     */
    plan: ShortfallPlan | null;
  }[];
}

/**
 * El reparto de un faltante: qué deuda cobra cuánto y qué sobra como retiro.
 *
 * ⚠️ Lo calcula el SERVIDOR, siempre. No se deduce de `obligations` del
 * resumen: esa lista viene sin filtro de fecha y con la contraparte por
 * defecto de la organización, mientras que confirmar filtra hasta la fecha de
 * la conciliación y usa la contraparte de la cuenta. Recalcularlo acá le
 * mostraría al dueño un reparto que no es el que ocurre.
 */
export interface ShortfallPlan {
  applications: {
    sourceId: string;
    source: ObligationSource;
    amount: number;
    date: string;
    category: ObligationCategory | null;
  }[];
  /** Lo que sobra después de cancelar todo: se registra como retiro. */
  leftover: number;
  order: ApplicationOrder;
}

/**
 * Apunta a UNA deuda concreta: contra ella va el faltante, antes que el resto.
 *
 * ⚠️ Van los DOS campos. Hoy los ids de las tres tablas no chocan, pero eso es
 * un detalle del generador de ids y no una garantía del contrato: con el
 * origen explícito, un id de gasto no puede hacerse pasar por una cuota.
 */
export interface ObligationTarget {
  source: ObligationSource;
  sourceId: string;
}

/**
 * La previsualización de `GET /cash/reconciliations/:id/plan`: qué pasaría si
 * se confirmara esta conciliación, con o sin una deuda elegida.
 *
 * ⚠️ `obligations` son las deudas ELEGIBLES — las que el servidor derivó para
 * la contraparte de la CUENTA y hasta la fecha del conteo. La lista que la
 * pantalla ofrece para elegir sale de acá y NO de `summary().obligations`: esa
 * otra viene sin filtro de fecha y con la contraparte por defecto de la
 * organización, así que ofrecería deudas que confirmar rechaza con un 400.
 */
export interface ShortfallPlanPreview {
  reconciliationId: string;
  accountId: string;
  /** `AAAA-MM-DD`: el día del conteo, que es hasta dónde filtran las deudas. */
  date: string;
  status: 'DRAFT' | 'CONFIRMED' | 'VOID';
  expectedUsd: number;
  totalUsd: number;
  personalUsd: number;
  businessActualUsd: number;
  differenceUsd: number;
  kind: ReconciliationKind;
  applicationOrder: ApplicationOrder;
  /** Si confirmar HOY registraría el ajuste. Con `false`, `plan` es null. */
  willAttribute: boolean;
  counterpartyId: string | null;
  target: ObligationTarget | null;
  obligations: Obligation[];
  plan: ShortfallPlan | null;
}

export type RecordSource = 'MANUAL' | 'EXCEL_IMPORT' | 'RECONCILIATION' | 'MIGRATION';

/**
 * El detalle de UNA linea de "De donde sale el saldo".
 *
 * `total` lo recalcula el servidor sobre los asientos que devuelve; NO lo copia
 * de la linea del resumen. Si alguna vez no coincidieran, la pantalla tiene que
 * mostrar la diferencia en vez de taparla con un numero prestado.
 */
export type CashBreakdown = {
  category: CashCategory;
  total: number;
  /** Del mas nuevo al mas viejo, como los ordena el servidor. */
  entries: { date: string; amount: number; label: string; source: RecordSource }[];
};

export function useCash() {
  return useQuery({
    queryKey: ['cash'],
    queryFn: async () => (await api.get<CashSummary>('/cash')).data,
  });
}

/**
 * El detalle de una categoria, PEREZOSO: con `category` en null no pide nada.
 *
 * Son nueve categorias y la mas grande tiene mas de cien asientos; traerlas
 * todas al abrir la pantalla seria pagar nueve consultas para mostrar cero.
 */
export function useCashBreakdown(category: CashCategory | null) {
  return useQuery({
    queryKey: ['cash', 'breakdown', category],
    queryFn: async () => (await api.get<CashBreakdown>(`/cash/breakdown/${category}`)).data,
    enabled: category != null,
  });
}

/** La raíz de la caché de la previsualización del reparto. */
const PLAN_KEY = ['cash', 'shortfall-plan'] as const;

/**
 * QUÉ PASARÍA al confirmar: el reparto del faltante y las deudas ELEGIBLES.
 *
 * Es solo lectura, pero CARO: por dentro arma el ledger entero del negocio.
 * Por eso vive en la caché con la deuda elegida dentro de la clave —volver a
 * una ya consultada no vuelve a pedir nada— y con un `staleTime`: sin él,
 * React Query refresca en segundo plano cada vez que la clave cambia a una
 * cacheada, y el ir y venir del selector sería una ráfaga de consultas.
 *
 * Que el dato no se quede viejo NO depende de ese tiempo: toda escritura de
 * Caja invalida esta clave (ver `useCashMutation`). El `staleTime` solo evita
 * repetir la consulta mientras nada cambió.
 *
 * ⚠️ `enabled` existe porque el diálogo está SIEMPRE montado (se abre y cierra
 * con una prop). Sin él, cualquier borrador abierto dispararía esta consulta
 * al entrar a la pantalla, con el diálogo cerrado.
 */
export function useShortfallPlan(
  reconciliationId: string | null,
  target: ObligationTarget | null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...PLAN_KEY, reconciliationId, target?.source ?? null, target?.sourceId ?? null],
    queryFn: async () =>
      (
        await api.get<ShortfallPlanPreview>(`/cash/reconciliations/${reconciliationId}/plan`, {
          // Los dos o ninguno: el servidor rechaza con 400 un destino a medias.
          params: target
            ? { targetSource: target.source, targetSourceId: target.sourceId }
            : undefined,
        })
      ).data,
    enabled: enabled && reconciliationId != null,
    staleTime: 60_000,
  });
}

/**
 * Cada escritura devuelve el resumen entero: se guarda directo en la caché.
 *
 * ⚠️ Y ADEMÁS se invalidan `['cash', 'breakdown']` y la previsualización del
 * reparto. El resumen se pisa a mano (`setQueryData`), así que nada las
 * refresca por su cuenta: sin estas líneas el desplegable abierto seguiría
 * mostrando los asientos viejos, y corregir un borrador dejaría en pantalla el
 * reparto del total anterior —con el MISMO id de conciliación, así que ni
 * siquiera cambia la clave— mientras las cuatro líneas de arriba ya muestran
 * el nuevo. La pantalla de dinero contradiciéndose a sí misma, que es justo lo
 * que esta previsualización existe para evitar.
 */
function useCashMutation<T>(fn: (v: T) => Promise<{ data: CashSummary }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: ({ data }) => {
      qc.setQueryData(['cash'], data);
      qc.invalidateQueries({ queryKey: ['cash', 'breakdown'] });
      qc.invalidateQueries({ queryKey: PLAN_KEY });
    },
  });
}

export const useAddMovement = () =>
  useCashMutation((dto: OwnerMovementCreateDto) => api.post<CashSummary>('/cash/movements', dto));

export const useDeleteMovement = () =>
  useCashMutation((id: string) => api.delete<CashSummary>(`/cash/movements/${id}`));

export const useSaveReconciliation = () =>
  useCashMutation((dto: CashReconciliationUpsertDto) =>
    api.put<CashSummary>('/cash/reconciliations', dto),
  );

export const useConfirmReconciliation = () =>
  useCashMutation(({ id, ...dto }: CashReconciliationConfirmDto & { id: string }) =>
    api.post<CashSummary>(`/cash/reconciliations/${id}/confirm`, dto),
  );

export const useVoidReconciliation = () =>
  useCashMutation((id: string) => api.post<CashSummary>(`/cash/reconciliations/${id}/void`, {}));

export type CounterpartyKind = 'OWNER' | 'PARTNER' | 'EXTERNAL_LENDER';
export type CashAccountKind = 'EXCHANGE' | 'BANK' | 'CASH' | 'WALLET' | 'OTHER';

export interface Counterparty {
  id: string;
  name: string;
  kind: CounterpartyKind;
  isDefault: boolean;
  active: boolean;
  notes: string | null;
}

export interface CashAccountRow {
  id: string;
  name: string;
  kind: CashAccountKind;
  currency: string;
  shared: boolean;
  sharedWithId: string | null;
  autoAttributeShortfall: boolean;
  isDefault: boolean;
  active: boolean;
}

export function useCounterparties() {
  return useQuery({
    queryKey: ['counterparties'],
    queryFn: async () => (await api.get<Counterparty[]>('/counterparties')).data,
  });
}

/**
 * El nombre de la contraparte por defecto, para los textos de Gastos y Deuda.
 *
 * ⚠️ NO usa `useCash()`: ese resumen trae el ledger entero, las obligaciones y
 * todas las conciliaciones. Una pantalla que solo necesita un nombre no tiene
 * por qué arrastrar todo eso en cada carga.
 */
export function useOwnerName() {
  const { data } = useCounterparties();
  return (
    data?.find((c) => c.isDefault && c.kind === 'OWNER')?.name ??
    data?.find((c) => c.kind === 'OWNER')?.name ??
    'el propietario'
  );
}

export function useCashAccounts() {
  return useQuery({
    queryKey: ['cash-accounts'],
    queryFn: async () => (await api.get<CashAccountRow[]>('/cash-accounts')).data,
  });
}

/**
 * Tocar contrapartes o cuentas cambia lo que muestra Caja (el nombre al que se
 * le debe, qué cuenta se concilia), así que se invalida también `['cash']`.
 *
 * Eso alcanza para el desplegable: React Query invalida por PREFIJO, y
 * `['cash', 'breakdown', categoria]` empieza con `['cash']`. Repetirlo acá
 * sería ruido. Lo que no alcanza es un `setQueryData(['cash'], …)`, que no
 * invalida nada — por eso `useCashMutation` sí lo nombra.
 */
function useCatalogMutation<T>(clave: string, fn: (v: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [clave] });
      qc.invalidateQueries({ queryKey: ['cash'] });
    },
  });
}

export const useSaveCounterparty = () =>
  useCatalogMutation('counterparties', ({ id, ...dto }: CounterpartyUpsertDto & { id?: string }) =>
    id ? api.put(`/counterparties/${id}`, dto) : api.post('/counterparties', dto),
  );

export const useDeleteCounterparty = () =>
  useCatalogMutation('counterparties', (id: string) => api.delete(`/counterparties/${id}`));

export const useSetDefaultCounterparty = () =>
  useCatalogMutation('counterparties', (id: string) =>
    api.post(`/counterparties/${id}/default`, {}),
  );

export const useSaveCashAccount = () =>
  useCatalogMutation('cash-accounts', ({ id, ...dto }: CashAccountUpsertDto & { id?: string }) =>
    id ? api.put(`/cash-accounts/${id}`, dto) : api.post('/cash-accounts', dto),
  );

export const useDeleteCashAccount = () =>
  useCatalogMutation('cash-accounts', (id: string) => api.delete(`/cash-accounts/${id}`));

export const useSetDefaultCashAccount = () =>
  useCatalogMutation('cash-accounts', (id: string) => api.post(`/cash-accounts/${id}/default`, {}));
