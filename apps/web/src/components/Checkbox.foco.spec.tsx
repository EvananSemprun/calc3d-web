import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from '@/components/ui';

/**
 * EL FOCO DE `Checkbox` — y, sobre todo, **LO QUE ESTE ARCHIVO NO PRUEBA**.
 *
 * ⚠️ **jsdom no aplica CSS.** No hay hoja de Tailwind, no se computan estilos y
 * no existe el concepto de "se ve". Un test que afirmara que el anillo de foco
 * aparece sería mentira, y uno que mirara la clase `peer-focus-visible:ring-2`
 * solo diría que ese texto está escrito: pasaría igual con la clase mal
 * escrita, con un token que no existe o con el `peer` borrado del input.
 * **Que el anillo se vea queda para la pasada visual en un navegador real.**
 *
 * Lo que SÍ se puede fijar acá es la PRECONDICIÓN de la que depende esa regla,
 * que es DOM y no estilo: `peer-*` de Tailwind compila a un selector de hermano
 * (`.peer:focus-visible ~ .caja`), que **no mira hacia atrás**. El input real
 * es `sr-only` —mide 1px y está recortado, así que su propio anillo no se ve— y
 * la caja es un `<span>` dibujado al lado. Envolver el input en un div, o
 * mandarlo después del span, apaga el anillo **sin que nada falle**: el
 * checkbox sigue funcionando, la suite sigue verde y el foco vuelve a ser
 * invisible, que es el bug que esto viene a cerrar.
 */
describe('Checkbox: foco por teclado', () => {
  it('el elemento que recibe el foco es el input, y es el hermano ANTERIOR de la caja', () => {
    render(<Checkbox checked onChange={() => {}} label="Recuérdame" />);
    const input = screen.getByRole('checkbox');

    // 1) El foco va al input de verdad (el `sr-only` no lo saca del DOM ni lo
    //    reemplaza por el span): es el elemento del que cuelga la regla.
    input.focus();
    expect(document.activeElement).toBe(input);

    // 2) Y la caja —identificada por lo que DIBUJA, el tilde, no por su clase—
    //    es su hermano siguiente. Si esto cambia, el selector de Tailwind deja
    //    de alcanzarla.
    const caja = input.nextElementSibling;
    expect(caja?.tagName).toBe('SPAN');
    expect(caja?.querySelector('svg')).not.toBeNull();
    expect(input.classList.contains('peer')).toBe(true);
  });

  it('quien llega por teclado llega a un control CON NOMBRE, y que responde', () => {
    // Lo que jsdom sí sabe calcular: el nombre accesible (sale de la etiqueta
    // que envuelve al input) y que el control no esté escondido del árbol de
    // accesibilidad. Un foco visible sobre un control sin nombre no sirve de
    // nada: se ve dónde estás, no qué vas a marcar.
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="Solo inversión" />);
    const input = screen.getByRole('checkbox', { name: 'Solo inversión' });
    expect(input).not.toBeChecked();

    fireEvent.click(input);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
