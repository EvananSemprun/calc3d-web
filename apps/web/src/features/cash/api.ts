import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApplicationOrder,
  BusinessCash,
  CashAccountUpsertDto,
  CashReconciliationConfirmDto,
  CashReconciliationUpsertDto,
  CounterpartyUpsertDto,
  Obligation,
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
     * `null` si no habría ajuste.
     *
     * ⚠️ No se deduce de `obligations`: esa lista viene sin filtro de fecha y
     * con la contraparte por defecto de la organización, mientras que
     * confirmar filtra hasta la fecha de la conciliación y usa la contraparte
     * de la cuenta. Recalcularlo acá le mostraría al dueño un reparto que no
     * es el que ocurre.
     */
    plan: {
      applications: {
        sourceId: string;
        source: 'EXPENSE' | 'LOAN_PAYMENT' | 'MOVEMENT';
        amount: number;
        date: string;
        category: string | null;
      }[];
      /** Lo que sobra después de cancelar todo: se registra como retiro. */
      leftover: number;
      order: ApplicationOrder;
    } | null;
  }[];
}

export type RecordSource = 'MANUAL' | 'EXCEL_IMPORT' | 'RECONCILIATION' | 'MIGRATION';

export function useCash() {
  return useQuery({
    queryKey: ['cash'],
    queryFn: async () => (await api.get<CashSummary>('/cash')).data,
  });
}

/** Cada escritura devuelve el resumen entero: se guarda directo en la caché. */
function useCashMutation<T>(fn: (v: T) => Promise<{ data: CashSummary }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: ({ data }) => qc.setQueryData(['cash'], data),
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
