import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  facturasAtrasadas,
  saldoAFavorPorProveedor,
  type FacturaAtrasada,
  type NuevoTipo,
  type SaldoAFavorDeProveedor,
  type SuggestedPurchaseLine,
} from '@calc3d/shared';
import { AlertTriangle, FileText, PackageCheck, Plus, Trash2, Undo2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { useMoney } from '@/features/settings/useSettings';
import { todayKey } from '@/lib/today';
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
import { avisoDePrecio, preciosRealesDeLaLinea } from '@/features/purchases/precio-real';

const hoyIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-VE', { timeZone: 'UTC' });

/** "hace 1 día" / "hace 12 días". En días y nada más: sin redondeos a semanas. */
const haceCuanto = (dias: number) => `hace ${dias} ${dias === 1 ? 'día' : 'días'}`;

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
  const [creando, setCreando] = useState<{ propuesta?: SuggestedPurchaseLine[] } | null>(null);

  // "Armar pedido con lo que falta" (Stock del mes) llega acá por el estado de
  // la navegación: la propuesta la calcula `suggestRestockLines` allá y esta
  // pantalla solo abre su diálogo ya cargado.
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const propuesta = (state as { propuesta?: SuggestedPurchaseLine[] } | null)?.propuesta;
  useEffect(() => {
    if (!propuesta?.length) return;
    setCreando({ propuesta });
    // ⚠️ El estado se limpia en el acto: si quedara, recargar la página o
    // volver atrás reabriría el diálogo con una propuesta vieja —de un cierre
    // de stock que ya no es el último— y el dueño cargaría un pedido fantasma.
    navigate(pathname, { replace: true, state: null });
  }, [propuesta, pathname, navigate]);

  const pendientePagar = facturas
    .filter((f) => !f.voidedAt)
    .reduce((s, f) => s + f.saldo, 0);
  const pendienteRecibir = facturas.filter((f) => !f.voidedAt && f.porRecibir > 0).length;

  /**
   * LO QUE NO LLEGÓ. `expectedAt` se guardaba desde el día uno y nadie lo
   * miraba: encargabas algo para el martes, no llegaba, y la pantalla lo
   * mostraba igual que al resto.
   *
   * ⚠️ El "hoy" se calcula ACÁ, en día LOCAL (`todayKey`), y entra como
   * parámetro: el motor es puro y no decide husos. Quién está atrasada y
   * quién no lo decide UNA función, la misma que cuenta el aviso del
   * Dashboard, así que las dos pantallas no pueden decir cosas distintas.
   */
  const atrasadas = useMemo(
    () => new Map(facturasAtrasadas(facturas, todayKey()).map((a) => [a.id, a])),
    [facturas],
  );

  /**
   * EL SALDO A FAVOR DE CADA PROVEEDOR, derivado de **estas mismas facturas**.
   *
   * ⚠️ No hay endpoint nuevo y no tiene que haberlo: cada factura ya viene con
   * su `aFavorDisponible`, y el rollup lo hace la MISMA función pura que usa el
   * servidor. Una consulta aparte sería una segunda cuenta para el mismo
   * número, y el día que una cambie la tarjeta y el modal dirían distinto.
   */
  const saldos = useMemo(() => {
    const porProveedor = new Map<string, SaldoAFavorDeProveedor>();
    for (const g of saldoAFavorPorProveedor(
      facturas.map((f) => ({
        id: f.id,
        supplierId: f.supplier?.id ?? null,
        supplierName: f.supplier?.name ?? null,
        voidedAt: f.voidedAt,
        aFavor: f.aFavor,
        aFavorDisponible: f.aFavorDisponible,
      })),
    )) {
      porProveedor.set(g.supplierId, g);
    }
    return porProveedor;
  }, [facturas]);

  /** Las facturas por id, para poder nombrar la que presta el saldo. */
  const porId = useMemo(() => new Map(facturas.map((f) => [f.id, f])), [facturas]);

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
        <Button variant="accent" className="w-full sm:w-auto" onClick={() => setCreando({})}>
          <Plus className="h-4 w-4" /> Nueva factura
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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
        {/* La tarjeta se pinta SIEMPRE, aunque diga 0: un cero dicho es la
            respuesta a "¿se me atrasó algo?". Si solo apareciera cuando hay
            atrasos, no habría forma de distinguir "nada atrasado" de "esta
            pantalla no lo mira", que es justo el estado del que viene. */}
        <Card className={atrasadas.size > 0 ? 'border-amber-500/50 bg-amber-500/5' : undefined}>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              No llegaron cuando dijeron
            </p>
            <p
              className={cn(
                'font-display text-2xl font-bold tabular-nums',
                atrasadas.size > 0 && 'text-amber-600 dark:text-amber-400',
              )}
            >
              {atrasadas.size}
            </p>
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
            <FacturaCard
              key={f.id}
              factura={f}
              atraso={atrasadas.get(f.id) ?? null}
              saldo={f.supplier ? (saldos.get(f.supplier.id) ?? null) : null}
              facturaPorId={porId}
            />
          ))}
        </ul>
      )}

      {creando && (
        <NuevaFactura propuesta={creando.propuesta} onClose={() => setCreando(null)} />
      )}
    </div>
  );
}

