import * as React from 'react';
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
  }
>(
  (
    { value, defaultValue, onChange, onValueChange, onBlur, name, disabled, className, placeholder, children },
    ref,
  ) => {
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

    const handle = (inner: string) => {
      const real = fromInner(inner);
      onValueChange?.(real);
      onChange?.({ target: { value: real, name } });
    };

    return (
      <SelectPrimitive.Root
        value={value === undefined ? undefined : toInner(value)}
        defaultValue={defaultValue === undefined ? undefined : toInner(defaultValue)}
        onValueChange={handle}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          ref={ref}
          onBlur={onBlur}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background/50 px-3 py-2 text-sm shadow-sm transition-all hover:border-brand-blue/50 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:line-clamp-1 [&>span]:text-left',
            className,
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon asChild>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            className="relative z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-card backdrop-blur-xl data-[state=open]:animate-[fade-in-up_0.12s_ease-out]"
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
                  className="relative flex w-full cursor-pointer select-none items-center rounded-md py-1.5 pl-3 pr-8 text-sm outline-none transition-colors data-[highlighted]:bg-brand-blue/40 data-[highlighted]:text-foreground data-[state=checked]:font-semibold data-[state=checked]:text-brand-yellow-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
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
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        {required && <RequiredTag />}
      </div>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Etiqueta "Obligatorio" para los datos del trabajo (cantidad, gramos, horas). */
export function RequiredTag() {
  return (
    <span className="inline-flex items-center rounded-full bg-brand-yellow/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-yellow-ink shadow-glow-sm ring-1 ring-brand-yellow/30">
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
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
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
        className="inline-flex items-center gap-1 hover:text-foreground"
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
  accent?: 'plain' | 'yellow' | 'blue' | 'success';
  className?: string;
}) {
  const frame = {
    plain: 'border-border bg-card',
    yellow: 'border-brand-yellow/40 bg-brand-yellow/[0.07] shadow-glow-sm',
    blue: 'border-brand-blue/45 bg-brand-blue/[0.10]',
    success: 'border-success/40 bg-success/[0.08]',
  }[accent];
  const valueColor = {
    plain: '',
    yellow: 'text-brand-yellow-ink',
    blue: 'text-foreground',
    success: 'text-success',
  }[accent];
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border p-4 shadow-sm backdrop-blur-[2px] transition-transform duration-200 hover:-translate-y-0.5',
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
      <div className={cn('relative mt-1 font-display text-2xl font-bold tabular sm:text-3xl', valueColor)}>
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

/** Casilla de verificación estilizada. */
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
