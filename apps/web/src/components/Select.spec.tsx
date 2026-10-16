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

// jsdom: matchMedia está mockeado en setup-dom y devuelve matches:false, así que
// `esTactil()` da false → se prueba el camino de ESCRITORIO (apertura controlada +
// autofoco del buscador), que es justo lo que el fix del teclado móvil podría romper.
describe('Select (primitivo)', () => {
  it('abre, filtra con el buscador y al elegir una opción se CIERRA', () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="prueba" value="v0" onChange={onChange}>
        {opciones(10)}
      </Select>,
    );
    const trigger = screen.getByRole('combobox', { name: 'prueba' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    // Con ≥8 opciones aparece el buscador (el desplegable está ABIERTO).
    const buscador = screen.getByLabelText('Buscar en la lista');
    expect(buscador).toBeInTheDocument();

    // Filtra sin acentos/mayúsculas.
    fireEvent.change(buscador, { target: { value: 'opcion 7' } });
    expect(screen.getByText('Opción 7')).toBeInTheDocument();
    expect(screen.queryByText('Opción 3')).not.toBeInTheDocument();

    // Elegir avisa el valor y CIERRA el desplegable (el buscador desaparece).
    fireEvent.click(screen.getByText('Opción 7'));
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
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'corto' }), { key: 'Enter' });
    expect(screen.queryByLabelText('Buscar en la lista')).not.toBeInTheDocument();
  });
});
