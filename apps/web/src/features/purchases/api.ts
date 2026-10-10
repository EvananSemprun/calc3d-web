import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NuevoTipo,
  PurchaseInvoicePaymentDto,
  PurchaseInvoiceUpsertDto,
  PurchaseReceiveDto,
} from '@calc3d/shared';
import { api } from '@/lib/api';

export interface InvoiceLine {
  id: string;
  materialId: string | null;
  materialName: string | null;
  printerId: string | null;
  printerName: string | null;
  /** Una ficha que todavía no existe: nace al recibir la línea. */
  nombreNuevo: string | null;
  /**
   * ⚠️ **QUÉ ficha nace.** `null` solo en una línea del catálogo. Sin este dato
   * la recepción creaba siempre un filamento, así que encargar una impresora
   * nueva dejaba un rollo llamado "Impresora A2".
   */
  nuevoTipo: NuevoTipo | null;
  quantity: number;
  /** Lo que PEDISTE por unidad. No se reescribe nunca: es el pedido. */
  unitPrice: number;
  received: number;
  porRecibir: number;
  /**
   * CADA ENTREGA, CON EL PRECIO QUE TE COBRARON.
   *
   * ⚠️ Pediste 10 a $7 y te facturaron $7,50: la línea conserva los $7 y cada
   * recepción guarda lo suyo, así que el total de la factura usa el precio REAL
   * de lo que llegó y el PEDIDO de lo que falta. Lo deriva el servidor de los
   * gastos de la línea (una recepción no tiene tabla propia: su registro ES el
   * gasto que nace al recibir).
   */
  recepciones: InvoiceReceipt[];
}

