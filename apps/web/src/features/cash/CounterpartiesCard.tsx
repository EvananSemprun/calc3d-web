import { useState } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  EmptyState,
  Field,
  FieldGrid,
  Input,
  Select,
  TableSkeleton,
} from '@/components/ui';
import { Dialog, useConfirm } from '@/components/overlays';
import { notify } from '@/components/toast';
import { apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  useCounterparties,
  useDeleteCounterparty,
  useSaveCounterparty,
  useSetDefaultCounterparty,
  type Counterparty,
  type CounterpartyKind,
} from './api';

/** El nombre de cada tipo, en UN solo lugar. */
const TIPO: Record<CounterpartyKind, string> = {
  OWNER: 'Propietario',
  PARTNER: 'Socio',
  EXTERNAL_LENDER: 'Prestamista externo',
};

/**
 * Lo que cambia según el tipo, dicho donde se toma la decisión (el select) y
 * no en la documentación: es la única diferencia que el dueño tiene que
 * entender para elegir bien.
 */
const QUE_SE_LE_DEBE: Record<CounterpartyKind, string> = {
  OWNER: 'Se le debe cada compra que pagó de su bolsillo.',
  PARTNER: 'Se le debe cada compra que pagó de su bolsillo.',
  EXTERNAL_LENDER: 'Se le debe el saldo de su préstamo, no las compras.',
};

type Borrador = { name: string; kind: CounterpartyKind; notes: string; active: boolean };

const VACIO: Borrador = { name: '', kind: 'OWNER', notes: '', active: true };

/**
 * CONTRAPARTES — quién pone plata en el negocio y a quién se le debe.
 *
 * Sin esta tarjeta, un negocio que no sea el del dueño original tendría que
 * tocar SQL para que la Caja sepa a quién se le debe.
 *
 * ⚠️ Los errores los escribe el SERVIDOR (409 con el nombre y el motivo:
 * "tiene 3 movimiento(s) de caja", "es la única contraparte propietaria"…).
 * Se muestran tal cual con `apiErrorMessage`: un "no se pudo" genérico deja al
 * dueño trabado sin saber qué hacer.
 */