function FacturaCard({
  factura: f,
  atraso,
  saldo,
  facturaPorId,
}: {
  factura: PurchaseInvoice;
  /** `null` si ya llegó, si no se prometió fecha, o si el día no pasó todavía. */
  atraso: FacturaAtrasada | null;
  /**
   * Lo que este proveedor te debe y de qué facturas sale. `null` si la factura
   * no tiene proveedor anotado: sin nombre no hay cómo saber que es la misma
   * persona, así que ese saldo no se puede usar.
   */
  saldo: SaldoAFavorDeProveedor | null;
  /** Para nombrar por su fecha la factura que presta el saldo. */
  facturaPorId: Map<string, PurchaseInvoice>;
}) {
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
      <Card className={cn(anulada && 'opacity-60', atraso && 'border-amber-500/50 bg-amber-500/5')}>
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
                {/* Con la factura atrasada el día lo dice el renglón de abajo, que
                    además dice hace cuánto: repetirlo acá como "llega" es la misma
                    fecha dos veces y en el tiempo verbal equivocado. */}
                {f.expectedAt && !atraso && ` · llega ${fecha(f.expectedAt)}`}
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
                  {atraso && <Badge variant="warning">Atrasada</Badge>}
                </>
              )}
            </div>
          </div>

          {/* ⚠️ Dice HACE CUÁNTO y CUÁNTO falta, no solo que está atrasada: con
              un "revisá esta factura" a secas hay que abrirla para saber si
              son dos días o tres semanas, y un aviso que obliga a investigar se
              deja para después. */}
          {atraso && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
              <AlertTriangle
                aria-hidden
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              />
              <span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  No llegó: la esperabas {haceCuanto(atraso.diasDeAtraso)}.
                </span>{' '}
                <span className="text-muted-foreground">
                  Quedó para el {fecha(atraso.expectedAt)} y faltan {atraso.porRecibir}{' '}
                  {atraso.porRecibir === 1 ? 'unidad' : 'unidades'}. Preguntá al proveedor
                  antes de volver a encargar.
                </span>
              </span>
            </p>
          )}

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
                {/* ⚠️ Lo pagado de más es un HECHO y no se mueve; lo que importa
                    para actuar es cuánto QUEDA. Decir solo el primero ofrece
                    plata que tal vez ya se usó. */}
                {f.aFavorDisponible !== f.aFavor &&
                  ` · quedan ${money(f.aFavorDisponible)} sin usar`}
              </span>
            )}
          </div>

          {/* ⚠️ **CUÁNTO TE DEBE ESTE PROVEEDOR**, de todas sus facturas, y la
              puerta para usarlo. Sin esto el saldo a favor existe en la base y
              no hay desde dónde gastarlo: el dueño tendría que acordarse de que
              una factura vieja quedó pagada de más. */}
          {!anulada && saldo && saldo.disponible > 0 && (
            <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm">
              <strong>{saldo.supplierName} te debe {money(saldo.disponible)}</strong> de facturas
              que pagaste de más.{' '}
              <span className="text-muted-foreground">
                {f.saldo > 0
                  ? 'Podés usarlo al abonar esta factura: en “Abonar”, elegí tomarlo del saldo a favor.'
                  : 'Usalo al abonar otra factura de este proveedor: la plata ya salió, así que no vuelve a mover la caja.'}
              </span>
            </p>
          )}

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
                  {/* ⚠️ EL PRECIO QUE TE COBRARON, cuando no es el que pediste.
                      Cambia el total de la factura: sin decirlo, el número de
                      arriba se mueve y nadie sabe por qué. Las entregas que
                      llegaron a lo pactado no se repiten acá. */}
                  {preciosRealesDeLaLinea(l).map((r) => (
                    <span
                      key={r.unitPrice}
                      className="ml-1.5 whitespace-nowrap text-xs text-brand-yellow-ink"
                      title="El proveedor te cobró otro precio al entregar. El total de la factura usa este."
                    >
                      · te cobraron {r.quantity} × {money(r.unitPrice)}
                    </span>
                  ))}
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

      {abonando && (
        <Abonar
          factura={f}
          saldo={saldo}
          facturaPorId={facturaPorId}
          onClose={() => setAbonando(false)}
        />
      )}
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
          {/* ⚠️ Un abono tomado del saldo NO salió de ninguna cuenta. Decir "la
              caja" ahí sería contar la misma plata dos veces en el renglón que
              se lee para saber de dónde salió. */}
          <Badge variant="outline">
            {p.tomadoDeFacturaId ? 'Del saldo a favor' : (p.counterparty?.name ?? 'La caja')}
          </Badge>
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

