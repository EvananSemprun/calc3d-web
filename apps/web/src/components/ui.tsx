import * as React from 'react';
import { createPortal } from 'react-dom';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/** Primitivas de UI del sistema de marca Calc3D (azul #003566 / oro #ffc300).
 *  Paleta ESTRICTA; profundidad por glass + glow, no por colores nuevos. */

type ButtonVariant = 'default' | 'accent' | 'outline' | 'ghost' | 'destructive' | 'secondary';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

const buttonVariants: Record<ButtonVariant, string> = {
  default:
    'bg-primary text-primary-foreground shadow-sm ring-1 ring-inset ring-white/5 hover:brightness-125',
  accent:
    'group bg-brand-yellow text-brand-yellow-foreground font-semibold shadow-glow-sm hover:bg-brand-yellow-hover hover:shadow-glow',
  outline:
    'border border-input bg-background/40 backdrop-blur-sm hover:bg-accent hover:text-accent-foreground hover:border-brand-blue/60',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:brightness-110',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
};
const buttonSizes: Record<ButtonSize, string> = {
  default: 'h-10 px-4 py-2',
  sm: 'h-8 px-3 text-xs',
  lg: 'h-11 px-6 text-base',
  icon: 'h-9 w-9',
};

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
>(({ className, variant = 'default', size = 'default', children, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[.98] disabled:pointer-events-none disabled:opacity-50',
      buttonVariants[variant],
      buttonSizes[size],
      className,
    )}
    {...props}
  >
    {variant === 'accent' && (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
      />
    )}
    <span className="relative inline-flex items-center justify-center gap-2">{children}</span>
  </button>
));
Button.displayName = 'Button';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm tabular-nums shadow-sm transition-all placeholder:text-muted-foreground hover:border-brand-blue/50 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

/**
 * Campo numérico con buffer de texto: arranca vacío cuando el valor es 0
 * (muestra placeholder), permite borrar y escribir libremente sin "0" pegado,
 * y reporta el número. Se resincroniza si el valor cambia desde afuera
 * (p. ej. al elegir del catálogo).
 */
export const NumberInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
    value: number;
    onChange: (n: number) => void;
  }
>(({ value, onChange, placeholder = '0', ...props }, ref) => {
  const [text, setText] = React.useState(() => (value === 0 ? '' : String(value)));

  React.useEffect(() => {
    const parsed = text.trim() === '' ? 0 : Number(text);
    // Solo resincroniza si el valor externo difiere de lo que el usuario escribió.
    if (parsed !== value) setText(value === 0 ? '' : String(value));
  }, [value]);

  return (
    <Input
      ref={ref}
      type="number"
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const n = t.trim() === '' ? 0 : Number(t);
        if (!Number.isNaN(n)) onChange(n);
      }}
      {...props}
    />
  );
});
NumberInput.displayName = 'NumberInput';

/**
 * Select de marca sobre Radix (popup propio, totalmente temable — adiós a la
 * lista nativa del SO que rompía el tema oscuro). Drop-in: acepta la MISMA API
 * que el `<select>` nativo (`value` + `onChange(e.target.value)` + hijos
 * `<option>`), por lo que las llamadas existentes no cambian. Radix prohíbe
 * items con `value=""`, así que el vacío se mapea a un centinela interno.
 */
const SELECT_EMPTY = '__empty__';
type SelectOpt = { value: string; label: React.ReactNode; disabled?: boolean };

/**
 * A partir de cuántas opciones aparece el buscador.
 *
 * Debajo de esto es ruido: un campo de texto arriba de cuatro opciones estorba
 * más de lo que ayuda. Arriba de esto la lista ya no entra en pantalla y
 * encontrar un filamento entre 53 a fuerza de scroll es el problema real.
 */
const MINIMO_PARA_BUSCAR = 8;

/**
 * El texto de una opción, para poder buscarla.
 *
 * El `label` es un `ReactNode` porque algunas opciones llevan formato. Sin
 * aplanarlo, esas no coincidirían NUNCA y el buscador las escondería: peor que
 * no tener buscador.
 */
function textoDe(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textoDe).join(' ');
  if (React.isValidElement(node)) return textoDe((node.props as { children?: React.ReactNode }).children);
  return '';
}

/** Sin acentos y en minúscula: buscar "diseno" tiene que encontrar "Diseño". */
const normalizar = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');


