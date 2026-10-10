import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NuevoTipo } from '@calc3d/shared';
import { FileText, PackageCheck, Plus, Trash2, Undo2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  FieldGrid,
  Input,
  NumberInput,
  Select,
  TableSkeleton,
} from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { api, apiErrorMessage } from '@/lib/api';
import { useMoney } from '@/features/settings/useSettings';
import { useCounterparties } from '@/features/cash/api';
import { useContacts } from '@/features/contacts/api';
import {
  ETIQUETA_MERCADERIA,
  ETIQUETA_NUEVO,
  ETIQUETA_PAGO,
  useAddInvoicePayment,
  useCreateInvoice,
  useDeleteInvoice,
  usePurchaseInvoices,
  useReceiveLine,
  useUnreceiveLine,
  useVoidInvoice,
  useVoidInvoicePayment,
  type InvoiceLine,
  type PurchaseInvoice,
} from '@/features/purchases/api';

const hoyIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { timeZone: 'UTC' });

/** El color del estado: lo que falta plata o mercadería se ve, lo cerrado no grita. */
const tonoPago = (p: PurchaseInvoice['status']['pago']) =>
  p === 'PAGADA' ? 'success' : p === 'PAGADA_DE_MAS' ? 'warning' : 'brand';
const tonoMercaderia = (m: PurchaseInvoice['status']['mercaderia']) =>
  m === 'RECIBIDA' ? 'success' : 'brand';

/**
 * FACTURAS Y ENCARGOS DE COMPRA — filamento e impresoras.
 *
 * ⚠️ **Los abonos son la plata; la recepción es la mercadería.** La pantalla
 * los muestra como DOS estados separados a propósito: una factura puede estar
 * pagada entera y sin llegar, que es lo normal cuando encargás algo.
 */
export function PurchasesPage() {
  const { money } = useMoney();
  const { data: facturas = [], isLoading } = usePurchaseInvoices();
  const [creando, setCreando] = useState(false);

  const pendientePagar = facturas
    .filter((f) => !f.voidedAt)
    .reduce((s, f) => s + f.saldo, 0);
  const pendienteRecibir = facturas.filter((f) => !f.voidedAt && f.porRecibir > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Compras</h1>
            <p className="text-sm text-muted-foreground">
              Lo que pediste, lo que abonaste y lo que falta llegar.
            </p>
          </div>
        </div>
        <Button variant="accent" className="w-full sm:w-auto" onClick={() => setCreando(true)}>
          <Plus className="h-4 w-4" /> Nueva factura
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Falta pagar</p>
            <p className="font-display text-2xl font-bold tabular-nums">{money(pendientePagar)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Facturas esperando mercadería
            </p>
            <p className="font-display text-2xl font-bold tabular-nums">{pendienteRecibir}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : facturas.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Sin facturas de compra"
          description="Cargá un encargo cuando lo pidas: podés abonarlo antes de que llegue, y meterlo al inventario cuando llegue."
        />
      ) : (
        <ul className="space-y-3">
          {facturas.map((f) => (
            <FacturaCard key={f.id} factura={f} />
          ))}
        </ul>
      )}

      {creando && <NuevaFactura onClose={() => setCreando(false)} />}
    </div>
  );
}

