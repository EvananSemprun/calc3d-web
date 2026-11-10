import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * EL ESCAPE CIERRA EL DESPLEGABLE, NO EL MODAL.
 *
 * Abres una lista dentro de un diálogo, aprietas Escape y se cierra **el
 * diálogo entero**: pierdes todo lo que estabas cargando.
 *
 * ⚠️ **ESTE ARCHIVO MONTA EL `Dialog` DE VERDAD, y es lo único que importa.**
 * Quien escucha el Escape es el `DismissableLayer` interno de Radix, en
 * `document` y en fase de **captura**; React engancha sus `onKeyDown` en el
 * contenedor raíz y en fase de **burbuja**, o sea después. Un
 * `stopPropagation()` del desplegable no puede cancelar un listener que YA
 * corrió, así que con un `<div role="dialog" onKeyDown={...}>` de mentira
 * —un handler en burbuja, lo único que `stopPropagation` sí frena— el test
 * da verde mientras el bug está vivo. Eso es exactamente lo que pasó con el
 * test que vivía en `Select.spec.tsx` hasta el 2026-11-10.
 *
 * Lo que de verdad cierra el agujero es que el `Dialog` llame a
 * `preventDefault()` dentro de `onEscapeKeyDown` cuando tiene un desplegable
 * abierto adentro: es lo ÚNICO que Radix mira antes de cerrarse.
 */

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn(), patch: vi.fn() }));

// Se dobla el cliente axios y nada más: el `Dialog`, el `Select` y el
// `Combobox` son los de verdad, que es el punto de todo este archivo.
vi.mock('@/lib/api', () => ({
  api: { get: mocks.get, post: mocks.post, delete: mocks.del, patch: mocks.patch },
  apiErrorMessage: () => 'falló',
  downloadFile: vi.fn(),
  getToken: () => null,
}));

const { Dialog } = await import('@/components/overlays');
const { Select } = await import('@/components/ui');
const { Combobox } = await import('@/components/Combobox');

beforeEach(() => {
  mocks.get.mockResolvedValue({ data: [] });
});

/** `n` opciones: con 8 o más, el `Select` usa la variante con buscador. */
const opciones = (n: number) =>
  Array.from({ length: n }, (_, i) => (
    <option key={i} value={`v${i}`}>
      {`Opción ${i}`}
    </option>
  ));

/** El `Dialog` real, controlado por el padre igual que en toda la app. */
function Modal({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = React.useState(true);
  const [cliente] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={cliente}>
      <Dialog open={abierto} onOpenChange={setAbierto} title="Nuevo encargo">
        {children}
      </Dialog>
    </QueryClientProvider>
  );
}

const hayModal = () => screen.queryByRole('dialog') != null;
const abrirPorTeclado = (nombre: string) =>
  fireEvent.keyDown(screen.getByRole('combobox', { name: nombre }), { key: 'Enter' });
const buscadorDelSelect = () => screen.queryByLabelText('Buscar en la lista');
const buscadorDelCombobox = () => screen.queryByPlaceholderText('Buscar o escribir…');
/** El Escape que llega al modal sin pasar por ningún desplegable. */
const escapeEnElModal = () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

