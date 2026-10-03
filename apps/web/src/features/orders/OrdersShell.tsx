import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * ENCARGOS — tres vistas del MISMO dato, cada una con su propia dirección:
 * Lista (`/orders`), Calendario (`/orders/calendario`) y Por cobrar
 * (`/orders/por-cobrar`).
 *
 * La pestaña va en la URL a propósito: así el botón "atrás" del navegador
 * funciona y el enlace se puede compartir. Las direcciones viejas
 * (`/calendar`, `/receivables`) quedaron como redirección en `App.tsx` para no
 * romper favoritos.
 *
 * Las tres pantallas leen `useOrders()`, que TanStack Query cachea bajo la
 * misma clave: cambiar de pestaña no vuelve a pedir los encargos.
 */
const TABS: { to: string; label: string; end: boolean }[] = [
  { to: '/orders', label: 'Lista', end: true },
  { to: '/orders/calendario', label: 'Calendario', end: false },
  { to: '/orders/por-cobrar', label: 'Por cobrar', end: false },
];

/** Tira de pestañas. Mismo lenguaje visual que el menú: caja azul + barra de oro. */
function OrdersTabs() {
  return (
    <nav
      aria-label="Vistas de encargos"
      className="flex w-full gap-1 overflow-x-auto rounded-xl border border-border/70 bg-card/60 p-1 sm:w-auto"
    >
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              'relative shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="orders-tab-active"
                  className="absolute inset-0 rounded-lg border border-brand-blue/40 bg-brand-blue/15"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              {isActive && (
                <motion.span
                  layoutId="orders-tab-bar"
                  className="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full bg-brand-yellow shadow-glow-sm"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative">{t.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Encabezado + pestañas que comparten las tres vistas de Encargos. */
export function OrdersShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: ReactNode;
  /** Acción propia de la pestaña (p. ej. "Nuevo encargo" o el mes del calendario). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {actions}
      </div>

      <OrdersTabs />

      {children}
    </div>
  );
}
