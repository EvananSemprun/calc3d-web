import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Users, MapPin } from 'lucide-react';
import type { ContactTypeDto } from '@calc3d/shared';
import { api, apiErrorMessage } from '@/lib/api';
import { useContacts, CONTACT_TYPE, CONTACT_TYPE_OPTIONS, type Contact } from '@/features/contacts/api';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Field,
  Input,
  SearchInput,
  Select,
  SortHeader,
  Stat,
  TableSkeleton,
} from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { LocationPicker } from '@/components/LeafletMap';
import { usePersistentState } from '@/lib/usePersistentState';
import { useSortable } from '@/lib/useSortable';
import { notify } from '@/components/toast';

type Filter = 'ALL' | ContactTypeDto;

export function ContactsPage() {
  const { data: contacts = [], isLoading } = useContacts();
  const [filter, setFilter] = usePersistentState<Filter>('contacts:filter', 'ALL');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ contact: Contact | null } | null>(null);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      contacts.filter(
        (c) =>
          (filter === 'ALL' || c.type === filter) &&
          (!q ||
            [c.name, c.phone, c.rif, c.municipality, c.city].some((v) =>
              String(v ?? '').toLowerCase().includes(q),
            )),
      ),
    [contacts, filter, q],
  );
  const { sorted, sortKey, sortDir, toggle } = useSortable<Contact>(filtered, 'name');
  const sort = { sortKey, sortDir, toggle };
  const located = contacts.filter((c) => c.lat != null && c.lng != null).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="h-8 w-1 rounded-full bg-brand-yellow shadow-glow-sm" />
          <div>
            <h1 className="font-display text-2xl font-bold">Contactos</h1>
            <p className="text-sm text-muted-foreground">
              Clientes, proveedores, aliados y competencia. Tu directorio del negocio.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to="/map"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <MapPin className="h-4 w-4" /> Ver mapa
          </Link>
          <Button variant="accent" onClick={() => setModal({ contact: null })}>
            <Plus className="h-4 w-4" /> Nuevo contacto
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={String(contacts.length)} />
        <Stat label="Ubicados" value={String(located)} sub="en el mapa" />
        <Stat label="Clientes" value={String(contacts.filter((c) => c.type === 'CLIENT').length)} accent="yellow" />
        <Stat label="Proveedores" value={String(contacts.filter((c) => c.type === 'SUPPLIER').length)} />
      </div>

      {/* Buscador + filtro por tipo */}
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Buscar por nombre, teléfono, RIF o ciudad…"
        className="w-full sm:max-w-md"
      />
      <div className="flex flex-wrap gap-2">
        {(['ALL', ...CONTACT_TYPE_OPTIONS.map((o) => o.value)] as Filter[]).map((t) => {
          const on = filter === t;
          const label = t === 'ALL' ? 'Todos' : CONTACT_TYPE[t].label;
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                on ? 'bg-brand-yellow text-brand-yellow-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton cols={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              description={
                q
                  ? `Sin resultados para «${search.trim()}».`
                  : filter === 'ALL'
                    ? 'Sin contactos todavía. Agrega tu primer cliente, proveedor o aliado.'
                    : `Sin contactos de tipo ${CONTACT_TYPE[filter as ContactTypeDto].label}.`
              }
              action={
                !q && filter === 'ALL' ? (
                  <Button variant="accent" onClick={() => setModal({ contact: null })}>
                    <Plus className="h-4 w-4" /> Nuevo contacto
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Desktop: tabla ordenable */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <SortHeader<Contact> label="Nombre" sortKey="name" sort={sort} />
                      <SortHeader<Contact> label="Tipo" sortKey="type" sort={sort} />
                      <SortHeader<Contact> label="Teléfono" sortKey="phone" sort={sort} />
                      <SortHeader<Contact> label="Municipio / Ciudad" sortKey="municipality" sort={sort} />
                      <th className="px-4 py-2.5 text-center font-semibold">Mapa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((c) => (
                      <tr key={c.id} className="border-b border-border/70 transition-colors last:border-0 hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <Link to={`/contacts/${c.id}`} className="font-medium text-brand-yellow-ink hover:underline">
                            {c.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CONTACT_TYPE[c.type].color }} />
                            {CONTACT_TYPE[c.type].label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{c.phone ?? '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {[c.municipality, c.city].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {c.lat != null && c.lng != null ? (
                            <MapPin className="mx-auto h-4 w-4 text-success" />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Móvil: tarjetas apiladas */}
              <div className="divide-y divide-border/70 md:hidden">
                {sorted.map((c) => (
                  <Link
                    key={c.id}
                    to={`/contacts/${c.id}`}
                    className="flex items-center justify-between gap-3 p-4 hover:bg-accent/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-brand-yellow-ink">{c.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: CONTACT_TYPE[c.type].color }}
                        />
                        {CONTACT_TYPE[c.type].label}
                        {c.phone && <span>· {c.phone}</span>}
                        {(c.municipality || c.city) && (
                          <span>· {[c.municipality, c.city].filter(Boolean).join(' · ')}</span>
                        )}
                      </div>
                    </div>
                    {c.lat != null && c.lng != null && <MapPin className="h-4 w-4 shrink-0 text-success" />}
                  </Link>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {modal && <ContactModal contact={modal.contact} onClose={() => setModal(null)} />}
    </div>
  );
}

export function ContactModal({ contact, onClose }: { contact: Contact | null; onClose: () => void }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: existing = [] } = useContacts();
  const [form, setForm] = useState({
    name: contact?.name ?? '',
    type: contact?.type ?? ('CLIENT' as ContactTypeDto),
    phone: contact?.phone ?? '',
    rif: contact?.rif ?? '',
    municipality: contact?.municipality ?? '',
    city: contact?.city ?? '',
    address: contact?.address ?? '',
    notes: contact?.notes ?? '',
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    contact?.lat != null && contact?.lng != null ? { lat: contact.lat, lng: contact.lng } : null,
  );
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name || save.isPending) return;
    // Detección de duplicados (solo al crear): avisa si ya existe uno con ese nombre.
    if (!contact) {
      const dupe = existing.some((c) => c.name.trim().toLowerCase() === name.toLowerCase());
      if (
        dupe &&
        !(await confirm({
          title: `Ya existe un contacto llamado "${name}"`,
          description: '¿Crear otro contacto con el mismo nombre de todas formas?',
          confirmLabel: 'Crear de todas formas',
        }))
      ) {
        return;
      }
    }
    save.mutate();
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        phone: form.phone || null,
        rif: form.rif || null,
        municipality: form.municipality || null,
        city: form.city || null,
        address: form.address || null,
        notes: form.notes || null,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      };
      return contact
        ? api.patch(`/clients/${contact.id}`, payload)
        : api.post('/clients', payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['clients'] });
      notify.success(contact ? 'Contacto actualizado' : 'Contacto creado');
      onClose();
    },
    onError: (e) => notify.error(apiErrorMessage(e)),
  });

  return (
    <Dialog open onOpenChange={(n) => !n && onClose()} title={contact ? 'Editar contacto' : 'Nuevo contacto'}>
      <form className="space-y-3" onSubmit={submit}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" required>
            <Input autoFocus value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Nombre o negocio" />
          </Field>
          <Field label="Tipo">
            <Select value={form.type} onChange={(e) => set({ type: e.target.value as ContactTypeDto })}>
              {CONTACT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Teléfono">
            <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="0412…" />
          </Field>
          <Field label="RIF / C.I.">
            <Input value={form.rif} onChange={(e) => set({ rif: e.target.value })} />
          </Field>
          <Field label="Municipio">
            <Input
              value={form.municipality}
              onChange={(e) => set({ municipality: e.target.value })}
              placeholder="Ej. Chacao"
            />
          </Field>
          <Field label="Ciudad">
            <Input
              value={form.city}
              onChange={(e) => set({ city: e.target.value })}
              placeholder="Ej. Caracas"
            />
          </Field>
          <div className="col-span-2">
            <Field label="Dirección">
              <Input value={form.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
          </div>
        </div>
        <Field label="Notas">
          <Input value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium">Ubicación en el mapa</span>
            {coords ? (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={() => setCoords(null)}
              >
                Quitar
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">Haz click en el mapa para ubicarlo</span>
            )}
          </div>
          <LocationPicker value={coords} onChange={setCoords} color={CONTACT_TYPE[form.type].color} height={200} />
          {coords && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="accent" disabled={save.isPending || !form.name.trim()}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
