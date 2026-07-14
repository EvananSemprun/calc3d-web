import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Calculator,
  LayoutDashboard,
  TrendingUp,
  Receipt,
  FileText,
  Package,
  CalendarDays,
  HandCoins,
  Megaphone,
  Box,
  Boxes,
  Printer,
  Puzzle,
  Users,
  Truck,
  MapPin,
  ShieldCheck,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  ChevronDown,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/AuthContext';
import { usePlan } from '@/features/billing/api';
import { ThemeToggle } from '@/components/ThemeToggle';
import { RateBadge } from '@/components/RateBadge';
import { AnimatedBackground } from '@/components/AnimatedBackground';
import { CommandPalette, CommandPaletteButton } from '@/components/CommandPalette';
import { Toaster } from '@/components/toast';
import { ConfirmProvider, TooltipProvider } from '@/components/overlays';

const navGroups: { heading?: string; items: { to: string; label: string; icon: typeof Calculator; end?: boolean }[] }[] = [
  { items: [{ to: '/', label: 'Calculadora', icon: Calculator, end: true }] },
  {
    heading: 'Finanzas',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/sales', label: 'Ventas', icon: TrendingUp },
      { to: '/expenses', label: 'Gastos', icon: Receipt },
      { to: '/quotes', label: 'Presupuestos', icon: FileText },
      { to: '/orders', label: 'Pedidos', icon: Package },
      { to: '/calendar', label: 'Calendario', icon: CalendarDays },
      { to: '/receivables', label: 'Por cobrar', icon: HandCoins },
      { to: '/campaigns', label: 'Publicidad', icon: Megaphone },
    ],
  },
  {
    heading: 'Directorio',
    items: [
      { to: '/contacts', label: 'Contactos', icon: Users },
      { to: '/map', label: 'Mapa', icon: MapPin },
    ],
  },
  {
    heading: 'Definiciones',
    items: [
      { to: '/products', label: 'Productos', icon: Boxes },
      { to: '/catalogs/materials', label: 'Materiales', icon: Box },
      { to: '/catalogs/printers', label: 'Impresoras', icon: Printer },
      { to: '/catalogs/components', label: 'Insumos', icon: Puzzle },
      { to: '/catalogs/providers', label: 'Proveedores', icon: Truck },
    ],
  },
  { items: [{ to: '/settings', label: 'Configuración', icon: SettingsIcon }] },
];

/** Ítem de navegación con indicador de oro animado (layoutId) cuando está activo. */
function NavItem({
  item,
  onNavigate,
}: {
  item: { to: string; label: string; icon: typeof Calculator; end: boolean };
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
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
              layoutId="nav-active"
              className="absolute inset-0 rounded-lg border border-brand-blue/40 bg-brand-blue/15 shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.06)]"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          )}
          {isActive && (
            <motion.span
              layoutId="nav-active-bar"
              className="absolute inset-y-0 left-0 my-auto h-5 w-1 rounded-r-full bg-brand-yellow shadow-glow-sm"
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            />
          )}
          <item.icon
            className={cn(
              'relative h-4 w-4 transition-colors',
              isActive && 'text-brand-yellow-ink',
            )}
          />
          <span className="relative">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

const COLLAPSE_KEY = 'nav-collapsed';
const loadCollapsed = (): Set<string> => {
  try {
    const saved = localStorage.getItem(COLLAPSE_KEY);
    // Primera vez (sin preferencia guardada): todos los grupos con encabezado
    // arrancan CERRADOS para que el menú no se vea saturado.
    if (saved === null) {
      return new Set(navGroups.filter((g) => g.heading).map((g) => g.heading as string));
    }
    return new Set(JSON.parse(saved) as string[]);
  } catch {
    return new Set();
  }
};