/**
 * EL SELECT CON BUSCADOR NO PUEDE SER UN RADIX SELECT (2026-11-07).
 *
 * Radix Select no es un combobox: maneja el foco él y lo devuelve a la lista
 * cada vez que cambia el conjunto de opciones MONTADAS. Al escribir una letra
 * la lista se filtra, la opción resaltada se desmonta, y Radix se lleva el
 * foco del buscador al contenedor. **Medido** en este repo a 390×844: antes de
 * escribir, el foco estaba en `INPUT | Buscar en la lista`; después de UNA
 * tecla, en el `div` del contenido. En un teléfono eso es el teclado virtual
 * cerrándose: había que volver a tocar el buscador letra por letra.
 *
 * Los dos parches que había —enfocar en el siguiente tick al montar e ignorar
 * 600 ms de cierres espurios— tapaban la APERTURA, no el re-render de cada
 * tecla, que es donde estaba el bug.
 *
 * ⚠️ Y la lista va EN UN PORTAL, no absoluta dentro del campo. El cuerpo de
 * `Dialog` es `overflow-y-auto` y las `Card` recortan: sin portal se arregla el
 * foco y se rompe lo otro, que es el error clásico de este bug —cambiar de
 * bando en vez de resolverlo—. Que el portal ande DENTRO de un modal está
 * medido: con el diálogo abierto, un input en portal conserva el foco; el
 * focus trap de Radix Dialog no se lo quita.
 */