/** Una entrega ya recibida, con lo que de verdad costó la unidad. */
export interface InvoiceReceipt {
  id: string;
  date: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoicePayment {
  id: string;
  date: string;
  amount: number;
  counterpartyId: string | null;
  counterparty: { id: string; name: string } | null;
  accountId: string | null;
  note: string | null;
  /**
   * TOMADO DEL SALDO A FAVOR: de qué factura del mismo proveedor salió.
   *
   * ⚠️ `null` = plata de verdad. Un abono con esto **no movió la caja**: esa
   * plata ya salió cuando se pagó de más, y la pantalla tiene que decirlo o el
   * historial de abonos se lee como si hubieran salido dos veces.
   */
  tomadoDeFacturaId: string | null;
  /** ⚠️ Un abono anulado NO cuenta, pero sigue en la lista. */
  voidedAt: string | null;
  voidReason: string | null;
}

/** Una factura con sus cuentas ya DERIVADAS por el servidor. */
export interface PurchaseInvoice {
  id: string;
  date: string;
  expectedAt: string | null;
  reference: string | null;
  notes: string | null;
  supplier: { id: string; name: string } | null;
  voidedAt: string | null;
  voidReason: string | null;
  source: string;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
  total: number;
  pagado: number;
  saldo: number;
  /** Lo pagado DE MÁS, si lo hay. No se esconde restándolo del saldo. */
  aFavor: number;
  /**
   * El saldo a favor de esta factura que **todavía se puede usar**:
   * `aFavor − lo ya aplicado` a otras facturas del mismo proveedor.
   *
   * ⚠️ `aFavor` es el HECHO (pagaste $15 de más y eso no se borra) y esto es lo
   * que queda. Mostrar solo el primero ofrecería plata que ya se usó.
   */
  aFavorDisponible: number;
  pedido: number;
  recibido: number;
  porRecibir: number;
  /** ⚠️ DOS ejes: una factura puede estar pagada entera y sin recibir. */
  status: {
    pago: 'SIN_PAGAR' | 'PARCIAL' | 'PAGADA' | 'PAGADA_DE_MAS';
    mercaderia: 'SIN_RECIBIR' | 'PARCIAL' | 'RECIBIDA';
  };
}

export function usePurchaseInvoices() {
  return useQuery({
    queryKey: ['purchase-invoices'],
    queryFn: async () => (await api.get<PurchaseInvoice[]>('/purchase-invoices')).data,
  });
}

/**
 * Todo lo que toca una factura invalida lo mismo.
 *
 * ⚠️ **`cash` siempre**: un abono mueve el saldo del negocio. Y al recibir se
 * tocan el inventario y el precio del rollo, así que también el filamento.
 *
 * ⚠️ **`loans` también**, desde que Deuda muestra a los proveedores: un abono
 * cambia su tercer bloque. Sin esto, con esa pantalla ya abierta en otra
 * pestaña el número viejo se queda ahí hasta recargar — y es un número de
 * plata, de los que nadie vuelve a mirar dos veces.
 */
function useInvoiceMutation<T>(fn: (v: T) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of [
        'purchase-invoices',
        'cash',
        'expenses',
        'materials',
        'filament-stock',
        'filament-summary',
        'filament-purchases',
        'loans',
      ]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export const useCreateInvoice = () =>
  useInvoiceMutation((dto: PurchaseInvoiceUpsertDto) => api.post('/purchase-invoices', dto));

export const useUpdateInvoice = () =>
  useInvoiceMutation(({ id, ...dto }: PurchaseInvoiceUpsertDto & { id: string }) =>
    api.put(`/purchase-invoices/${id}`, dto),
  );

/** Anular, **no borrar**: una factura con abonos movió plata de verdad. */
export const useVoidInvoice = () =>
  useInvoiceMutation(({ id, reason }: { id: string; reason: string }) =>
    api.post(`/purchase-invoices/${id}/void`, { reason }),
  );

export const useDeleteInvoice = () =>
  useInvoiceMutation((id: string) => api.delete(`/purchase-invoices/${id}`));

export const useAddInvoicePayment = () =>
  useInvoiceMutation(({ id, ...dto }: PurchaseInvoicePaymentDto & { id: string }) =>
    api.post(`/purchase-invoices/${id}/payments`, dto),
  );

export const useVoidInvoicePayment = () =>
  useInvoiceMutation(({ id, paymentId, reason }: { id: string; paymentId: string; reason: string }) =>
    api.post(`/purchase-invoices/${id}/payments/${paymentId}/void`, { reason }),
  );

/** Recibir: la mercadería entra al inventario y el precio del rollo se mueve. */
export const useReceiveLine = () =>
  useInvoiceMutation(({ id, lineId, ...dto }: PurchaseReceiveDto & { id: string; lineId: string }) =>
    api.post(`/purchase-invoices/${id}/lines/${lineId}/receive`, dto),
  );

/**
 * DESHACER la última recepción: el inverso de `useReceiveLine`.
 *
 * ⚠️ Invalida **lo mismo** que recibir, y por eso comparte `useInvoiceMutation`:
 * si esta mutación limpiara menos claves, la pantalla quedaría mostrando el
 * rollo en el inventario y el gasto en la lista después de borrarlos.
 *
 * ⚠️ **Sin cuerpo**: no hay nada que elegir, se revierte exactamente la
 * recepción que se hizo (su compra y su cantidad).
 */
export const useUnreceiveLine = () =>
  useInvoiceMutation(({ id, lineId }: { id: string; lineId: string }) =>
    api.post(`/purchase-invoices/${id}/lines/${lineId}/unreceive`),
  );

export const ETIQUETA_PAGO = {
  SIN_PAGAR: 'Sin pagar',
  PARCIAL: 'Abonada',
  PAGADA: 'Pagada',
  PAGADA_DE_MAS: 'Pagada de más',
} as const;

/** Qué va a nacer al recibir una línea de "algo que todavía no tenés". */
export const ETIQUETA_NUEVO: Record<NuevoTipo, string> = {
  MATERIAL: 'filamento nuevo',
  PRINTER: 'impresora nueva',
};

export const ETIQUETA_MERCADERIA = {
  SIN_RECIBIR: 'Sin llegar',
  PARCIAL: 'Llegó parte',
  RECIBIDA: 'Llegó todo',
} as const;
