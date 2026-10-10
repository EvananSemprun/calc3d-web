import { describe, expect, it } from 'vitest';
import type { PrecioPorTipo } from '@calc3d/shared';
import {
  buscarOpcion,
  materialLabel,
  textoDeOrigen,
  opcionesDeFilamento,
  quotableMaterials,
} from '@/features/calculator/materialOptions';
import type { MaterialItem } from '@/features/calculator/useCatalogData';

/**
 * EL SELECTOR DE FILAMENTO DE LA CALCULADORA (2026-10-10).
 *
 * Desde el 2026-10-10 ofrece DOS grupos: el promedio por TIPO (lo que se elige
 * casi siempre) y la FICHA puntual (para cuando el color importa). El promedio
 * lo calcula el servidor con `preciosPorTipo` de shared; acá se prueba lo que
 * hace la PANTALLA: armar las opciones, etiquetarlas y encontrar la elegida.
 *
 * El `money` de prueba es a propósito tonto: lo real sale de `useMoney()` y
 * depende de la configuración del negocio.
 */
const money = (n: number) => `$${n.toFixed(2)}`;

function tipo(p: Partial<PrecioPorTipo>): PrecioPorTipo {
  return { type: 'PLA', rollPrice: 20.26, rollGrams: 1000, rolls: 47, purchases: 47, ...p };
}

function ficha(p: Partial<MaterialItem>): MaterialItem {
  return {
    id: 'm1',
    name: 'PLA Azul',
    rollPrice: '20',
    rollGrams: 1000,
    status: 'ACTIVE',
    outAtLastClose: null,
    ...p,
  };
}

describe('opcionesDeFilamento', () => {
  it('el grupo de TIPOS muestra el promedio y en cuántos rollos se apoya', () => {
    const { porTipo } = opcionesDeFilamento([tipo({})], [], money);

    expect(porTipo).toHaveLength(1);
    expect(porTipo[0].label).toBe('PLA — promedio $20.26 · 47 rollos');
    expect(porTipo[0].rollPrice).toBe(20.26);
    expect(porTipo[0].rollGrams).toBe(1000);
  });

  it('el nombre del trabajo dice que es un promedio: sale en la cotización', () => {
    // Elegir el tipo no es elegir un color. Si el nombre dijera "PLA" a secas,
    // la cotización afirmaría un rollo concreto que nadie eligió.
    const { porTipo } = opcionesDeFilamento([tipo({ type: 'PETG' })], [], money);

    expect(porTipo[0].name).toBe('PETG (promedio)');
  });

  it('un rollo solo se dice en singular', () => {
    const { porTipo } = opcionesDeFilamento([tipo({ type: 'PLA TOUGH+', rolls: 1 })], [], money);

    expect(porTipo[0].label).toBe('PLA TOUGH+ — promedio $20.26 · 1 rollo');
  });

  it('respeta el ORDEN que manda el servidor: el primero es el que más se compra', () => {
    // El servidor ya los ordena por rollos (`preciosPorTipo`). Reordenar acá
    // sería una segunda definición de "el tipo más usado".
    const { porTipo } = opcionesDeFilamento(
      [tipo({ type: 'PLA', rolls: 47 }), tipo({ type: 'PETG', rolls: 3 })],
      [],
      money,
    );

    expect(porTipo.map((o) => o.name)).toEqual(['PLA (promedio)', 'PETG (promedio)']);
  });

  it('el grupo de FICHAS copia el precio y los gramos de ESA ficha', () => {
    const { porFicha } = opcionesDeFilamento(
      [],
      [ficha({ id: 'm9', name: 'PLA SILK Dorado', rollPrice: '24', rollGrams: 750 })],
      money,
    );

    expect(porFicha).toHaveLength(1);
    expect(porFicha[0]).toMatchObject({
      key: 'ficha:m9',
      name: 'PLA SILK Dorado',
      rollPrice: 24,
      rollGrams: 750,
    });
    expect(porFicha[0].label).toBe('PLA SILK Dorado — $24.00');
  });

  it('las fichas DESCONTINUADAS siguen sin ofrecerse', () => {
    // Regla del 2026-09-14, que esta pantalla no puede perder.
    const { porFicha } = opcionesDeFilamento(
      [],
      [ficha({ id: 'a' }), ficha({ id: 'b', name: 'PLA Negro', status: 'DISCONTINUED' })],
      money,
    );

    expect(porFicha.map((o) => o.key)).toEqual(['ficha:a']);
  });

  it('la ficha que cerró el mes en 0 va AL FINAL y conserva su aviso', () => {
    const { porFicha } = opcionesDeFilamento(
      [],
      [
        ficha({ id: 'cero', name: 'PLA Amarillo', outAtLastClose: '2026-08' }),
        ficha({ id: 'hay', name: 'PLA Azul' }),
      ],
      money,
    );

    expect(porFicha.map((o) => o.key)).toEqual(['ficha:hay', 'ficha:cero']);
    expect(porFicha[1].label).toContain('0 al cierre de agosto');
  });

  it('las claves de los dos grupos no se pueden confundir', () => {
    // Un tipo que se llamara igual que el id de una ficha no puede pisarla.
    const ops = opcionesDeFilamento([tipo({ type: 'm1' })], [ficha({ id: 'm1' })], money);

    expect(ops.porTipo[0].key).toBe('tipo:m1');
    expect(ops.porFicha[0].key).toBe('ficha:m1');
    expect(ops.porTipo[0].key).not.toBe(ops.porFicha[0].key);
  });

  it('mientras los catálogos cargan devuelve dos listas vacías, no undefined', () => {
    const ops = opcionesDeFilamento(undefined, undefined, money);

    expect(ops).toEqual({ porTipo: [], porFicha: [] });
  });
});