export function CounterpartiesCard() {
  const { data, isLoading } = useCounterparties();
  const guardar = useSaveCounterparty();
  const borrar = useDeleteCounterparty();
  const porDefecto = useSetDefaultCounterparty();
  const confirm = useConfirm();

  // `null` = cerrado. Con contraparte = edición; con `undefined` = alta nueva.
  const [editando, setEditando] = useState<Counterparty | null | undefined>(null);
  const [form, setForm] = useState<Borrador>(VACIO);

  const abierto = editando !== null;
  const set = (parche: Partial<Borrador>) => setForm((f) => ({ ...f, ...parche }));

  const abrirAlta = () => {
    setForm(VACIO);
    setEditando(undefined);
  };

  const abrirEdicion = (c: Counterparty) => {
    setForm({ name: c.name, kind: c.kind, notes: c.notes ?? '', active: c.active });
    setEditando(c);
  };

  const cerrar = () => setEditando(null);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    guardar.mutate(
      {
        id: editando?.id,
        name,
        kind: form.kind,
        active: form.active,
        notes: form.notes.trim() || null,
      },
      {
        onSuccess: () => {
          notify.success(editando ? 'Contraparte actualizada' : 'Contraparte creada');
          cerrar();
        },
        onError: (err) => notify.error(apiErrorMessage(err)),
      },
    );
  };

  const eliminar = async (c: Counterparty) => {
    const ok = await confirm({
      title: `¿Borrar a ${c.name}?`,
      description: 'Si ya tiene movimientos de caja, el servidor no va a dejar borrarla.',
      confirmLabel: 'Borrar',
      tone: 'destructive',
    });
    if (!ok) return;
    borrar.mutate(c.id, {
      onSuccess: () => notify.success(`${c.name} ya no está`),
      onError: (err) => notify.error(apiErrorMessage(err)),
    });
  };

  const marcarPorDefecto = (c: Counterparty) =>
    porDefecto.mutate(c.id, {
      onSuccess: () => notify.success(`Ahora la caja le debe a ${c.name} por defecto`),
      onError: (err) => notify.error(apiErrorMessage(err)),
    });

  const lista = data ?? [];

  const botonNueva = (
    <Button variant="accent" size="sm" onClick={abrirAlta}>
      <Plus className="h-4 w-4" /> Nueva contraparte
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Contrapartes</CardTitle>
            <p className="text-sm text-muted-foreground">
              Quién pone plata en el negocio y a quién se le debe: vos, un socio o un prestamista
              de afuera.
            </p>
          </div>
          {botonNueva}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading ? (
          <TableSkeleton rows={3} cols={2} />
        ) : lista.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Todavía no hay contrapartes"
            description="Anotá al menos al propietario: es a quien la caja le debe lo que pagó de su bolsillo."
            action={botonNueva}
          />
        ) : (
          <ul className="space-y-2">
            {lista.map((c) => (
              <li
                key={c.id}
                className={cn(
                  'rounded-lg border border-border bg-card p-3',
                  !c.active && 'opacity-60',
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="font-semibold">{c.name}</span>
                  <Badge variant="outline">{TIPO[c.kind]}</Badge>
                  {c.isDefault && <Badge variant="success">Por defecto</Badge>}
                  {!c.active && <Badge variant="warning">Inactiva</Badge>}

                  <div className="ml-auto flex items-center gap-1">
                    {!c.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Poner a ${c.name} por defecto`}
                        disabled={porDefecto.isPending}
                        onClick={() => marcarPorDefecto(c)}
                      >
                        Usar por defecto
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${c.name}`}
                      onClick={() => abrirEdicion(c)}
                    >
                      <Pencil className="h-4 w-4 text-brand-yellow-ink" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Borrar ${c.name}`}
                      onClick={() => eliminar(c)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {c.notes && <p className="mt-1.5 text-xs text-muted-foreground">{c.notes}</p>}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          A un propietario o a un socio se le debe cada compra que pagó de su bolsillo. A un
          prestamista externo se le debe el saldo de su préstamo, no las compras.
        </p>
      </CardContent>

      {abierto && (
        <Dialog
          open
          onOpenChange={(n) => !n && cerrar()}
          title={editando ? `Editar ${editando.name}` : 'Nueva contraparte'}
        >
          <form className="space-y-3" onSubmit={enviar}>
            <FieldGrid min="11rem" className="gap-3">
              <Field label="Nombre" required>
                <Input
                  autoFocus
                  value={form.name}
                  maxLength={80}
                  placeholder="Ej. Ana, Banco del tío"
                  onChange={(e) => set({ name: e.target.value })}
                />
              </Field>
              <Field label="Tipo" hint={QUE_SE_LE_DEBE[form.kind]}>
                <Select
                  value={form.kind}
                  onChange={(e) => set({ kind: e.target.value as CounterpartyKind })}
                >
                  {(Object.keys(TIPO) as CounterpartyKind[]).map((k) => (
                    <option key={k} value={k}>
                      {TIPO[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="col-span-full">
                <Field label="Notas">
                  <Input
                    value={form.notes}
                    maxLength={500}
                    placeholder="Opcional"
                    onChange={(e) => set({ notes: e.target.value })}
                  />
                </Field>
              </div>
            </FieldGrid>

            <Checkbox
              checked={form.active}
              onChange={(active) => set({ active })}
              label="Activa"
            />
            <p className="text-xs text-muted-foreground">
              Una contraparte desactivada no se puede elegir en movimientos nuevos, pero su
              historial queda.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={cerrar}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="accent"
                disabled={guardar.isPending || !form.name.trim()}
              >
                {guardar.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </Card>
  );
}
