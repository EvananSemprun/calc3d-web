import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox, SearchInput, SortHeader, Switch } from '@/components/ui';

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

/**
 * EL FOCO DE `Switch`, `SearchInput` Y `SortHeader` (2026-10-11).
 *
 * Los tres usaban el contorno por defecto del navegador en vez del anillo de
 * la casa. No era foco invisible —se veía algo— pero sí era el único lugar de
 * la app donde el foco se dibujaba distinto, y eso enseña a no mirarlo.
 *
 * ⚠️ **Lo que este archivo NO prueba, otra vez: que el anillo se vea.** jsdom
 * no aplica CSS. Afirmar la clase `focus-visible:ring-2` solo diría que ese
 * texto está escrito, y pasaría igual con un token inexistente. Verificado a
 * mano en un navegador real, navegando con Tab, en los dos temas: claro dibuja
 * el anillo azul (`rgb(0,79,153)`) sobre 2px de fondo, oscuro el dorado
 * (`rgb(255,195,0)`).
 *
 * Lo que SÍ se fija acá es la precondición que es DOM y no estilo: los tres
 * tienen que seguir siendo **`<button>` de verdad y con nombre accesible**. El
 * día que alguien los convierta en un `<div onClick>` —tentador, porque se ve
 * igual— dejan de recibir foco, el anillo no se dibuja nunca y **nada falla**:
 * el click sigue andando y la suite sigue verde.
 */

/**
 * ⚠️ **`.focus()` NO alcanza como prueba de "se llega por teclado".** En jsdom
 * —y en un navegador— el foco programático entra igual en un elemento con
 * `tabIndex={-1}`, que está FUERA del orden de tabulación: nadie llega ahí con
 * Tab y el anillo no se dibuja nunca. Lo destapó una mutación que le puso
 * `tabIndex={-1}` a la cabecera ordenable y **no tumbó ni un test**. Por eso
 * cada caso de abajo comprueba además el `tabIndex`.
 */
const seLlegaConTab = (el: HTMLElement) => el.tabIndex >= 0;

describe('Foco por teclado: Switch, SearchInput y SortHeader', () => {
  it('el Switch es un control enfocable, con rol y estado que el teclado entiende', () => {
    const onChange = vi.fn();
    render(<Switch checked onChange={onChange} label="Solo inversión" />);
    const sw = screen.getByRole('switch', { name: 'Solo inversión' });

    sw.focus();
    expect(document.activeElement).toBe(sw);
    expect(sw.tagName).toBe('BUTTON');
    expect(seLlegaConTab(sw)).toBe(true);
    // Un interruptor no dice en palabras en qué estado está: lo dice su color.
    // Sin `aria-checked`, quien navega a ciegas no sabe qué va a pulsar.
    expect(sw).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('el botón de limpiar la búsqueda se puede enfocar y tiene nombre', () => {
    const onChange = vi.fn();
    render(<SearchInput value="rojo" onChange={onChange} />);
    const limpiar = screen.getByRole('button', { name: 'Limpiar búsqueda' });

    limpiar.focus();
    expect(document.activeElement).toBe(limpiar);
    expect(limpiar.tagName).toBe('BUTTON');
    expect(seLlegaConTab(limpiar)).toBe(true);

    fireEvent.click(limpiar);
    expect(onChange).toHaveBeenCalledWith('');
  });

  /** Y si no hay texto no hay botón: no se enfoca algo que no hace nada. */
  it('sin texto escrito, el botón de limpiar no existe', () => {
    render(<SearchInput value="" onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Limpiar búsqueda' })).toBeNull();
  });

  it('la cabecera ordenable es un botón enfocable que ordena al pulsarlo', () => {
    const toggle = vi.fn();
    render(
      <table>
        <thead>
          <tr>
            <SortHeader
              label="Fecha"
              sortKey="date"
              sort={{ sortKey: null, sortDir: 'asc', toggle }}
            />
          </tr>
        </thead>
      </table>,
    );
    const cabecera = screen.getByRole('button', { name: /Fecha/ });

    cabecera.focus();
    expect(document.activeElement).toBe(cabecera);
    expect(cabecera.tagName).toBe('BUTTON');
    expect(seLlegaConTab(cabecera)).toBe(true);

    fireEvent.click(cabecera);
    expect(toggle).toHaveBeenCalledWith('date');
  });
});
