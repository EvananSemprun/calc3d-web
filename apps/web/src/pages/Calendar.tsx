import { useMemo, useState } from 'react';
import { todayKey } from '@/lib/today';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { useOrders, ORDER_STATUS } from '@/features/orders/api';
import { Button, Card, CardContent } from '@/components/ui';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** yyyy-mm-dd de una fecha (en UTC, como se guarda deliveryDate). */
const dayKey = (iso: string) => iso.slice(0, 10);

export function CalendarPage() {
  const navigate = useNavigate();
  const { data: orders = [] } = useOrders();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() }; // month 0..11
  });

  // Pedidos con fecha de entrega, agrupados por día.
  const byDay = useMemo(() => {
    const map = new Map<string, typeof orders>();
    for (const o of orders) {
      if (!o.deliveryDate) continue;
      const k = dayKey(o.deliveryDate);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(o);
    }
    return map;
  }, [orders]);

  // Celdas del mes: alineadas a lunes.
  const cells = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
    const startOffset = (first.getUTCDay() + 6) % 7; // lunes = 0
    const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    const out: ({ day: number; key: string } | null)[] = [];
    for (let i = 0; i < startOffset; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({ day: d, key });
    }
    return out;
  }, [cursor]);

  const move = (delta: number) => {
    setCursor((c) => {
      const m = c.month + delta;
      return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  };

  // En la zona del USUARIO: en UTC, de noche, marcaba el día siguiente.
  const hoy = todayKey();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Calendario de entregas</h1>
            <p className="text-sm text-muted-foreground">Tus pedidos por fecha de entrega.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => move(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[160px] text-center font-display font-semibold capitalize">
            {MONTHS[cursor.month]} {cursor.year}
          </span>
          <Button variant="outline" size="icon" onClick={() => move(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((cell, i) => {
              if (!cell) return <div key={i} className="min-h-[84px] rounded-lg" />;
              const dayOrders = byDay.get(cell.key) ?? [];
              const isToday = cell.key === hoy;
              return (
                <div
                  key={i}
                  className={
                    'min-h-[84px] rounded-lg border p-1.5 text-left ' +
                    (isToday ? 'border-brand-yellow/60 bg-brand-yellow/[0.06]' : 'border-border bg-card')
                  }
                >
                  <div className={'mb-1 text-xs font-semibold ' + (isToday ? 'text-brand-yellow-ink' : 'text-muted-foreground')}>
                    {cell.day}
                  </div>
                  <div className="space-y-1">
                    {dayOrders.slice(0, 3).map((o) => (
                      <button
                        key={o.id}
                        onClick={() => navigate(`/orders/${o.id}`)}
                        className="block w-full truncate rounded bg-brand-blue/15 px-1.5 py-0.5 text-left text-[11px] hover:bg-brand-blue/25"
                        title={`#${o.code} ${o.client?.name} — ${ORDER_STATUS[o.status].label}`}
                      >
                        <span className={ORDER_STATUS[o.status].tone}>#{o.code}</span> {o.client?.name}
                      </button>
                    ))}
                    {dayOrders.length > 3 && (
                      <div className="px-1 text-[10px] text-muted-foreground">+{dayOrders.length - 3} más</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {orders.filter((o) => o.deliveryDate).length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <CalendarDays className="h-8 w-8 text-brand-blue-bright" />
            <p className="text-sm text-muted-foreground">
              Ningún pedido tiene fecha de entrega todavía. Agrégala en el detalle del pedido.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