function FacturaCard({ factura: f }: { factura: PurchaseInvoice }) {
  const { money } = useMoney();
  const confirm = useConfirm();
  const anular = useVoidInvoice();
  const borrar = useDeleteInvoice();
  const deshacer = useUnreceiveLine();
  const [abonando, setAbonando] = useState(false);
  const [recibiendo, setRecibiendo] = useState<InvoiceLine | null>(null);

  const anulada = f.voidedAt != null;
  const sinHistorial = f.payments.length === 0 && f.recibido === 0;

  const pedirAnular = async () => {
    const ok = await confirm({
      title: '¿Anular esta factura?',
      description: 'Queda en la lista marcada como anulada y sus abonos salen de la Caja.',
      confirmLabel: 'Anular',
      tone: 'destructive',
    });
    if (!ok) return;
    anular.mutate(
      { id: f.id, reason: 'Anulada desde la pantalla' },
      { onSuccess: () => notify.success('Factura anulada'), onError: (e) => notify.error(apiErrorMessage(e)) },
    );
  };

  /**
   * ⚠️ La confirmación dice QUÉ va a pasar, en palabras del dueño: un "¿estás
   * seguro?" pelado no deja decidir. Y aclara las dos cosas que NO pasan —la
   * plata no se mueve y la ficha se queda—, porque las dos son lo que uno
   * teme al apretar.
   */
  const pedirDeshacer = async (l: InvoiceLine) => {
    const queEs = l.materialName ?? l.printerName ?? l.nombreNuevo ?? 'esta línea';
    const ok = await confirm({
      title: `¿Deshacer la recepción de ${queEs}?`,
      description:
        'Lo último que entró de esta línea vuelve atrás: sale del inventario y su compra se borra de Gastos. ' +
        'La plata NO se mueve (lo que salió fueron los abonos de la factura) y la ficha del catálogo se queda, ' +
        'porque puede estar usada en una cotización o un encargo.',
      confirmLabel: 'Deshacer recepción',
      tone: 'destructive',
    });
    if (!ok) return;
    deshacer.mutate(
      { id: f.id, lineId: l.id },
      {
        onSuccess: () => notify.success('Recepción deshecha'),
        onError: (e) => notify.error(apiErrorMessage(e)),
      },
    );
  };

  const pedirBorrar = async () => {
    const ok = await confirm({
      title: '¿Borrar esta factura?',
      description: 'No tiene abonos ni mercadería recibida, así que no deja rastro.',
      confirmLabel: 'Borrar',
      tone: 'destructive',
    });
    if (ok) borrar.mutate(f.id, { onError: (e) => notify.error(apiErrorMessage(e)) });
  };

  return (
    <li>
      <Card className={anulada ? 'opacity-60' : undefined}>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold">
                {f.supplier?.name ?? 'Sin proveedor'}
                {f.reference && (
                  <span className="text-muted-foreground"> · {f.reference}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {fecha(f.date)}
                {f.expectedAt && ` · llega ${fecha(f.expectedAt)}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {anulada ? (
                <Badge variant="outline">Anulada</Badge>
              ) : (
                <>
                  <Badge variant={tonoPago(f.status.pago)}>{ETIQUETA_PAGO[f.status.pago]}</Badge>
                  <Badge variant={tonoMercaderia(f.status.mercaderia)}>
                    {ETIQUETA_MERCADERIA[f.status.mercaderia]}
                  </Badge>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <span>
              Total <strong className="tabular-nums">{money(f.total)}</strong>
            </span>
            <span className="text-muted-foreground">
              Abonado <span className="tabular-nums">{money(f.pagado)}</span>
            </span>
            <span>
              Falta <strong className="tabular-nums text-brand-yellow-ink">{money(f.saldo)}</strong>
            </span>
            {f.aFavor > 0 && (
              <span className="text-destructive">
                Pagaste {money(f.aFavor)} de más
              </span>
            )}
          </div>

          <ul className="space-y-1 rounded-xl border border-border/70 p-2 text-sm">
            {f.lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  {l.materialName ?? l.printerName ?? l.nombreNuevo}
                  {/* ⚠️ Decir QUÉ va a nacer: el nombre no alcanza, y era justo
                      la pregunta que la pantalla no hacía. */}
                  {l.nombreNuevo && l.nuevoTipo && !l.materialName && !l.printerName && (
                    <Badge variant="outline" className="ml-1.5">
                      {ETIQUETA_NUEVO[l.nuevoTipo]}
                    </Badge>
                  )}
                  <span className="text-muted-foreground">
                    {' '}
                    · {l.quantity} × {money(l.unitPrice)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={
                      l.porRecibir > 0 ? 'text-xs text-brand-yellow-ink' : 'text-xs text-muted-foreground'
                    }
                  >
                    {l.porRecibir > 0 ? `faltan ${l.porRecibir}` : 'completa'}
                  </span>
                  {!anulada && l.porRecibir > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setRecibiendo(l)}>
                      <PackageCheck className="h-4 w-4" /> Recibir
                    </Button>
                  )}
                  {/* ⚠️ LA SALIDA. Sin esto, una línea recibida por error no se
                      podía corregir por ninguna puerta: el gasto no se toca
                      desde Gastos y la factura no se puede editar ni anular. */}
                  {!anulada && l.received > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deshacer.isPending}
                      onClick={() => pedirDeshacer(l)}
                    >
                      <Undo2 className="h-4 w-4" /> Deshacer recepción
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          {f.payments.length > 0 && <Abonos factura={f} />}

          {!anulada && (
            <div className="flex flex-wrap justify-end gap-2">
              {sinHistorial ? (
                <Button variant="ghost" size="sm" onClick={pedirBorrar}>
                  <Trash2 className="h-4 w-4" /> Borrar
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={pedirAnular}>
                  Anular
                </Button>
              )}
              <Button variant="accent" size="sm" onClick={() => setAbonando(true)}>
                Abonar
              </Button>
            </div>
          )}
          {anulada && f.voidReason && (
            <p className="text-xs text-muted-foreground">Anulada: {f.voidReason}</p>
          )}
        </CardContent>
      </Card>

      {abonando && <Abonar factura={f} onClose={() => setAbonando(false)} />}
      {recibiendo && (
        <Recibir factura={f} linea={recibiendo} onClose={() => setRecibiendo(null)} />
      )}
    </li>
  );
}

function Abonos({ factura: f }: { factura: PurchaseInvoice }) {
  const { money } = useMoney();
  const confirm = useConfirm();
  const anular = useVoidInvoicePayment();

  const pedirAnular = async (id: string, monto: number) => {
    const ok = await confirm({
      title: `¿Anular el abono de ${money(monto)}?`,
      description: 'Queda tachado en el historial y la plata vuelve a la Caja. No se borra.',
      confirmLabel: 'Anular',
      tone: 'destructive',
    });
    if (ok) {
      anular.mutate(
        { id: f.id, paymentId: id, reason: 'Anulado desde la pantalla' },
        { onError: (e) => notify.error(apiErrorMessage(e)) },
      );
    }
  };

  return (
    <ul className="space-y-1 text-xs">
      {f.payments.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-2">
          <span className={p.voidedAt ? 'tabular-nums line-through opacity-60' : 'tabular-nums'}>
            {money(p.amount)}
          </span>
          <span className="text-muted-foreground">{fecha(p.date)}</span>
          <Badge variant="outline">{p.counterparty?.name ?? 'La caja'}</Badge>
          {p.voidedAt ? (
            <Badge variant="outline">Anulado</Badge>
          ) : (
            <button
              type="button"
              className="text-destructive underline-offset-2 hover:underline"
              onClick={() => pedirAnular(p.id, p.amount)}
            >
              anular
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Abonar({ factura: f, onClose }: { factura: PurchaseInvoice; onClose: () => void }) {
  const { money } = useMoney();
  const { data: contrapartes = [] } = useCounterparties();
  const abonar = useAddInvoicePayment();
  const [date, setDate] = useState(hoyIso());
  const [amount, setAmount] = useState(f.saldo);
  const [counterpartyId, setCounterpartyId] = useState('');
  const [note, setNote] = useState('');

  const guardar = () =>
    abonar.mutate(
      { id: f.id, date, amount, counterpartyId: counterpartyId || null, note: note.trim() || null },
      {
        onSuccess: () => {
          notify.success('Abono registrado');
          onClose();
        },
        onError: (e) => notify.error(apiErrorMessage(e)),
      },
    );

  return (
    <Dialog open onOpenChange={(a) => !a && onClose()} title="Abonar a la factura">
      <div className="space-y-3">
        <FieldGrid>
          <Field label="Fecha" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Monto (USD)" required hint={`Falta ${money(f.saldo)}`}>
            <NumberInput value={amount} onChange={setAmount} />
          </Field>
        </FieldGrid>
        <Field
          label="¿Quién lo pagó?"
          hint="Si lo puso una persona, la Caja lo cuenta como aporte que el negocio le debe."
        >
          <Select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)}>
            <option value="">La caja del negocio</option>
            {contrapartes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind === 'EXTERNAL_LENDER' ? c.name : `${c.name}, de su bolsillo`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nota (opcional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </Field>
        {amount > f.saldo && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs">
            Estás abonando {money(amount - f.saldo)} más de lo que falta. Se registra igual —la plata
            salió— y queda marcado como pagado de más.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={guardar} disabled={abonar.isPending || amount <= 0}>
            {abonar.isPending ? 'Guardando…' : 'Abonar'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Recibir({
  factura: f,
  linea: l,
  onClose,
}: {
  factura: PurchaseInvoice;
  linea: InvoiceLine;
  onClose: () => void;
}) {
  const { money } = useMoney();
  const recibir = useReceiveLine();
  const [quantity, setQuantity] = useState(l.porRecibir);
  const [date, setDate] = useState(hoyIso());
  const [rollGrams, setRollGrams] = useState(1000);
  /**
   * ⚠️ Los gramos son del ROLLO: solo se preguntan si lo que nace es filamento.
   * Una impresora nace con el precio de la compra y nada más; sus horas de vida
   * y su consumo se corrigen desde el catálogo.
   */
  const fichaNueva = l.materialId == null && l.printerId == null;
  const nacerollo = fichaNueva && l.nuevoTipo === 'MATERIAL';

  const guardar = () =>
    recibir.mutate(
      { id: f.id, lineId: l.id, quantity, date, ...(nacerollo ? { rollGrams } : {}) },
      {
        onSuccess: () => {
          notify.success(quantity === l.porRecibir ? 'Llegó completa' : `Entraron ${quantity}`);
          onClose();
        },
        onError: (e) => notify.error(apiErrorMessage(e)),
      },
    );

  return (
    <Dialog open onOpenChange={(a) => !a && onClose()} title="Recibir mercadería">
      <div className="space-y-3">
        <p className="text-sm">
          <strong>{l.materialName ?? l.printerName ?? l.nombreNuevo}</strong>
          {fichaNueva && l.nuevoTipo && (
            <Badge variant="outline" className="ml-1.5">
              {ETIQUETA_NUEVO[l.nuevoTipo]}
            </Badge>
          )}
          <span className="text-muted-foreground">
            {' '}
            · pediste {l.quantity}, ya llegaron {l.received}
          </span>
        </p>
        <FieldGrid>
          <Field label="¿Cuántos llegaron?" required hint={`Faltan ${l.porRecibir}`}>
            <NumberInput
              value={quantity}
              onChange={(n) => setQuantity(Math.max(1, Math.min(Math.floor(n), l.porRecibir)))}
            />
          </Field>
          <Field label="Fecha" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </FieldGrid>
        {nacerollo && (
          <Field
            label="Gramos del rollo"
            hint="La ficha se crea ahora. Marca, tipo y color los corregís después desde Stock del mes."
          >
            <NumberInput value={rollGrams} onChange={(n) => setRollGrams(Math.max(1, Math.floor(n)))} />
          </Field>
        )}
        {fichaNueva && l.nuevoTipo === 'PRINTER' && (
          <p className="rounded-lg border border-border/70 bg-background/30 p-2 text-xs text-muted-foreground">
            La impresora se crea ahora con el precio de la compra. Las horas de vida útil y el
            consumo los corregís después desde Catálogos → Impresoras.
          </p>
        )}
        <p className="rounded-lg border border-border/70 bg-background/30 p-2 text-xs text-muted-foreground">
          Entra al inventario como una compra de{' '}
          <strong>{money(quantity * l.unitPrice)}</strong>. La plata ya se contó al abonar: el saldo de
          la Caja no se mueve.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={guardar} disabled={recibir.isPending || quantity <= 0}>
            {recibir.isPending ? 'Guardando…' : 'Recibir'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

type Borrador = {
  tipo: 'material' | 'printer' | 'nuevo';
  id: string;
  nombre: string;
  /** Solo cuenta con `tipo: 'nuevo'`: qué ficha va a nacer al recibir. */
  nuevoTipo: NuevoTipo;
  quantity: number;
  unitPrice: number;
};

const LINEA_VACIA: Borrador = {
  tipo: 'material',
  id: '',
  nombre: '',
  nuevoTipo: 'MATERIAL',
  quantity: 1,
  unitPrice: 0,
};

function NuevaFactura({ onClose }: { onClose: () => void }) {
  const { money } = useMoney();
  const crear = useCreateInvoice();
  const { data: contactos = [] } = useContacts();
  const proveedores = contactos.filter((c) => c.type === 'SUPPLIER');
  const { data: materiales = [] } = useQuery({
    queryKey: ['materials'],
    queryFn: async () => (await api.get<{ id: string; name: string }[]>('/materials')).data,
  });
  const { data: impresoras = [] } = useQuery({
    queryKey: ['printers'],
    queryFn: async () => (await api.get<{ id: string; name: string }[]>('/printers')).data,
  });

  const [date, setDate] = useState(hoyIso());
  const [expectedAt, setExpectedAt] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [lineas, setLineas] = useState<Borrador[]>([{ ...LINEA_VACIA }]);

  const cambiar = (i: number, cambio: Partial<Borrador>) =>
    setLineas((ls) => ls.map((l, n) => (n === i ? { ...l, ...cambio } : l)));

  const total = lineas.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const completa = (l: Borrador) =>
    l.quantity > 0 && l.unitPrice >= 0 && (l.tipo === 'nuevo' ? !!l.nombre.trim() : !!l.id);
  const sePuede = !!date && lineas.length > 0 && lineas.every(completa);

  const guardar = () =>
    crear.mutate(
      {
        date,
        expectedAt: expectedAt || null,
        supplierId: supplierId || null,
        reference: reference.trim() || null,
        lines: lineas.map((l) => ({
          materialId: l.tipo === 'material' ? l.id : null,
          printerId: l.tipo === 'printer' ? l.id : null,
          nombreNuevo: l.tipo === 'nuevo' ? l.nombre.trim() : null,
          // ⚠️ El contrato lo EXIGE con `nombreNuevo` y lo PROHÍBE sin él.
          nuevoTipo: l.tipo === 'nuevo' ? l.nuevoTipo : null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      },
      {
        onSuccess: () => {
          notify.success('Factura cargada');
          onClose();
        },
        onError: (e) => notify.error(apiErrorMessage(e)),
      },
    );

  return (
    <Dialog
      open
      onOpenChange={(a) => !a && onClose()}
      title="Nueva factura de compra"
      className="max-h-[90vh] overflow-y-auto"
    >
      <div className="space-y-3">
        <FieldGrid>
          <Field label="Fecha de la factura" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="¿Cuándo llega? (opcional)">
            <Input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} />
          </Field>
        </FieldGrid>
        <FieldGrid>
          <Field label="Proveedor (opcional)">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Sin proveedor</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nº de factura (opcional)">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Opcional" />
          </Field>
        </FieldGrid>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Qué pediste</p>
          {lineas.map((l, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-border/70 p-2">
              <FieldGrid>
                <Field label="Qué es">
                  <Select
                    value={l.tipo}
                    onChange={(e) =>
                      cambiar(i, {
                        tipo: e.target.value as Borrador['tipo'],
                        id: '',
                        nombre: '',
                        nuevoTipo: 'MATERIAL',
                      })
                    }
                  >
                    <option value="material">Filamento del catálogo</option>
                    <option value="printer">Impresora del catálogo</option>
                    <option value="nuevo">Algo que todavía no tenés</option>
                  </Select>
                </Field>
                {l.tipo === 'nuevo' ? (
                  /* ⚠️ La pregunta que faltaba. Sin ella la recepción creaba
                     siempre un filamento, y una impresora nueva —que por
                     definición no está en el catálogo— nacía como rollo. */
                  <Field label="¿Filamento o impresora?" required>
                    <Select
                      value={l.nuevoTipo}
                      onChange={(e) => cambiar(i, { nuevoTipo: e.target.value as NuevoTipo })}
                    >
                      <option value="MATERIAL">Un filamento</option>
                      <option value="PRINTER">Una impresora</option>
                    </Select>
                  </Field>
                ) : (
                  <Field label={l.tipo === 'material' ? 'Filamento' : 'Impresora'} required>
                    <Select value={l.id} onChange={(e) => cambiar(i, { id: e.target.value })}>
                      <option value="">Elegir…</option>
                      {(l.tipo === 'material' ? materiales : impresoras).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </FieldGrid>
              {l.tipo === 'nuevo' && (
                <Field
                  label="Nombre"
                  required
                  hint={
                    l.nuevoTipo === 'PRINTER'
                      ? 'La impresora se crea cuando llegue, con el precio de la compra.'
                      : 'La ficha del filamento se crea cuando llegue.'
                  }
                >
                  <Input value={l.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} />
                </Field>
              )}
              <FieldGrid>
                <Field label="Cantidad" required>
                  <NumberInput
                    value={l.quantity}
                    onChange={(n) => cambiar(i, { quantity: Math.max(1, Math.floor(n)) })}
                  />
                </Field>
                <Field label="Precio por unidad (USD)" required>
                  <NumberInput value={l.unitPrice} onChange={(n) => cambiar(i, { unitPrice: Math.max(0, n) })} />
                </Field>
              </FieldGrid>
              {lineas.length > 1 && (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLineas((ls) => ls.filter((_, n) => n !== i))}
                  >
                    <Trash2 className="h-4 w-4" /> Quitar
                  </Button>
                </div>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLineas((ls) => [...ls, { ...LINEA_VACIA }])}>
            <Plus className="h-4 w-4" /> Otra línea
          </Button>
        </div>

        <p className="rounded-lg border border-border/70 bg-background/30 p-2 text-sm">
          Total de la factura: <strong className="tabular-nums">{money(total)}</strong>
          <span className="block text-xs text-muted-foreground">
            Cargarla no mueve la Caja. El saldo baja cuando abonás.
          </span>
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={guardar} disabled={crear.isPending || !sePuede}>
            {crear.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
