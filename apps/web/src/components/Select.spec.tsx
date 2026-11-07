import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from './ui';

/** `n` opciones "Opción 0..n-1" con valor "v0..vn-1". */
function opciones(n: number) {
  return Array.from({ length: n }, (_, i) => (
    <option key={i} value={`v${i}`}>
      {`Opción ${i}`}
    </option>
  ));
}

const abrir = (nombre: string) =>
  fireEvent.keyDown(screen.getByRole('combobox', { name: nombre }), { key: 'Enter' });

describe('Select (primitivo)', () => {
  it('abre, filtra con el buscador y al elegir una opción se CIERRA', () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="prueba" value="v0" onChange={onChange}>
        {opciones(10)}
      </Select>,
    );
    abrir('prueba');

    // Con ≥8 opciones aparece el buscador (el desplegable está ABIERTO).
    expect(screen.getByLabelText('Buscar en la lista')).toBeInTheDocument();

    // Filtra sin acentos/mayúsculas.
    fireEvent.change(screen.getByLabelText('Buscar en la lista'), {
      target: { value: 'opcion 7' },
    });
    expect(screen.getByText('Opción 7')).toBeInTheDocument();
    expect(screen.queryByText('Opción 3')).not.toBeInTheDocument();

    // ⚠️ `mouseDown` y no `click`: la opción se elige en el mousedown porque el
    // click llega DESPUÉS del blur, cuando el cierre por "clic afuera" ya se la
    // comió. Si alguien lo pasa a `onClick`, este test se cae.
    fireEvent.mouseDown(screen.getByText('Opción 7'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: 'v7' }) }),
    );
    expect(screen.queryByLabelText('Buscar en la lista')).not.toBeInTheDocument();
  });

  it('con pocas opciones NO muestra buscador', () => {
    render(
      <Select aria-label="corto" value="v0" onChange={() => {}}>
        {opciones(3)}
      </Select>,
    );
    abrir('corto');
    expect(screen.queryByLabelText('Buscar en la lista')).not.toBeInTheDocument();
  });

  /**
   * ⚠️ EL BUG DEL TECLADO EN EL TELÉFONO (2026-11-07).
   *
   * Con Radix Select, filtrar desmontaba la opción resaltada y Radix se
   * llevaba el foco del buscador al contenedor: en un teléfono eso cierra el
   * teclado y hay que volver a tocar el campo letra por letra.
   *
   * jsdom NO reproduce ese robo —por eso el test viejo daba verde con el bug
   * puesto—; la prueba de verdad fue medir en el navegador a 390×844. Lo que
   * estos tests SÍ amarran es la estructura que lo hace imposible: que la
   * variante con buscador no sea un Radix Select y que la lista cuelgue del
   * sitio correcto. Si alguien vuelve a montarla sobre Radix, se caen.
   */
  it('el buscador se queda con el foco al abrir y al filtrar', () => {
    render(
      <Select aria-label="foco" value="v0" onChange={() => {}}>
        {opciones(12)}
      </Select>,
    );
    abrir('foco');
    const buscador = screen.getByLabelText('Buscar en la lista');
    expect(document.activeElement).toBe(buscador);

    fireEvent.change(buscador, { target: { value: 'opcion 1' } });
    expect(document.activeElement).toBe(buscador);
    fireEvent.change(buscador, { target: { value: 'opcion 11' } });
    expect(document.activeElement).toBe(buscador);
  });

  it('la lista NO la dibuja Radix: es propia', () => {
    render(
      <Select aria-label="propia" value="v0" onChange={() => {}}>
        {opciones(12)}
      </Select>,
    );
    abrir('propia');
    expect(document.querySelector('[data-radix-popper-content-wrapper]')).toBeNull();
  });

  /**
   * Las DOS reglas de dónde se dibuja la lista, que son opuestas y por eso
   * este bug vuelve si se elige una sola para toda la app:
   *
   * - En una PÁGINA cuelga de `body`, porque las `Card` traen `overflow` y la
   *   recortarían a la mitad.
   * - Dentro de un MODAL cuelga DEL MODAL, porque el focus trap de Radix
   *   Dialog le devuelve el foco al botón si la lista vive fuera de su ámbito
   *   (medido), que es el mismo bug del teclado por la otra puerta. El cuerpo
   *   del modal scrollea pero su contenedor no recorta, así que ahí se ve
   *   entera igual.
   */
  it('en una página la lista cuelga de body (si no, la Card la recorta)', () => {
    render(
      <Select aria-label="pagina" value="v0" onChange={() => {}}>
        {opciones(12)}
      </Select>,
    );
    abrir('pagina');
    const lista = screen.getByRole('listbox');
    expect(lista.closest('[role="dialog"]')).toBeNull();
    // El panel es hijo directo de body: nada arriba puede recortarlo.
    expect(lista.parentElement?.parentElement).toBe(document.body);
  });

  it('dentro de un modal la lista cuelga DEL MODAL (si no, pierde el foco)', () => {
    render(
      <div role="dialog">
        <Select aria-label="enmodal" value="v0" onChange={() => {}}>
          {opciones(12)}
        </Select>
      </div>,
    );
    abrir('enmodal');
    const lista = screen.getByRole('listbox');
    expect(lista.closest('[role="dialog"]')).not.toBeNull();
  });

  it('Escape cierra la lista y NO llega al modal que la contiene', () => {
    const escapeDelModal = vi.fn();
    render(
      <div role="dialog" onKeyDown={escapeDelModal}>
        <Select aria-label="escape" value="v0" onChange={() => {}}>
          {opciones(12)}
        </Select>
      </div>,
    );
    abrir('escape');
    // El Enter que abre también sube al modal: lo que se mide es el Escape.
    escapeDelModal.mockClear();
    fireEvent.keyDown(screen.getByLabelText('Buscar en la lista'), { key: 'Escape' });
    expect(screen.queryByLabelText('Buscar en la lista')).not.toBeInTheDocument();
    // Si el Escape subiera, el modal entero se cerraría y perderías el formulario.
    expect(escapeDelModal).not.toHaveBeenCalled();
  });
});