function SelectBuscable({
  opts,
  actual,
  elegir,
  placeholder,
  disabled,
  className,
  ariaLabel,
  ariaLabelledBy,
  onBlur,
  name,
  botonRef,
}: {
  opts: SelectOpt[];
  actual: string;
  elegir: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  onBlur?: () => void;
  name?: string;
  botonRef: React.RefObject<HTMLButtonElement>;
}) {
  const [abierto, setAbierto] = React.useState(false);
  const [busqueda, setBusqueda] = React.useState('');
  const [activo, setActivo] = React.useState(0);
  const [caja, setCaja] = React.useState<{ estilo: React.CSSProperties; anfitrion: HTMLElement } | null>(
    null,
  );
  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const idLista = React.useId();

  const q = normalizar(busqueda.trim());
  const visibles = q ? opts.filter((o) => normalizar(textoDe(o.label)).includes(q)) : opts;
  const elegibles = visibles.filter((o) => !o.disabled);

  /**
   * Dónde se dibuja la lista. `position: fixed` + las medidas del botón: el
   * portal no hereda la posición de nadie. Abre hacia abajo salvo que no quepa
   * y arriba haya más sitio — un select al final de un formulario largo se
   * cortaba si no.
   */
  const medir = React.useCallback(() => {
    const b = botonRef.current;
    const r = b?.getBoundingClientRect();
    if (!b || !r) return;
    /**
     * ⚠️ DENTRO DE UN MODAL, LA LISTA SE CUELGA DEL MODAL, no de `body`.
     *
     * Medido: con el diálogo abierto, un `focus()` sobre un input colgado de
     * `body` produce un `focusin` en el BOTÓN del select — el focus trap de
     * Radix Dialog devuelve el foco a lo último que estuvo dentro de su
     * ámbito. Es el mismo bug que veníamos a arreglar, por la otra puerta.
     *
     * Colgarla del contenido del diálogo la deja dentro del ámbito (conserva
     * el foco) y FUERA del cuerpo `overflow-y-auto` (no se recorta): el
     * contenido no tiene `overflow`, así que la lista puede sobresalir.
     *
     * El contenido del diálogo tiene `transform`, y eso hace que `fixed` se
     * mida contra ÉL y no contra la ventana: por eso ahí se posiciona en
     * `absolute` y con las coordenadas pasadas a su sistema.
     */
    const anfitrion = (b.closest('[role="dialog"]') as HTMLElement | null) ?? document.body;
    const margen = 8;
    const libreAbajo = window.innerHeight - r.bottom - margen;
    const libreArriba = r.top - margen;
    const haciaAbajo = libreAbajo >= 220 || libreAbajo >= libreArriba;
    const alto = Math.max(140, Math.min(288, haciaAbajo ? libreAbajo : libreArriba));
    const izquierda = Math.max(margen, Math.min(r.left, window.innerWidth - r.width - margen));
    const h = anfitrion === document.body ? null : anfitrion.getBoundingClientRect();
    setCaja({
      anfitrion,
      estilo: h
        ? {
            position: 'absolute',
            left: izquierda - h.left,
            width: r.width,
            maxHeight: alto,
            ...(haciaAbajo ? { top: r.bottom + 6 - h.top } : { bottom: h.bottom - r.top + 6 }),
          }
        : {
            position: 'fixed',
            left: izquierda,
            width: r.width,
            maxHeight: alto,
            ...(haciaAbajo ? { top: r.bottom + 6 } : { bottom: window.innerHeight - r.top + 6 }),
          },
    });
  }, [botonRef]);

  React.useLayoutEffect(() => {
    if (abierto) medir();
  }, [abierto, medir, busqueda]);

  React.useEffect(() => {
    if (!abierto) return;
    // El teclado virtual dispara `resize`: acá eso REUBICA la lista. Con Radix
    // ese mismo resize la CERRABA, que era el otro síntoma del bug.
    const alMover = () => medir();
    const afuera = (e: Event) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || botonRef.current?.contains(t)) return;
      setAbierto(false);
      setBusqueda('');
    };
    window.addEventListener('resize', alMover);
    window.addEventListener('scroll', alMover, true);
    document.addEventListener('mousedown', afuera);
    document.addEventListener('touchstart', afuera);
    return () => {
      window.removeEventListener('resize', alMover);
      window.removeEventListener('scroll', alMover, true);
      document.removeEventListener('mousedown', afuera);
      document.removeEventListener('touchstart', afuera);
    };
  }, [abierto, medir, botonRef]);

  /**
   * Al abrir, el foco va al BUSCADOR y se queda ahí: escribir es lo primero que
   * se hace. Corre dentro del gesto que abrió la lista, así que en el teléfono
   * el teclado sube solo.
   *
   * ⚠️ Por eso `abrir()` MIDE ANTES de abrir: el portal solo se monta cuando
   * ya hay medidas: si se abriera primero, este efecto correría con el
   * input todavía sin existir y el foco se quedaba en el botón. Medido: el
   * buscador existía en el DOM pero no recibía las teclas.
   */
  React.useLayoutEffect(() => {
    if (abierto) inputRef.current?.focus();
  }, [abierto]);

  const abrir = () => {
    medir();
    setAbierto(true);
  };

  React.useEffect(() => setActivo(0), [busqueda, abierto]);

  const cerrar = (devolverFoco = true) => {
    setAbierto(false);
    setBusqueda('');
    if (devolverFoco) botonRef.current?.focus();
  };

  const tomar = (v: string) => {
    elegir(v);
    cerrar();
  };

  const mover = (paso: number) => {
    if (!elegibles.length) return;
    setActivo((a) => {
      const i = elegibles.indexOf(visibles[a]);
      const base = i < 0 ? (paso > 0 ? -1 : 0) : i;
      const sig = elegibles[(base + paso + elegibles.length) % elegibles.length];
      return visibles.indexOf(sig);
    });
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mover(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      mover(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = visibles[activo];
      if (o && !o.disabled) tomar(o.value);
    } else if (e.key === 'Escape') {
      // ⚠️ Sin frenarlo, el Escape sigue hasta el Dialog y cierra el MODAL
      // entero: querías cerrar una lista y perdías el formulario.
      e.preventDefault();
      e.stopPropagation();
      cerrar();
    } else if (e.key === 'Tab') {
      cerrar(false);
    }
  };

  const etiqueta = opts.find((o) => o.value === actual)?.label;

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        role="combobox"
        aria-expanded={abierto}
        aria-haspopup="listbox"
        aria-controls={abierto ? idLista : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        name={name}
        disabled={disabled}
        onBlur={onBlur}
        onClick={() => (abierto ? cerrar() : abrir())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            abrir();
          }
        }}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background/50 px-3 py-2 text-sm shadow-sm transition-all hover:border-brand-blue/50 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className={cn('line-clamp-1 text-left', etiqueta == null && 'text-muted-foreground')}>
          {etiqueta ?? placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
      </button>

      {abierto &&
        caja &&
        createPortal(
          <div
            ref={panelRef}
            style={caja.estilo}
            // z-70: por encima del Dialog (z-50) y de la paleta de búsqueda (z-60).
            className="z-[70] flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-card backdrop-blur-xl animate-[fade-in-up_0.12s_ease-out]"
          >
            <div className="shrink-0 border-b border-border/70 p-2">
              <input
                ref={inputRef}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={teclas}
                placeholder="Buscar…"
                aria-label="Buscar en la lista"
                aria-autocomplete="list"
                aria-controls={idLista}
                aria-activedescendant={visibles[activo] ? `${idLista}-${activo}` : undefined}
                className="h-8 w-full rounded-md border border-input bg-background/60 px-2 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <div
              id={idLista}
              role="listbox"
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              className="flex-1 overflow-y-auto p-1"
            >
              {visibles.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  Nada coincide con “{busqueda.trim()}”.
                </p>
              )}
              {visibles.map((o, i) => (
                <div
                  key={o.value || SELECT_EMPTY}
                  id={`${idLista}-${i}`}
                  role="option"
                  aria-selected={o.value === actual}
                  aria-disabled={o.disabled || undefined}
                  // `onMouseDown` y no `onClick`: el click llega DESPUÉS del
                  // blur, y para entonces el cierre por «clic afuera» ya se
                  // comió la elección.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (!o.disabled) tomar(o.value);
                  }}
                  onMouseMove={() => setActivo(i)}
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 pl-3 pr-8 text-sm transition-colors',
                    i === activo && !o.disabled && 'bg-brand-blue/40 text-foreground',
                    o.value === actual && 'font-semibold text-brand-yellow-ink',
                    o.disabled && 'pointer-events-none opacity-50',
                  )}
                >
                  <span className="min-w-0 truncate">{o.label}</span>
                  {o.value === actual && (
                    <Check
                      className="absolute right-2 h-4 w-4 text-brand-yellow-ink"
                      strokeWidth={3}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>,
          caja.anfitrion,
        )}
    </>
  );
}

