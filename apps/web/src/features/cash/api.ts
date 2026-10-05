import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApplicationOrder,
  BusinessCash,
  CashReconciliationConfirmDto,
  CashReconciliationUpsertDto,
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