/** Contenido del menú lateral, reutilizado en escritorio (fijo) y móvil (drawer).
 *  Los grupos con encabezado son colapsables (estado en localStorage) para que el
 *  menú no se vea saturado. Los grupos sin encabezado (Calculadora, Configuración)
 *  quedan siempre visibles. */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);

  const toggle = (heading: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(heading) ? next.delete(heading) : next.add(heading);
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      return next;
    });

  return (
    <>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <div>
            <div className="font-display text-lg font-bold leading-none">Calc3D</div>
            <div className="text-[11px] text-muted-foreground">Precios para impresión 3D</div>
          </div>
        </div>
        {onNavigate && (
          <button
            onClick={onNavigate}
            aria-label="Cerrar menú"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-2">
        {navGroups.map((group, gi) => {
          const items = (
            <>
              {group.items.map((item) => (
                <NavItem key={item.to} item={{ ...item, end: item.end ?? false }} onNavigate={onNavigate} />
              ))}
            </>
          );
          // Grupos sin encabezado: siempre visibles.
          if (!group.heading) {
            return (
              <div key={gi} className="space-y-1">
                {items}
              </div>
            );
          }
          const isOpen = !collapsed.has(group.heading);
          return (
            <div key={gi} className="space-y-1">
              <button
                type="button"
                onClick={() => toggle(group.heading!)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between rounded-md px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 transition-colors hover:text-foreground"
              >
                {group.heading}
                <ChevronDown
                  className={cn('h-3.5 w-3.5 transition-transform duration-200', !isOpen && '-rotate-90')}
                />
              </button>
              {/* Colapso suave por grid-rows (sin medir alturas en JS). */}
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
              >
                <div className="space-y-1 overflow-hidden">{items}</div>
              </div>
            </div>
          );
        })}
        {user?.isSuperadmin && (
          <div className="space-y-1 border-t border-border/70 pt-3">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-brand-yellow-ink">
              Plataforma
            </p>
            <NavItem item={{ to: '/admin', label: 'Administración', icon: ShieldCheck, end: false }} onNavigate={onNavigate} />
          </div>
        )}
      </nav>
      <div className="border-t border-border/70 p-3">
        <div className="px-2 pb-2 text-xs text-muted-foreground">
          {user?.email}
          {user?.role === 'OWNER' ? ' · Dueño' : ' · Colaborador'}
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </>
  );
}

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <ConfirmProvider>
        <div className="flex min-h-screen">
      <AnimatedBackground />
      {/* Sidebar FIJA en escritorio */}
      <aside className="surface-grid glass sticky top-0 hidden h-screen w-60 shrink-0 flex-col rounded-none border-y-0 border-l-0 md:flex">
        <SidebarContent />
      </aside>

      {/* Drawer DINÁMICO en móvil.
          Render condicional directo (SIN AnimatePresence): en esta versión de `motion`,
          AnimatePresence con un hijo condicional no desmonta el overlay al cerrar (backdrop
          y X no cerraban; mismo bug que hubo en CommandPalette). El cierre es inmediato y
          fiable; la animación de ENTRADA se conserva con initial/animate. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
          <motion.aside
            className="surface-grid glass absolute inset-y-0 left-0 flex w-64 flex-col rounded-none border-y-0 border-l-0 shadow-xl"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
          >
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </motion.aside>
        </div>
      )}

      <main className="flex min-h-screen flex-1 flex-col overflow-x-hidden">
        {/* Navbar superior fija */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/70 bg-background/70 px-4 py-3 backdrop-blur-xl md:px-8">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 md:hidden">
            <BrandMark />
            <span className="font-display text-sm font-bold">Calc3D</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <CommandPaletteButton />
            <RateBadge />
            <ThemeToggle withLabel />
          </div>
        </header>

        <PlanBanner />
        <VerifyEmailBanner />

        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
          <Outlet />
        </div>
      </main>

          <CommandPalette />
          <Toaster />
        </div>
      </ConfirmProvider>
    </TooltipProvider>
  );
}

/** Estado del plan: días de prueba restantes o aviso de vencimiento (solo lectura). */
function PlanBanner() {
  const { data } = usePlan();
  const s = data?.status;
  if (!s || (!s.isTrial && s.active)) return null; // plan pagado vigente → sin banner

  if (!s.active) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm md:px-8">
        <span className="font-semibold text-destructive">
          {s.isTrial ? 'Tu prueba terminó.' : 'Tu plan venció.'} Estás en solo lectura.
        </span>
        <span className="text-muted-foreground">Puedes ver y exportar tus datos, pero no crear ni editar.</span>
        <Link to="/settings" className="ml-auto font-semibold text-destructive underline">
          Renovar / reportar pago
        </Link>
      </div>
    );
  }

  // Trial vigente
  const urgent = s.daysLeft <= 3;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm md:px-8',
        urgent ? 'border-amber-500/40 bg-amber-500/10' : 'border-brand-blue/30 bg-brand-blue/[0.06]',
      )}
    >
      <span className={cn('font-semibold', urgent ? 'text-amber-600 dark:text-amber-400' : 'text-brand-blue-bright')}>
        Prueba gratis: {s.daysLeft} {s.daysLeft === 1 ? 'día' : 'días'} restantes.
      </span>
      <Link to="/settings" className="ml-auto font-semibold text-brand-yellow-ink underline">
        Ver planes
      </Link>
    </div>
  );
}

/** Aviso de correo sin verificar: entra igual, pero ciertas acciones se bloquean. */
function VerifyEmailBanner() {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user || user.emailVerified) return null;

  const resend = async () => {
    setBusy(true);
    try {
      await api.post('/auth/resend-verification');
      setSent(true);
    } catch {
      /* silencioso: no bloquea el uso de la app */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm md:px-8">
      <span className="text-amber-600 dark:text-amber-400">
        Verifica tu correo <strong>{user.email}</strong> para desbloquear acciones como compartir
        enlaces públicos e invitar a tu equipo.
      </span>
      {sent ? (
        <span className="font-semibold text-success">Correo reenviado ✓</span>
      ) : (
        <button
          onClick={resend}
          disabled={busy}
          className="font-semibold text-amber-600 underline hover:text-amber-600 dark:text-amber-400 disabled:opacity-50 dark:text-amber-400"
        >
          {busy ? 'Enviando…' : 'Reenviar correo'}
        </button>
      )}
    </div>
  );
}

/** Marca: cuadro azul con acento amarillo pulsante. */
function BrandMark() {
  return (
    <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-blue text-white shadow-glow-blue ring-1 ring-inset ring-white/10">
      <Box className="h-5 w-5" />
      <motion.span
        className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand-yellow ring-2 ring-background"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </span>
  );
}