export const Select = React.forwardRef<
  HTMLButtonElement,
  {
    value?: string;
    defaultValue?: string;
    onChange?: (e: { target: { value: string; name?: string } }) => void;
    onValueChange?: (value: string) => void;
    onBlur?: () => void;
    name?: string;
    disabled?: boolean;
    className?: string;
    placeholder?: string;
    children?: React.ReactNode;
    /**
     * ⚠️ Un desplegable sin etiqueta visible la necesita acá, y hay que PASARLA
     * al trigger: Radix no la hereda del wrapper. Siete llamadas la mandaban y
     * se perdía en silencio —el lector de pantalla leía solo el valor— porque
     * esta prop no estaba declarada y el objeto desestructurado la descartaba.
     */
    'aria-label'?: string;
  }
>(
  (
    {
      value,
      defaultValue,
      onChange,
      onValueChange,
      onBlur,
      name,
      disabled,
      className,
      placeholder,
      children,
      'aria-label': ariaLabel,
    },
    ref,
  ) => {
    // Sin `aria-label` propio, el nombre lo da la etiqueta del `Field` que lo envuelve.
    const ariaLabelledBy = useEtiquetaDeCampo(ariaLabel);
    const opts: SelectOpt[] = [];
    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child) || child.type !== 'option') return;
      opts.push({
        value: String(child.props.value ?? ''),
        label: child.props.children,
        disabled: child.props.disabled,
      });
    });

    const toInner = (v: string) => (v === '' ? SELECT_EMPTY : v);
    const fromInner = (v: string) => (v === SELECT_EMPTY ? '' : v);

    // Lo elegido, también cuando el componente va sin `value` (no controlado).
    const [interno, setInterno] = React.useState(defaultValue ?? '');
    const actual = value ?? interno;

    // Un solo ref para las dos variantes: el botón real está en una o en otra,
    // y `useImperativeHandle` tiene que llamarse siempre (no puede ir después
    // del `return` de una rama).
    const botonRef = React.useRef<HTMLButtonElement>(null);
    React.useImperativeHandle(ref, () => botonRef.current as HTMLButtonElement, []);

    const aplicar = (real: string) => {
      setInterno(real);
      onValueChange?.(real);
      onChange?.({ target: { value: real, name } });
    };

    /**
     * LISTA LARGA → variante con buscador, que NO es un Radix Select (ver
     * `SelectBuscable`). Corta acá a propósito: así la rama de Radix queda
     * para lo que Radix hace bien —una lista corta sin campo de texto— y no
     * hay que pelearle el foco.
     */
    if (opts.length >= MINIMO_PARA_BUSCAR) {
      return (
        <SelectBuscable
          opts={opts}
          actual={actual}
          elegir={aplicar}
          placeholder={placeholder}
          disabled={disabled}
          className={className}
          ariaLabel={ariaLabel}
          ariaLabelledBy={ariaLabelledBy}
          onBlur={onBlur}
          name={name}
          botonRef={botonRef}
        />
      );
    }

    return (
      <SelectPrimitive.Root
        value={value === undefined ? undefined : toInner(value)}
        defaultValue={defaultValue === undefined ? undefined : toInner(defaultValue)}
        onValueChange={(inner) => aplicar(fromInner(inner))}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          ref={botonRef}
          onBlur={onBlur}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background/50 px-3 py-2 text-sm shadow-sm transition-all hover:border-brand-blue/50 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:line-clamp-1 [&>span]:text-left',
            className,
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder}>
            {opts.find((o) => o.value === actual)?.label}
          </SelectPrimitive.Value>
          <SelectPrimitive.Icon asChild>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            collisionPadding={12}
            // ⚠️ `min-w` sin `max-w` deja que la lista crezca con la opción más
            // larga: con nombres de filamento de 30 caracteres, en un teléfono
            // de 375 px la lista medía 431 y se salía de la pantalla. El ancho
            // disponible lo calcula Radix; el `calc` es el respaldo por si la
            // variable no está.
            className="relative z-50 max-h-72 w-max min-w-[var(--radix-select-trigger-width)] max-w-[min(var(--radix-select-content-available-width),calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-card backdrop-blur-xl data-[state=open]:animate-[fade-in-up_0.12s_ease-out]"
          >
            <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-muted-foreground">
              <ChevronUp className="h-4 w-4" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="p-1">
              {opts.map((o) => (
                <SelectPrimitive.Item
                  key={o.value || SELECT_EMPTY}
                  value={toInner(o.value)}
                  disabled={o.disabled}
                  className="relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 pl-3 pr-8 text-sm outline-none transition-colors [&>span]:min-w-0 data-[highlighted]:bg-brand-blue/40 data-[highlighted]:text-foreground data-[state=checked]:font-semibold data-[state=checked]:text-brand-yellow-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center">
                    <Check className="h-4 w-4 text-brand-yellow-ink" strokeWidth={3} />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-muted-foreground">
              <ChevronDown className="h-4 w-4" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    );
  },
);
Select.displayName = 'Select';

