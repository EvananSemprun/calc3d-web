import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import type { ContactTypeDto } from '@calc3d/shared';
import { useContacts, CONTACT_TYPE, CONTACT_TYPE_OPTIONS } from '@/features/contacts/api';
import { Card, CardContent, TableSkeleton } from '@/components/ui';
import { PointsMap, type MapPoint } from '@/components/LeafletMap';

export function ContactsMapPage() {
  const navigate = useNavigate();
  const { data: contacts = [], isLoading } = useContacts();
  // Tipos activos (capas del mapa). Todos encendidos por defecto.
  const [active, setActive] = useState<Set<ContactTypeDto>>(
    () => new Set(CONTACT_TYPE_OPTIONS.map((o) => o.value)),
  );

  const points = useMemo<MapPoint[]>(
    () =>
      contacts
        .filter((c) => c.lat != null && c.lng != null && active.has(c.type))
        .map((c) => ({
          id: c.id,
          name: c.name,
          lat: c.lat as number,
          lng: c.lng as number,
          color: CONTACT_TYPE[c.type].color,
          subtitle: `${CONTACT_TYPE[c.type].label}${c.municipality ? ` · ${c.municipality}` : ''}`,
        })),
    [contacts, active],
  );

  const totalLocated = contacts.filter((c) => c.lat != null && c.lng != null).length;

  const toggle = (t: ContactTypeDto) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Mapa de contactos</h1>
            <p className="text-sm text-muted-foreground">
              {totalLocated} contacto{totalLocated === 1 ? '' : 's'} ubicado{totalLocated === 1 ? '' : 's'}. Filtra por tipo con las capas.
            </p>
          </div>
        </div>
        <Link to="/contacts" className="text-sm text-brand-yellow-ink hover:underline">
          ← Volver al directorio
        </Link>
      </div>

      {/* Capas / leyenda */}
      <div className="flex flex-wrap gap-2">
        {CONTACT_TYPE_OPTIONS.map((o) => {
          const on = active.has(o.value);
          const color = CONTACT_TYPE[o.value].color;
          const count = contacts.filter((c) => c.type === o.value && c.lat != null && c.lng != null).length;
          return (
            <button
              key={o.value}
              onClick={() => toggle(o.value)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                on ? 'border-transparent text-foreground' : 'border-border text-muted-foreground opacity-50'
              }`}
              style={on ? { background: `${color}22` } : undefined}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              {o.label} ({count})
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={4} cols={2} />
          ) : totalLocated === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground/50" />
              <p className="max-w-sm text-sm text-muted-foreground">
                Ningún contacto tiene ubicación todavía. Edita un contacto y haz click en el mapa para ubicarlo.
              </p>
            </div>
          ) : (
            <div className="h-[calc(100vh-16rem)] min-h-[420px]">
              <PointsMap points={points} onSelect={(id) => navigate(`/contacts/${id}`)} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