describe('Escape dentro de un modal', () => {
  describe('Select con buscador', () => {
    it('con el desplegable ABIERTO, Escape cierra SOLO el desplegable y el diálogo sigue', () => {
      render(
        <Modal>
          <Select aria-label="Cliente" value="v0" onChange={() => {}}>
            {opciones(10)}
          </Select>
        </Modal>,
      );
      abrirPorTeclado('Cliente');
      expect(buscadorDelSelect()).toBeInTheDocument();

      fireEvent.keyDown(buscadorDelSelect()!, { key: 'Escape' });

      expect(buscadorDelSelect()).not.toBeInTheDocument();
      // Lo que se perdía: el formulario entero.
      expect(hayModal()).toBe(true);
    });

    it('con el desplegable CERRADO, Escape SÍ cierra el diálogo', () => {
      render(
        <Modal>
          <Select aria-label="Cliente" value="v0" onChange={() => {}}>
            {opciones(10)}
          </Select>
        </Modal>,
      );
      expect(hayModal()).toBe(true);

      escapeEnElModal();

      expect(hayModal()).toBe(false);
    });

    it('después de cerrar el desplegable, el Escape siguiente cierra el diálogo', () => {
      render(
        <Modal>
          <Select aria-label="Cliente" value="v0" onChange={() => {}}>
            {opciones(10)}
          </Select>
        </Modal>,
      );
      abrirPorTeclado('Cliente');
      fireEvent.keyDown(buscadorDelSelect()!, { key: 'Escape' });
      expect(hayModal()).toBe(true);

      // Si el registro no se limpiara al cerrar la lista, el modal quedaría
      // imposible de cerrar con el teclado: el bug opuesto, igual de molesto.
      escapeEnElModal();

      expect(hayModal()).toBe(false);
    });
  });

  describe('Combobox', () => {
    it('con el desplegable ABIERTO, Escape cierra SOLO el desplegable y el diálogo sigue', () => {
      render(
        <Modal>
          <Combobox kind="MATERIAL_BRAND" value="" onChange={() => {}} aria-label="Marca" />
        </Modal>,
      );
      fireEvent.click(screen.getByRole('combobox', { name: 'Marca' }));
      expect(buscadorDelCombobox()).toBeInTheDocument();

      fireEvent.keyDown(buscadorDelCombobox()!, { key: 'Escape' });

      expect(buscadorDelCombobox()).not.toBeInTheDocument();
      expect(hayModal()).toBe(true);
    });

    it('con el desplegable CERRADO, Escape SÍ cierra el diálogo', () => {
      render(
        <Modal>
          <Combobox kind="MATERIAL_BRAND" value="" onChange={() => {}} aria-label="Marca" />
        </Modal>,
      );
      expect(buscadorDelCombobox()).not.toBeInTheDocument();

      escapeEnElModal();

      expect(hayModal()).toBe(false);
    });
  });

  /**
   * ⚠️ El registro es una PILA, no un booleano: con dos desplegables abiertos,
   * un solo Escape no puede dejar al modal sin protección para el segundo.
   * Con un `boolean` que se apaga al primer cierre, el Escape que cierra la
   * segunda lista se llevaría el formulario — justo el bug, más difícil de
   * reproducir a mano.
   */
  it('con DOS desplegables abiertos, cada Escape cierra uno y el diálogo aguanta los dos', () => {
    render(
      <Modal>
        <Select aria-label="Cliente" value="v0" onChange={() => {}}>
          {opciones(10)}
        </Select>
        <Combobox kind="MATERIAL_BRAND" value="" onChange={() => {}} aria-label="Marca" />
      </Modal>,
    );
    abrirPorTeclado('Cliente');
    // `click` y no `mouseDown`: el cierre por «clic afuera» del Select escucha
    // el mousedown, y acá las dos listas tienen que quedar abiertas a la vez.
    fireEvent.click(screen.getByRole('combobox', { name: 'Marca' }));
    expect(buscadorDelSelect()).toBeInTheDocument();
    expect(buscadorDelCombobox()).toBeInTheDocument();

    fireEvent.keyDown(buscadorDelCombobox()!, { key: 'Escape' });
    expect(buscadorDelCombobox()).not.toBeInTheDocument();
    expect(buscadorDelSelect()).toBeInTheDocument();
    expect(hayModal()).toBe(true);

    fireEvent.keyDown(buscadorDelSelect()!, { key: 'Escape' });
    expect(buscadorDelSelect()).not.toBeInTheDocument();
    expect(hayModal()).toBe(true);

    escapeEnElModal();
    expect(hayModal()).toBe(false);
  });

  /**
   * El Escape del modal cierra la lista aunque el foco se haya ido de ella.
   * Es el agujero que deja un registro que solo cuenta: el modal no se cierra
   * (bien) pero nadie cierra la lista, y la tecla no hace NADA. Alcanzable con
   * un Tab: el `Combobox` no se cierra al perder el foco.
   */
  it('el Escape cierra la lista aunque el foco ya no esté dentro de ella', () => {
    render(
      <Modal>
        <Combobox kind="MATERIAL_BRAND" value="" onChange={() => {}} aria-label="Marca" />
      </Modal>,
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Marca' }));
    expect(buscadorDelCombobox()).toBeInTheDocument();

    escapeEnElModal();

    expect(buscadorDelCombobox()).not.toBeInTheDocument();
    expect(hayModal()).toBe(true);
  });
});