/**
 * El `<label>` de `Field` es hermano de su control y un `<button>` (el trigger
 * de Radix o el `role="combobox"` propio) NO es etiquetable por un `<label>`:
 * sin esto, ningún `Select` dentro de un `Field` tenía nombre accesible. `Field`
 * publica el id de su etiqueta y los controles lo toman como `aria-labelledby`,
 * así el control nuevo nace con nombre sin que quien lo usa repita nada.
 */
const EtiquetaDeCampo = React.createContext<string | undefined>(undefined);

/** Id de la etiqueta del `Field` más cercano, salvo que el control traiga su `aria-label`. */
export function useEtiquetaDeCampo(ariaLabel?: string): string | undefined {
  const id = React.useContext(EtiquetaDeCampo);
  return ariaLabel ? undefined : id;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('text-sm font-medium leading-none text-foreground', className)} {...props} />
  );
}

export function Field({
  label,
  error,
  children,
  hint,
  required,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const idEtiqueta = React.useId();
  return (
    <div className="space-y-1.5">
      {/* Alto FIJO de la fila de la etiqueta: con la insignia "Obligatorio" la
          fila crecía ~5 px, y en una grilla eso bajaba el input respecto del
          campo vecino que no la tiene. */}
      <div className="flex min-h-5 items-center gap-2">
        <Label id={idEtiqueta} data-field-label title={label}>
          {label}
        </Label>
        {required && <RequiredTag />}
      </div>
      <EtiquetaDeCampo.Provider value={idEtiqueta}>{children}</EtiquetaDeCampo.Provider>
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Grilla de campos que se reacomoda SOLA: pone tantas columnas como quepan con
 * un ancho mínimo por campo y, si no entran, el que sobra baja a la fila de
 * abajo.
 *
 * Existe porque los breakpoints de Tailwind (`sm:`/`lg:grid-cols-N`) miran la
 * VENTANA y no el contenedor. En la calculadora el formulario comparte el
 * ancho con el panel del precio, así que en una pantalla "lg" cada columna
 * quedaba de ~150 px: la etiqueta bajaba a dos o tres renglones y el input se
 * desalineaba del de al lado.
 *
 * Las etiquetas no se parten: así todas las filas de etiqueta miden lo mismo y
 * los inputs quedan alineados. `min` tiene que alcanzar para la etiqueta más
 * larga de la grilla, con su "Obligatorio" (en un modal `max-w-md`, `11rem`
 * deja dos columnas; en una página, el default). Si igual no entra, se corta
 * con "…" y el texto completo queda en el `title` — mejor que invadir la
 * columna de al lado. `leading-5` para que el recorte no se coma los acentos.
 * `min(100%, …)` evita que en un teléfono angosto la columna desborde.
 * Para un campo a todo el ancho: envolverlo en un div con `col-span-full`.
 */
export function FieldGrid({
  min = '15rem',
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { min?: string }) {
  return (
    <div
      className={cn(
        'grid gap-4 [&_[data-field-label]]:min-w-0 [&_[data-field-label]]:truncate [&_[data-field-label]]:leading-5',
        className,
      )}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}), 1fr))`, ...style }}
      {...props}
    />
  );
}

/**
 * BARRA DE FILTROS — la de TODA lista con filtros (desde el 2026-09-14, decisión
 * del dueño). Antes cada página ponía sus controles en un `flex-wrap` con anchos
 * fijos (`w-40`, `w-44`…): en un teléfono quedaba un control por fila, cada uno
 * de un ancho distinto y con media pantalla vacía al lado.
 *
 * - **Teléfono**: grilla `auto-fit` de columnas de `min` (dos por fila en uno de
 *   ~375 px). El buscador, el filtro de fechas y un control que quede solo van
 *   a todo el ancho con `col-span-full`.
 * - **Desde `sm`**: en línea (`flex-wrap`), cada control con su ancho.
 *
 * Los controles van con `w-full sm:w-XX` para llenar su celda en el teléfono;
 * el `DateRangePicker` envuelto en `<div className="col-span-full sm:col-span-1">`.
 */
export function FilterBar({
  min = '9rem',
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { min?: string }) {
  return (
    <div
      className={cn('grid gap-2 sm:flex sm:flex-wrap sm:items-center', className)}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}), 1fr))`, ...style }}
      {...props}
    />
  );
}

