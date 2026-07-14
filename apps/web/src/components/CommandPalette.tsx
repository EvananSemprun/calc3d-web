import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  CornerDownLeft,
  Calculator,
  LayoutDashboard,
  TrendingUp,
  Receipt,
  FileText,
  Package,
  CalendarDays,
  HandCoins,
  Megaphone,
  Boxes,
  Box,
  Printer,
  Puzzle,
  Users,
  MapPin,
  Truck,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Cmd {
  key: string;
  group: string;
  label: string;
  sub?: string;
  to: string;
  icon: LucideIcon;
}

/** Páginas de la app: buscador rápido tipo "ir a…". */
const PAGES: Cmd[] = [
  { key: 'p-calc', group: 'Ir a', label: 'Calculadora', to: '/', icon: Calculator },
  { key: 'p-dash', group: 'Ir a', label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { key: 'p-sales', group: 'Ir a', label: 'Ventas', to: '/sales', icon: TrendingUp },
  { key: 'p-exp', group: 'Ir a', label: 'Gastos', to: '/expenses', icon: Receipt },
  { key: 'p-quotes', group: 'Ir a', label: 'Presupuestos', to: '/quotes', icon: FileText },
  { key: 'p-orders', group: 'Ir a', label: 'Pedidos', to: '/orders', icon: Package },
  { key: 'p-cal', group: 'Ir a', label: 'Calendario', to: '/calendar', icon: CalendarDays },
  { key: 'p-recv', group: 'Ir a', label: 'Por cobrar', to: '/receivables', icon: HandCoins },
  { key: 'p-camp', group: 'Ir a', label: 'Publicidad', to: '/campaigns', icon: Megaphone },
  { key: 'p-contacts', group: 'Ir a', label: 'Contactos', to: '/contacts', icon: Users },
  { key: 'p-map', group: 'Ir a', label: 'Mapa', to: '/map', icon: MapPin },
  { key: 'p-products', group: 'Ir a', label: 'Productos', to: '/products', icon: Boxes },
  { key: 'p-mat', group: 'Ir a', label: 'Materiales', to: '/catalogs/materials', icon: Box },
  { key: 'p-print', group: 'Ir a', label: 'Impresoras', to: '/catalogs/printers', icon: Printer },
  { key: 'p-comp', group: 'Ir a', label: 'Insumos', to: '/catalogs/components', icon: Puzzle },
  { key: 'p-prov', group: 'Ir a', label: 'Proveedores', to: '/catalogs/providers', icon: Truck },
  { key: 'p-settings', group: 'Ir a', label: 'Configuración', to: '/settings', icon: SettingsIcon },
];

/** Normaliza para comparar sin distinguir mayúsculas ni acentos. */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const MAX_PER_GROUP = 6;

/** Buscador global (⌘/Ctrl-K): cruza páginas, contactos, pedidos, presupuestos,
 *  productos y campañas ya cacheados en el cliente, y navega al resultado. */
export function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Fetch perezoso: las listas solo se piden cuando el palette se abre por 1.ª vez.
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Atajo global de apertura (⌘K / Ctrl-K) y cierre (Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setOpened(true);
      setQuery('');
      setActive(0);
      // Enfoca el input tras montar el overlay.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const clients = useQuery<{ id: string; name: string; type: string; phone: string | null }[]>({
    queryKey: ['clients'],
    queryFn: async () => (await api.get('/clients')).data,
    enabled: opened,
  });
  const orders = useQuery<{ id: string; code: number; status: string; client: { name: string } | null }[]>({
    queryKey: ['orders'],
    queryFn: async () => (await api.get('/orders')).data,
    enabled: opened,
  });
  const quotes = useQuery<{ id: string; name: string; client?: { name: string } | null }[]>({
    queryKey: ['quotes'],
    queryFn: async () => (await api.get('/quotes')).data,
    enabled: opened,
  });
  const products = useQuery<{ id: string; name: string }[]>({
    queryKey: ['products'],
    queryFn: async () => (await api.get('/products')).data,
    enabled: opened,
  });
  const campaigns = useQuery<{ id: string; name: string }[]>({
    queryKey: ['campaigns'],
    queryFn: async () => (await api.get('/campaigns')).data,
    enabled: opened,
  });

  // Índice completo de comandos (páginas + entidades).
  const all = useMemo<Cmd[]>(() => {
    const items: Cmd[] = [...PAGES];
    for (const c of clients.data ?? [])
      items.push({ key: `c-${c.id}`, group: 'Contactos', label: c.name, sub: c.phone ?? undefined, to: `/contacts/${c.id}`, icon: Users });
    for (const o of orders.data ?? [])
      items.push({ key: `o-${o.id}`, group: 'Pedidos', label: `#${o.code} · ${o.client?.name ?? 'Sin cliente'}`, sub: o.status, to: `/orders/${o.id}`, icon: Package });
    for (const q of quotes.data ?? [])
      items.push({ key: `q-${q.id}`, group: 'Presupuestos', label: q.name, sub: q.client?.name ?? undefined, to: `/quotes/${q.id}`, icon: FileText });
    for (const p of products.data ?? [])
      items.push({ key: `pr-${p.id}`, group: 'Productos', label: p.name, to: `/products/${p.id}`, icon: Boxes });
    for (const c of campaigns.data ?? [])
      items.push({ key: `cm-${c.id}`, group: 'Publicidad', label: c.name, to: `/campaigns/${c.id}`, icon: Megaphone });
    return items;
  }, [clients.data, orders.data, quotes.data, products.data, campaigns.data]);

  // Resultado filtrado, agrupado y con tope por grupo.
  const results = useMemo<Cmd[]>(() => {
    const q = norm(query.trim());
    // Sin texto: solo las páginas (launcher rápido).
    const pool = q === '' ? PAGES : all.filter((it) => norm(`${it.label} ${it.sub ?? ''}`).includes(q));
    const byGroup = new Map<string, Cmd[]>();
    for (const it of pool) {
      const arr = byGroup.get(it.group) ?? [];
      if (arr.length < MAX_PER_GROUP) arr.push(it);
      byGroup.set(it.group, arr);
    }
    return [...byGroup.values()].flat();
  }, [query, all]);

  // Mantén el índice activo dentro de rango y visible.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (cmd: Cmd | undefined) => {
    if (!cmd) return;
    setOpen(false);
    navigate(cmd.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (results.length ? (a + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  // Encabezados de grupo: se pintan cuando cambia el grupo respecto al item previo.
  let lastGroup = '';

  // Render condicional directo (sin AnimatePresence): el cierre es inmediato y
  // fiable; la animación de entrada se mantiene con initial/animate.
  if (!open) return null;

  return (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Buscador">
          <motion.div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          />
          <motion.div
            className="glass surface-grid absolute left-1/2 top-[12vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border shadow-glow-lg"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-border/70 px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar páginas, contactos, pedidos, presupuestos…"
                aria-label="Buscar en toda la app"
                role="combobox"
                aria-expanded
                aria-controls="cmd-list"
                aria-activedescendant={results.length ? `cmd-opt-${active}` : undefined}
                className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground sm:block">
                Esc
              </kbd>
            </div>

            <div ref={listRef} id="cmd-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
              {results.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Nada coincide con «{query}».
                </div>
              ) : (
                results.map((cmd, idx) => {
                  const header = cmd.group !== lastGroup ? cmd.group : null;
                  lastGroup = cmd.group;
                  const isActive = idx === active;
                  return (
                    <div key={cmd.key}>
                      {header && (
                        <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                          {header}
                        </div>
                      )}
                      <button
                        type="button"
                        data-idx={idx}
                        id={`cmd-opt-${idx}`}
                        role="option"
                        aria-selected={isActive}
                        onClick={() => go(cmd)}
                        onMouseMove={() => setActive(idx)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                          isActive ? 'bg-brand-blue/15 text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        <cmd.icon className={cn('h-4 w-4 shrink-0', isActive && 'text-brand-yellow-ink')} />
                        <span className="flex-1 truncate text-foreground">{cmd.label}</span>
                        {cmd.sub && <span className="shrink-0 truncate text-xs text-muted-foreground">{cmd.sub}</span>}
                        {isActive && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
  );
}

/** Botón de la barra superior que abre el buscador (dispara ⌘/Ctrl-K). */
export function CommandPaletteButton() {
  const fire = () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  return (
    <button
      onClick={fire}
      aria-label="Buscar (Ctrl K)"
      className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/40 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Buscar…</span>
      <kbd className="hidden rounded border border-border px-1 py-0.5 text-[10px] sm:inline">Ctrl K</kbd>
    </button>
  );
}
