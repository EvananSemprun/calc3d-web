import * as React from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Librería de efectos a medida (estilo Magic UI) para Calc3D.
 * Reglas: paleta ESTRICTA de marca (oro/azul navy), y todo respeta
 * `prefers-reduced-motion`. No depende de `ui.tsx` (dependencia de una vía:
 * ui → effects), para evitar ciclos de importación.
 */

/* ------------------------------------------------------------------ *
 * NumberTicker — número que "rueda" al cambiar de valor.
 * Encaja con las KPIs en vivo: el valor se actualiza con cada input.
 * ------------------------------------------------------------------ */
export function NumberTicker({
  value,
  format,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const fmt = format ?? ((n: number) => String(Math.round(n)));
  const fmtRef = React.useRef(fmt);
  fmtRef.current = fmt;

  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { damping: 32, stiffness: 170, mass: 0.7 });

  React.useEffect(() => {
    if (reduce) {
      if (ref.current) ref.current.textContent = fmtRef.current(value);
      return;
    }
    motionValue.set(value);
  }, [value, reduce, motionValue]);

  React.useEffect(() => {
    if (reduce) return;
    const unsub = spring.on('change', (latest) => {
      if (ref.current) ref.current.textContent = fmtRef.current(latest);
    });
    return () => unsub();
  }, [spring, reduce]);

  return (
    <span ref={ref} className={className}>
      {fmt(value)}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Reveal — entrada con fade + slide. Usa `delay` (o `index`) para
 * escalonar el contenido de cada paso / sección.
 * ------------------------------------------------------------------ */
export function Reveal({
  children,
  delay = 0,
  index,
  y = 12,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  index?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const computedDelay = index != null ? index * 0.06 : delay;
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: computedDelay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * SpotlightCard — superficie glass con un resplandor radial que sigue
 * al cursor. Standalone (no usa <Card>) para mantener ui → effects.
 * ------------------------------------------------------------------ */
export function SpotlightCard({
  children,
  className,
  tone = 'gold',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: 'gold' | 'blue' }) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const [active, setActive] = React.useState(false);

  const color =
    tone === 'gold' ? 'hsl(var(--brand-yellow) / 0.14)' : 'hsl(var(--brand-blue) / 0.28)';

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (reduce) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      className={cn('group relative overflow-hidden rounded-2xl glass', className)}
      {...props}
    >
      {!reduce && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            opacity: active ? 1 : 0,
            background: `radial-gradient(420px circle at ${pos.x}px ${pos.y}px, ${color}, transparent 65%)`,
          }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * BeamBorder — envuelve contenido y dibuja un haz de oro que recorre
 * el borde. Reservado para lo héroe (precio elegido / CTA principal).
 * ------------------------------------------------------------------ */
export function BeamBorder({
  children,
  className,
  radius = 'rounded-2xl',
  duration = 7,
}: {
  children: React.ReactNode;
  className?: string;
  radius?: string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={cn('relative', radius, className)}>
      {!reduce && (
        <div className={cn('absolute inset-0 overflow-hidden', radius)} aria-hidden>
          <div
            className="absolute left-1/2 top-1/2 h-[220%] w-[220%] -translate-x-1/2 -translate-y-1/2 animate-spin"
            style={{
              animationDuration: `${duration}s`,
              background:
                'conic-gradient(from 0deg, transparent 0 62%, hsl(var(--brand-yellow) / 0.9) 78%, hsl(var(--brand-yellow-hover)) 86%, transparent 94%)',
            }}
          />
        </div>
      )}
      <div className={cn('relative m-px', radius)}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * GridPattern — cuadrícula blueprint decorativa (encabezados/auth).
 * ------------------------------------------------------------------ */
export function GridPattern({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  const id = React.useId();
  return (
    <svg aria-hidden className={cn('absolute inset-0 h-full w-full text-brand-blue/40', className)}>
      <defs>
        <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
          <path
            d={`M ${size} 0 L 0 0 0 ${size}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * GoldText — titular con barrido de oro (usar con moderación).
 * ------------------------------------------------------------------ */
export function GoldText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn('text-gold-sheen', className)}>{children}</span>;
}