/** Etiqueta "Obligatorio" para los datos del trabajo (cantidad, gramos, horas). */
export function RequiredTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-brand-yellow/15 px-2 py-0.5 text-[10px] font-bold leading-none uppercase tracking-wide text-brand-yellow-ink shadow-glow-sm ring-1 ring-brand-yellow/30">
      Obligatorio
    </span>
  );
}

/** Clase para resaltar los inputs obligatorios del trabajo. */
export const REQUIRED_INPUT =
  'border-brand-yellow/50 ring-2 ring-brand-yellow/15 bg-brand-yellow/[0.04]';

/** Bloque "esqueleto" que late mientras carga (reemplaza el texto "Cargando…"). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted/60', className)} />;
}

/** Esqueleto de tabla: N filas de barras (padded). Envuélvelo en <Card> si hace falta. */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3.5 p-5">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-4 flex-1', c === 0 && 'max-w-[38%]')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Esqueleto de página de detalle: barra de título + tarjeta con filas. */
export function PageSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-56" />
      <Card>
        <TableSkeleton rows={6} />
      </Card>
    </div>
  );
}

/**
 * Estado vacío consistente: ícono opcional, título opcional, descripción y una
 * acción (botón/enlace). Unifica el "no hay nada todavía" en todas las listas.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 p-12 text-center', className)}>
      {Icon && (
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-blue/15 text-brand-blue-bright ring-1 ring-inset ring-brand-blue/30">
          <Icon className="h-6 w-6" />
        </span>
      )}
      {title && <p className="font-display text-base font-semibold">{title}</p>}
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

/** Campo de búsqueda con ícono y botón para limpiar. */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar…',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-8"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Limpiar búsqueda"
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground',
            // El anillo de la casa, el MISMO de `Button`: este botón aparece
            // y desaparece con el texto, así que navegando por teclado es el
            // más fácil de perder de vista.
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Cabecera de tabla ordenable: click alterna asc/desc. Usa el hook `useSortable`. */
export function SortHeader<T>({
  label,
  sortKey,
  sort,
  className,
}: {
  label: string;
  sortKey: keyof T;
  sort: { sortKey: keyof T | null; sortDir: 'asc' | 'desc'; toggle: (k: keyof T) => void };
  className?: string;
}) {
  const active = sort.sortKey === sortKey;
  const Icon = active ? (sort.sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={cn('px-4 py-2.5 font-semibold', className)}>
      <button
        type="button"
        onClick={() => sort.toggle(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 rounded hover:text-foreground',
          // Ordenar una tabla por teclado es de las pocas cosas que se hacen
          // SIN mouse; sin anillo propio no se sabe por qué columna se va.
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        {label}
        <Icon className={cn('h-3.5 w-3.5', active ? 'text-brand-yellow-ink' : 'opacity-40')} />
      </button>
    </th>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card text-card-foreground shadow-card backdrop-blur-[2px]',
        className,
      )}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1 p-5 pb-3', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('font-display text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function Badge({
  className,
  variant = 'default',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'outline' | 'success' | 'warning' | 'brand';
}) {
  const variants = {
    default: 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/20',
    outline: 'border border-border text-muted-foreground',
    success: 'bg-success/15 text-success ring-1 ring-inset ring-success/25',
    warning: 'bg-amber-400/15 text-amber-600 ring-1 ring-inset ring-amber-400/25 dark:text-amber-400',
    brand: 'bg-brand-yellow/15 text-brand-yellow-ink ring-1 ring-brand-yellow/30',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Tarjeta KPI. `accent` resalta el valor (amarillo = héroe, blue, success). */
/**
 * Barra de avance.
 *
 * ⚠️ El riel lleva **borde**, no solo fondo. Con `bg-muted` a secas queda del
 * mismo color que la tarjeta en el tema oscuro (los dos son navy), así que una
 * barra en 0 % no se ve NADA: la fila parece rota en vez de "todavía en cero".
 * Pasaba en las tres impresoras sin reponer y en los meses futuros de Metas.
 *
 * `value` es una fracción 0..1. Se recorta para dibujar: superar la meta se
 * cuenta con el número al lado, no estirando la barra fuera de su caja.
 */
export function ProgressBar({
  value,
  tone = 'gold',
  className,
}: {
  value: number;
  tone?: 'gold' | 'success' | 'danger';
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100;
  const color = {
    gold: 'bg-brand-yellow',
    success: 'bg-success',
    danger: 'bg-destructive',
  }[tone];

  return (
    <div
      className={cn(
        'h-2.5 w-full overflow-hidden rounded-full border border-brand-blue/60 bg-brand-blue/20',
        className,
      )}
    >
      <div
        className={cn('h-full rounded-full shadow-glow-sm transition-all', color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent = 'plain',
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /**
   * ⚠️ `danger` es la ALARMA, y se reserva para lo que de verdad lo es: un
   * SALDO en rojo. Un resultado mensual negativo con plata en la cuenta no es
   * una emergencia, y pintarlo igual que un saldo vacío enseña a ignorar el
   * color (el Dashboard lo hacía hasta el 2026-10-10).
   */
  accent?: 'plain' | 'yellow' | 'blue' | 'success' | 'danger';
  className?: string;
}) {
  const frame = {
    plain: 'border-border bg-card',
    yellow: 'border-brand-yellow/40 bg-brand-yellow/[0.07] shadow-glow-sm',
    blue: 'border-brand-blue/45 bg-brand-blue/[0.10]',
    success: 'border-success/40 bg-success/[0.08]',
    danger: 'border-destructive/45 bg-destructive/[0.08]',
  }[accent];
  const valueColor = {
    plain: '',
    yellow: 'text-brand-yellow-ink',
    blue: 'text-foreground',
    success: 'text-success',
    danger: 'text-destructive',
  }[accent];
  return (
    <div
      className={cn(
        // `container-type`: el tamaño de la cifra se calcula sobre el ancho de ESTA
        // tarjeta (ver el valor más abajo), no el de la ventana.
        'relative overflow-hidden rounded-xl border p-4 shadow-sm backdrop-blur-[2px] transition-transform duration-200 [container-type:inline-size] hover:-translate-y-0.5',
        frame,
        className,
      )}
    >
      {accent === 'yellow' && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-brand-yellow/20 blur-2xl"
        />
      )}
      <div className="relative text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {/*
        La cifra escala con el ancho de la tarjeta: con `text-2xl` fijo, "$103.56"
        se cortaba en una tarjeta de media pantalla de teléfono. Entre 18 px (tarjeta
        angosta) y 30 px (el `text-3xl` de siempre, cuando hay lugar).
      */}
      <div
        className={cn('relative mt-1 whitespace-nowrap font-display font-bold leading-tight tabular', valueColor)}
        style={{ fontSize: 'clamp(1.125rem, 13cqi, 1.875rem)' }}
      >
        {value}
      </div>
      {sub && <div className="relative mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Encabezado de subsección dentro de un paso del wizard. */
export function Section({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon && (
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-blue/15 text-brand-blue-bright ring-1 ring-inset ring-brand-blue/30">
              <Icon className="h-4 w-4" />
            </span>
          )}
          <div>
            <h3 className="font-display text-base font-semibold leading-tight">{title}</h3>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Interruptor on/off premium. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300',
          // ⚠️ Mismo anillo que `Button` y `Checkbox`. Acá importa más que en
          // otros: un interruptor **no dice con palabras en qué estado está**
          // —lo dice su color—, así que sin saber dónde está el foco, pulsar
          // Espacio es apostar.
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          checked ? 'bg-brand-blue-bright shadow-glow-blue' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-300',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}

/**
 * Casilla de verificación estilizada.
 *
 * ⚠️ **El foco se dibuja en la CAJA, no en el `input`** (2026-10-11). El input
 * real es `peer sr-only` —está ahí, recibe el foco y responde al teclado, pero
 * mide 1px y está recortado—, así que su anillo de foco no se ve: la caja es un
 * `<span>` dibujado al lado. Sin la regla `peer-focus-visible:`, navegando por
 * teclado **no se veía dónde estaba el foco** en ninguna de las 7 casillas de
 * la app, incluido el «Recuérdame» del login.
 *
 * El anillo es **el mismo que usa `Button`** (`ring-2 ring-ring` +
 * `ring-offset-2 ring-offset-background`), no uno nuevo: un checkbox enfocado
 * se ve como se ve cualquier otro control enfocado. Va con offset y no pegado
 * al borde —como los campos de texto— porque la caja mide 20px y en el estado
 * marcado se rellena de azul: un anillo sin separación se perdería dentro del
 * relleno.
 *
 * ⚠️ **La regla depende de que el `input` siga siendo el hermano ANTERIOR de la
 * caja**: `peer-*` de Tailwind es un selector de hermano (`~`) y no mira hacia
 * atrás. Si alguien lo envuelve en un div o lo manda después del span, el
 * anillo deja de dibujarse **sin que nada falle**. Lo fija
 * `Checkbox.foco.spec.tsx`.
 */
export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className={cn(
          'grid h-5 w-5 place-items-center rounded-md border transition-all duration-200',
          // Lo ÚNICO que se suma es el estado de foco: reposo, marcado y
          // deshabilitado se dibujan igual que antes.
          'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
          checked
            ? 'border-brand-blue-bright bg-brand-blue-bright text-white shadow-glow-blue'
            : 'border-input bg-background',
        )}
      >
        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </span>
      {label}
    </label>
  );
}

/** Barra de progreso por pasos del wizard. */
export interface StepDef {
  id: string;
  label: string;
}
export function Stepper({
  steps,
  current,
  maxReached,
  onSelect,
}: {
  steps: StepDef[];
  current: number;
  maxReached: number;
  onSelect: (index: number) => void;
}) {
  const reduce = useReducedMotion();
  return (
    <div>
      {/* Escritorio */}
      <ol className="hidden items-center md:flex">
        {steps.map((step, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'todo';
          const reachable = i <= maxReached;
          return (
            <li key={step.id} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onSelect(i)}
                className={cn(
                  'group flex items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors',
                  reachable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                )}
              >
                <span className="relative grid h-8 w-8 shrink-0 place-items-center">
                  {state === 'active' && (
                    <motion.span
                      layoutId={reduce ? undefined : 'stepper-active'}
                      className="absolute inset-0 rounded-full bg-brand-yellow shadow-glow ring-2 ring-brand-yellow/40"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span
                    className={cn(
                      'relative grid h-8 w-8 place-items-center rounded-full text-sm font-bold transition-colors',
                      state === 'active' && 'text-brand-yellow-foreground',
                      state === 'done' && 'bg-brand-blue-bright text-white',
                      state === 'todo' && 'border border-border bg-card text-muted-foreground',
                    )}
                  >
                    {state === 'done' ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                  </span>
                </span>
                <span
                  className={cn(
                    'hidden text-sm font-medium lg:block',
                    state === 'active' ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {step.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span className="mx-2 h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                  <motion.span
                    className="block h-full rounded-full bg-brand-blue-bright"
                    initial={false}
                    animate={{ width: i < current ? '100%' : '0%' }}
                    transition={{ duration: reduce ? 0 : 0.4, ease: 'easeOut' }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Móvil */}
      <div className="md:hidden">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-display font-semibold">{steps[current].label}</span>
          <span className="text-muted-foreground">
            Paso {current + 1} de {steps.length}
          </span>
        </div>
        <div className="flex gap-1.5">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                i < current ? 'bg-brand-blue-bright' : i === current ? 'bg-brand-yellow' : 'bg-border',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