describe('buscarOpcion', () => {
  const ops = opcionesDeFilamento([tipo({})], [ficha({ id: 'm1' })], money);

  it('encuentra la opción elegida en cualquiera de los dos grupos', () => {
    expect(buscarOpcion(ops, 'tipo:PLA')?.name).toBe('PLA (promedio)');
    expect(buscarOpcion(ops, 'ficha:m1')?.name).toBe('PLA Azul');
  });

  it('la cadena vacía es "a mano": no hay opción que aplicar', () => {
    // Si devolviera algo, escribir un precio a mano lo pisaría al siguiente render.
    expect(buscarOpcion(ops, '')).toBeUndefined();
  });

  it('una clave que ya no existe no devuelve otra opción cualquiera', () => {
    // Un tipo deja de existir si se corrige la ficha que lo tenía.
    expect(buscarOpcion(ops, 'tipo:ABS')).toBeUndefined();
  });
});

/**
 * El renglón que dice QUÉ significa el precio que está en el campo. Sin él, el
 * promedio es un número que apareció solo: el dueño no puede saber si está
 * cotizando un color, un promedio o algo que escribió él.
 */
describe('textoDeOrigen', () => {
  const tipos = [tipo({ type: 'PLA', rolls: 47 }), tipo({ type: 'PLA TOUGH+', rolls: 1 })];

  it('con un tipo dice sobre cuántos rollos se apoya y que el regalo no cuenta', () => {
    // La exclusión del rollo regalado es invisible si no se dice: el promedio
    // del PLA no coincide con el que daría dividir el gasto total entre 48.
    const t = textoDeOrigen(tipos, 'tipo:PLA');

    expect(t).toContain('47 rollos');
    expect(t).toContain('regalado');
  });

  it('un rollo, en singular', () => {
    expect(textoDeOrigen(tipos, 'tipo:PLA TOUGH+')).toContain('1 rollo comprado');
  });

  it('con una ficha dice que es su última compra, no un promedio', () => {
    expect(textoDeOrigen(tipos, 'ficha:m1')).toBe('Precio de la última compra de esa ficha.');
  });

  it('sin elegir nada dice que el precio está escrito a mano', () => {
    expect(textoDeOrigen(tipos, '')).toBe('Precio escrito a mano.');
  });

  it('un tipo que ya no existe no inventa un respaldo: cae en "a mano"', () => {
    expect(textoDeOrigen(tipos, 'tipo:ABS')).toBe('Precio escrito a mano.');
  });

  it('mientras los promedios cargan no afirma nada sobre ellos', () => {
    expect(textoDeOrigen(undefined, 'tipo:PLA')).toBe('Precio escrito a mano.');
  });
});

/** Lo que ya hacía la pantalla antes del 2026-10-10 y no se puede perder. */
describe('quotableMaterials y materialLabel', () => {
  it('saca las descontinuadas y manda al final las que cerraron en 0', () => {
    const r = quotableMaterials([
      ficha({ id: 'cero', outAtLastClose: '2026-08' }),
      ficha({ id: 'baja', status: 'DISCONTINUED' }),
      ficha({ id: 'hay' }),
    ]);

    expect(r?.map((m) => m.id)).toEqual(['hay', 'cero']);
  });

  it('sin fichas cargadas devuelve undefined (sigue cargando)', () => {
    expect(quotableMaterials(undefined)).toBeUndefined();
  });

  it('avisa el mes en que cerró en 0, en hora UTC', () => {
    expect(materialLabel(ficha({ name: 'PLA Arena', outAtLastClose: '2026-08' }))).toBe(
      'PLA Arena — 0 al cierre de agosto',
    );
    expect(materialLabel(ficha({ name: 'PLA Azul' }))).toBe('PLA Azul');
  });
});
