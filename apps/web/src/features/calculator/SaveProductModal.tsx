import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { tramosParaLaTienda } from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { Button, Field, Input, NumberInput } from '@/components/ui';
import { Dialog } from '@/components/overlays';
import { notify } from '@/components/toast';
import { useCalculator } from '@/features/calculator/CalculatorProvider';
import { useMoney } from '@/features/settings/useSettings';
import { useUsdt } from '@/features/settings/useUsdt';

/**
 * Guarda el cálculo actual como **ficha de la tienda**, que desde 2026-09-07 es
 * el catálogo único: el producto interno y lo que ve el cliente son la misma
 * cosa (spec `2026-09-07-catalogo-unico-design.md`).
 *
 * Se manda el `CalcInput` completo y **el costo lo calcula el servidor** con él.
 *
 * ⚠️ **EL PRECIO SE CONVIERTE** (2026-11-08). La calculadora trabaja en USDT (el dólar
 * real con el que se compra el filamento) y el campo de la tienda se lee como dólar BCV,
 * que vale menos. Hasta hoy el modal copiaba el número tal cual y **publicaba un 12 % más
 * barato de lo costeado**, en silencio. Ahora se convierte con `paraPublicar` y se
 * muestran las dos cifras, para que el dueño vea qué entra y qué se publica.
 *
 * Nace **oculta**: registrar una pieza no es publicarla. Se muestra en la
 * vitrina recién cuando el dueño lo decide, con sus fotos y su descripción.
 */
export function SaveProductModal({ onClose }: { onClose: () => void }) {
  const c = useCalculator();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { result } = c;

  const { money } = useMoney();
  const usdt = useUsdt();

  // El precio final de la calculadora: el mismo que se ve en el panel. Está en USDT.
  const suggested = result?.price.final ?? 0;
  // Lo que hay que publicar en la vitrina para recibir ese precio. Si faltan las tasas,
  // `convertido` queda en false y abajo se dice: nunca se publica barato sin avisar.
  const publicado = useMemo(() => usdt.paraPublicar(suggested), [suggested, usdt.bcv, usdt.usdt]);

  /**
   * ⚠️ Los tramos de mayoreo VIAJAN (2026-11-07). Iban dentro del `input`, que
   * se guarda, pero el campo que la TIENDA usa para cobrar es `priceTiers` y
   * nacía vacío: el mismo dato había que escribirlo dos veces, y si te
   * olvidabas la vitrina cobraba precio de lista para siempre.
   *
   * No es un cast: la ficha pide cosas que la calculadora no (ver
   * `tramosParaLaTienda`), y mandar la lista cruda hacía rebotar el guardado.
   */
  const priceTiers = useMemo(() => tramosParaLaTienda(c.input.wholesale?.tiers), [c.input]);

  const [name, setName] = useState(c.quoteName);
  // El precio EDITABLE es el de vitrina (BCV), que es lo que se guarda en la ficha.
  const [priceUsd, setPriceUsd] = useState(Number(publicado.bcv.toFixed(4)));
  const [tocado, setTocado] = useState(false);
  const [saving, setSaving] = useState(false);

  // Las tasas llegan por una consulta aparte, así que el primer render puede no tenerlas
  // y el precio nacería sin convertir. Se re-propone hasta que el dueño lo toque: a
  // partir de ahí manda él, que para eso el campo es editable.
  useEffect(() => {
    if (!tocado) setPriceUsd(Number(publicado.bcv.toFixed(4)));
  }, [publicado.bcv, tocado]);

  /** Lo que entra en USDT con el precio que hay escrito AHORA (no el propuesto). */
  const entra = usdt.enUsdt(priceUsd);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.post<{ id: string }>('/store/products', {
        name,
        priceUsd,
        input: c.input,
        priceTiers,
        // Oculta hasta que se le cargue foto y descripción.
        visible: false,
      });
      await queryClient.invalidateQueries({ queryKey: ['store-products'] });
      notify.success('Producto guardado en el catálogo');
      navigate(`/store/${res.data.id}`);
    } catch (e) {
      notify.error(apiErrorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Guardar como producto"
      description="Queda en el catálogo con su costeo, oculto hasta que lo publiques."
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Se guarda con el cálculo adentro, así que después la app puede recostearlo con los
          precios de hoy y avisarte si el margen se cayó.
        </p>
        <Field label="Nombre">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Llavero mundial"
            autoFocus
          />
        </Field>
        <Field
          label="Precio de vitrina · unidad (BCV)"
          hint={
            publicado.convertido
              ? 'Convertido desde el precio costeado. Puedes ajustarlo.'
              : 'Viene del panel; puedes ajustarlo'
          }
        >
          <NumberInput
            value={priceUsd}
            onChange={(v) => {
              setTocado(true);
              setPriceUsd(v);
            }}
            min={0}
            step={0.01}
          />
        </Field>
        {publicado.convertido ? (
          <div className="space-y-1 rounded-md bg-muted/50 px-3 py-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Costeaste</span>
              <span className="font-mono tabular-nums">{money(suggested)} USDT</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Se publica</span>
              <span className="font-mono tabular-nums">{money(priceUsd)} BCV</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Entra</span>
              <span className="font-mono tabular-nums">
                {entra == null ? '—' : `${money(entra)} USDT`}
              </span>
            </div>
            {entra != null && entra < suggested && (
              <p className="pt-1 text-xs font-medium text-destructive">
                Con ese precio entran {money(suggested - entra)} menos de lo que costeaste.
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Falta una de las dos tasas, así que este precio va <strong>sin convertir</strong>. La
            vitrina publica en dólares BCV y vos costeás en USDT: tal cual, se publica más barato
            de lo costeado. Carga las tasas en Configuración.
          </p>
        )}
        {priceTiers.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Se copian <strong className="text-foreground">{priceTiers.length}</strong>{' '}
            {priceTiers.length === 1 ? 'tramo de mayoreo' : 'tramos de mayoreo'} (desde{' '}
            {priceTiers.map((t) => t.minQty).join(', ')} unidades). El precio de arriba es el de
            lista: el descuento lo aplica la tienda por cantidad.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={save} disabled={saving || !name}>
            {saving ? 'Guardando…' : 'Guardar producto'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