function Abonar({
  factura: f,
  saldo,
  facturaPorId,
  onClose,
}: {
  factura: PurchaseInvoice;
  saldo: SaldoAFavorDeProveedor | null;
  facturaPorId: Map<string, PurchaseInvoice>;
  onClose: () => void;
}) {
  const { money } = useMoney();
  const { data: contrapartes = [] } = useCounterparties();
  const abonar = useAddInvoicePayment();
  const [date, setDate] = useState(hoyIso());
  const [amount, setAmount] = useState(f.saldo);
  const [counterpartyId, setCounterpartyId] = useState('');
  const [note, setNote] = useState('');
  /** `''` = con plata. Si no, la factura de la que sale el saldo a favor. */
  const [tomadoDe, setTomadoDe] = useState('');

  /**
   * ⚠️ **Una factura no se paga con su propio saldo a favor**: subiría lo
   * pagado sin que entrara plata, financiado por su propio sobrepago. El
   * servidor lo rechaza igual; sacarlo de la lista evita ofrecer un error.
   */
  const origenes = (saldo?.facturas ?? [])
    .filter((o) => o.id !== f.id)
    .map((o) => ({
      ...o,
      // La factura siempre está en el mapa (el saldo salió de esa misma lista),
      // pero sin fecha el renglón diría "Invalid Date" en vez de fallar fuerte.
      etiqueta: facturaPorId.has(o.id)
        ? `la factura del ${fecha(facturaPorId.get(o.id)!.date)}`
        : 'otra factura',
    }));
  const origen = origenes.find((o) => o.id === tomadoDe) ?? null;
  const conSaldo = origen != null;

  /**
   * Al elegir el saldo, el monto se recorta a lo que de verdad hay: el default
   * es lo que falta de ESTA factura, que puede ser más. Dejarlo en rojo
   * esperando que el dueño lo corrija a mano es ofrecerle un error.
   */
  const elegirOrigen = (id: string) => {
    setTomadoDe(id);
    const elegido = origenes.find((o) => o.id === id);
    if (elegido) setAmount(Math.min(f.saldo > 0 ? f.saldo : elegido.disponible, elegido.disponible));
    else setAmount(f.saldo);
  };

  const guardar = () =>
    abonar.mutate(
      {
        id: f.id,
        date,
        amount,
        // ⚠️ Un abono tomado del saldo no lo paga nadie: mandar contraparte
        // junto con el origen es 400 (el schema lo rechaza), y con razón —la
        // Caja le quedaría debiendo plata que no puso.
        counterpartyId: conSaldo ? null : counterpartyId || null,
        note: note.trim() || null,
        tomadoDeFacturaId: tomadoDe || null,
      },
      {
        onSuccess: () => {
          notify.success(conSaldo ? 'Abonado con el saldo a favor' : 'Abono registrado');
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
          <Field
            label="Monto (USD)"
            required
            hint={
              conSaldo
                ? `Falta ${money(f.saldo)} · hay ${money(origen.disponible)} a favor`
                : `Falta ${money(f.saldo)}`
            }
          >
            <NumberInput value={amount} onChange={setAmount} />
          </Field>
        </FieldGrid>
        {/* ⚠️ **CON QUÉ SE PAGA**, y son dos cosas distintas: plata que sale
            ahora, o el saldo a favor —plata que YA salió cuando se pagó de más—.
            Solo aparece si el proveedor tiene saldo: un desplegable con una sola
            opción es ruido. */}
        {origenes.length > 0 && (
          <Field
            label="¿Con qué lo pagás?"
            hint={`${saldo?.supplierName} te debe ${money(saldo?.disponible ?? 0)}.`}
          >
            <Select value={tomadoDe} onChange={(e) => elegirOrigen(e.target.value)}>
              <option value="">Con plata</option>
              {origenes.map((o) => (
                <option key={o.id} value={o.id}>
                  Del saldo a favor de {o.etiqueta} ({money(o.disponible)})
                </option>
              ))}
            </Select>
          </Field>
        )}
        {/* Con el saldo a favor no hay a quién preguntarle: nadie puso plata.
            Mostrar el campo invitaría a mandar un dato que el servidor rechaza
            —y con razón: la Caja le quedaría debiendo a quien no puso nada. */}
        {!conSaldo && (
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
        )}
        <Field label="Nota (opcional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
        </Field>
        {/* ⚠️ Lo que hay que decir no es "se usa el saldo": es que **la caja no
            se mueve**. Un abono que baja la deuda sin bajar el saldo se lee como
            un error si nadie explica por qué. */}
        {conSaldo && (
          <p className="rounded-lg border border-border/70 bg-muted/30 p-2 text-xs">
            Esto <strong>no mueve la caja</strong>: esa plata ya salió cuando pagaste esa factura de
            más. Baja lo que le debés a {saldo?.supplierName} y baja su saldo a favor.
          </p>
        )}
        {conSaldo && amount > origen.disponible && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs">
            Esa factura tiene {money(origen.disponible)} de saldo a favor y estás usando{' '}
            {money(amount)}. Bajá el monto o abonalo con plata.
          </p>
        )}
        {!conSaldo && amount > f.saldo && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs">
            Estás abonando {money(amount - f.saldo)} más de lo que falta. Se registra igual —la plata
            salió— y queda marcado como pagado de más.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="accent"
            onClick={guardar}
            disabled={
              abonar.isPending || amount <= 0 || (conSaldo && amount > origen.disponible)
            }
          >
            {abonar.isPending ? 'Guardando…' : conSaldo ? 'Usar el saldo' : 'Abonar'}
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
   * EL PRECIO QUE TE COBRARON. Arranca en el que pediste, que es el caso normal.
   *
   * ⚠️ `number | null` y **sin `NumberInput`**: ese mapea el campo vacío a 0, y
   * entonces borrar el precio registraría la entrega **como si te la hubieran
   * regalado** —y 0 es un precio válido de verdad, así que nada lo frenaría—.
   * Vacío significa "no informo nada": no viaja en el cuerpo y el servidor usa
   * el de la línea.
   */
  const [precio, setPrecio] = useState<number | null>(l.unitPrice);
  /** Lo que se va a cobrar de verdad: sin precio informado, el pedido. */
  const precioEfectivo = precio ?? l.unitPrice;
  const aviso = avisoDePrecio(l.unitPrice, precio, quantity);
  /**
   * ⚠️ Los gramos son del ROLLO: solo se preguntan si lo que nace es filamento.
   * Una impresora nace con el precio de la compra y nada más; sus horas de vida
   * y su consumo se corrigen desde el catálogo.
   */
  const fichaNueva = l.materialId == null && l.printerId == null;
  const nacerollo = fichaNueva && l.nuevoTipo === 'MATERIAL';

  const guardar = () =>
    recibir.mutate(
      {
        id: f.id,
        lineId: l.id,
        quantity,
        date,
        // Vacío = no se informa nada y manda el de la línea.
        ...(precio != null ? { unitPrice: precio } : {}),
        ...(nacerollo ? { rollGrams } : {}),
      },
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
          <Field
            label="¿A cuánto te lo cobraron? (USD)"
            hint={`Pediste a ${money(l.unitPrice)} por unidad. Si llegó a ese precio, dejalo así.`}
          >
            {/* ⚠️ Acá NO va `NumberInput`: mapea el campo vacío a 0 y la entrega
                quedaría registrada como regalada. Vacío = no informo nada. */}
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder={String(l.unitPrice)}
              value={precio ?? ''}
              onChange={(e) => {
                const t = e.target.value;
                if (t.trim() === '') return setPrecio(null);
                const n = Number(t);
                if (!Number.isNaN(n)) setPrecio(Math.max(0, n));
              }}
            />
          </Field>
        </FieldGrid>
        {/* ⚠️ EL AVISO. Un precio distinto cambia el TOTAL de la factura, así que
            no puede pasar en silencio: el dueño tiene que poder decidir antes de
            guardar si se equivocó de tecla o si el proveedor le cobró otra cosa. */}
        {aviso && (
          <p className="rounded-lg border border-brand-yellow/50 bg-brand-yellow/10 p-2 text-xs">
            <strong className="text-brand-yellow-ink">
              Te {aviso.masCaro ? 'cobraron más' : 'cobraron menos'} de lo que pediste:{' '}
              {money(Math.abs(aviso.porUnidad))} {aviso.masCaro ? 'más' : 'menos'} por unidad.
            </strong>{' '}
            Esta entrega {aviso.masCaro ? 'suma' : 'resta'} {money(Math.abs(aviso.enEstaEntrega))} al
            total de la factura. La línea sigue pidiendo a {money(l.unitPrice)}: lo que falta llegar
            se cuenta a ese precio.
          </p>
        )}
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
          <strong>{money(quantity * precioEfectivo)}</strong>. La plata ya se contó al abonar: el
          saldo de la Caja no se mueve.
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
  /**
   * `null` = EN BLANCO, y el formulario lo pide antes de dejar guardar.
   *
   * ⚠️ No es lo mismo que 0: una propuesta armada con lo que falta deja en
   * blanco el precio de la ficha que nunca se compró, porque proponer 0 sería
   * cargar la compra como si el rollo fuera gratis.
   */
  unitPrice: number | null;
};

const LINEA_VACIA: Borrador = {
  tipo: 'material',
  id: '',
  nombre: '',
  nuevoTipo: 'MATERIAL',
  quantity: 1,
  unitPrice: 0,
};

/**
 * La propuesta de "armar el pedido con lo que falta" (Stock del mes) traducida
 * a líneas del formulario. La decide `suggestRestockLines` en shared; acá solo
 * se cambia de forma.
 */
const borradoresDePropuesta = (lineas: SuggestedPurchaseLine[]): Borrador[] =>
  lineas.map((l) => ({
    tipo: 'material' as const,
    id: l.materialId,
    nombre: '',
    nuevoTipo: 'MATERIAL' as const,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
  }));

function NuevaFactura({
  onClose,
  propuesta,
}: {
  onClose: () => void;
  /**
   * El pedido armado con lo que falta (Stock del mes). Vacío o ausente = una
   * factura nueva en blanco, como siempre.
   */
  propuesta?: SuggestedPurchaseLine[];
}) {
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
  const [lineas, setLineas] = useState<Borrador[]>(() =>
    propuesta?.length ? borradoresDePropuesta(propuesta) : [{ ...LINEA_VACIA }],
  );
  const esPropuesta = !!propuesta?.length;
  const faltantes = propuesta?.filter((l) => l.status === 'OUT') ?? [];
  const porAcabarse = propuesta?.filter((l) => l.status === 'LOW') ?? [];
  const sinPrecio = lineas.filter((l) => l.unitPrice == null).length;

  const cambiar = (i: number, cambio: Partial<Borrador>) =>
    setLineas((ls) => ls.map((l, n) => (n === i ? { ...l, ...cambio } : l)));

  const total = lineas.reduce((s, l) => s + l.quantity * (l.unitPrice ?? 0), 0);
  const completa = (l: Borrador) =>
    l.quantity > 0 &&
    l.unitPrice != null &&
    l.unitPrice >= 0 &&
    (l.tipo === 'nuevo' ? !!l.nombre.trim() : !!l.id);
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
          // `sePuede` ya exigió que ninguna esté en blanco.
          unitPrice: l.unitPrice ?? 0,
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
      title={esPropuesta ? 'Pedido con lo que falta' : 'Nueva factura de compra'}
      className="max-h-[90vh] overflow-y-auto"
    >
      <div className="space-y-3">
        {esPropuesta && (
          /* ⚠️ Es una PROPUESTA: hasta que no se toque Guardar no se escribe
             nada. Decirlo acá es lo que la vuelve usable sin miedo. */
          <p className="rounded-lg border border-brand-blue/40 bg-brand-blue/5 p-2 text-sm">
            Se armó con el último cierre de stock, a un rollo por color y al último precio que
            pagaste.
            <span className="mt-1 block text-xs text-muted-foreground">
              {faltantes.length > 0 &&
                `Sin rollos: ${faltantes.map((l) => l.label).join(', ')}. `}
              {porAcabarse.length > 0 &&
                `Por acabarse: ${porAcabarse.map((l) => l.label).join(', ')}. `}
              Sacá las líneas que no quieras y cambiá las cantidades: nada se guarda hasta que
              toques Guardar.
            </span>
          </p>
        )}
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
                <Field
                  label="Precio por unidad (USD)"
                  required
                  hint={
                    l.unitPrice == null
                      ? 'No hay compra previa de esta ficha: poné lo que te va a costar.'
                      : undefined
                  }
                >
                  {/* ⚠️ Acá NO va `NumberInput`: ese mapea el campo vacío a 0, y
                      entonces vaciar el precio de una línea propuesta la dejaría
                      en $0 —guardable, y cargada como si el rollo fuera gratis—
                      en vez de volver a pedirlo. Vacío tiene que seguir siendo
                      vacío, que es lo que bloquea el botón Guardar. */}
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="0"
                    value={l.unitPrice ?? ''}
                    onChange={(e) => {
                      const t = e.target.value;
                      if (t.trim() === '') return cambiar(i, { unitPrice: null });
                      const n = Number(t);
                      if (!Number.isNaN(n)) cambiar(i, { unitPrice: Math.max(0, n) });
                    }}
                  />
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
          {sinPrecio > 0 && (
            /* El total de arriba cuenta esas líneas como 0, así que decir por
               qué no cierra es parte del aviso. */
            <span className="block text-xs text-destructive">
              {sinPrecio === 1
                ? 'Falta el precio de una línea: no hay compra previa de esa ficha.'
                : `Faltan los precios de ${sinPrecio} líneas: no hay compras previas de esas fichas.`}
            </span>
          )}
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
