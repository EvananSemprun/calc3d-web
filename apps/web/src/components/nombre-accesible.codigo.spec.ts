import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { finDeEtiqueta, fuentesTsx, lineaDe } from '@/test/jsx-estatico';

/**
 * GUARDIÁN POR CÓDIGO: TODO DESPLEGABLE TIENE NOMBRE ACCESIBLE.
 *
 * `Field` le da nombre a los controles que envuelve (ver `nombre-accesible.spec.tsx`),
 * pero un `Select`/`Combobox` FUERA de un `Field` no hereda nada. Este test
 * recorre los fuentes del panel y exige que cada `<Select>`, `<SelectBuscable>`
 * y `<Combobox>` esté dentro de un `<Field>` o lleve `aria-label` propio. Así
 * el control que se agregue el mes que viene sin nombre rompe acá, en vez de
 * esperar a que alguien lo note con un lector de pantalla.
 *
 * Es análisis estático (no ejecuta nada): lee el texto y mide estructura.
 */

const RAIZ = join(__dirname, '..');
const CONTROLES = ['Select', 'SelectBuscable', 'Combobox'];

/** Lo que define a los propios componentes: no es un uso. */
const EXCLUIDOS = [`components${sep}ui.tsx`, `components${sep}Combobox.tsx`];

/** Rangos [inicio, fin) del contenido de cada `<Field ...>...</Field>`. */
function rangosDeField(src: string): Array<[number, number]> {
  const rangos: Array<[number, number]> = [];
  const aperturas = [...src.matchAll(/<Field(?=[\s>])/g)];
  for (const m of aperturas) {
    const ini = m.index!;
    const finApertura = finDeEtiqueta(src, ini);
    if (src[finApertura - 1] === '/') continue; // <Field ... /> sin hijos
    let profundidad = 1;
    const re = /<Field(?=[\s>])|<\/Field>/g;
    re.lastIndex = finApertura;
    let fin = src.length;
    for (let r = re.exec(src); r; r = re.exec(src)) {
      profundidad += r[0] === '</Field>' ? -1 : 1;
      if (profundidad === 0) {
        fin = r.index;
        break;
      }
    }
    rangos.push([finApertura, fin]);
  }
  return rangos;
}

/** Usos de los controles sin nombre: `ruta:línea`. */
export function sinNombre(src: string, ruta = 'x.tsx'): string[] {
  const campos = rangosDeField(src);
  const malos: string[] = [];
  const re = new RegExp(`<(${CONTROLES.join('|')})(?=[\\s/>])`, 'g');
  for (const m of src.matchAll(re)) {
    const ini = m.index!;
    const etiqueta = src.slice(ini, finDeEtiqueta(src, ini));
    const dentro = campos.some(([a, b]) => ini > a && ini < b);
    if (dentro || /\baria-label(ledby)?=/.test(etiqueta)) continue;
    malos.push(`${ruta}:${lineaDe(src, ini)} <${m[1]}>`);
  }
  return malos;
}

describe('Todo desplegable tiene nombre accesible (guardián por código)', () => {
  it('ningún Select/SelectBuscable/Combobox queda fuera de un Field sin aria-label', () => {
    const malos = fuentesTsx(RAIZ)
      .filter((r) => !EXCLUIDOS.some((e) => relative(RAIZ, r) === e))
      .flatMap((r) => sinNombre(readFileSync(r, 'utf8'), relative(RAIZ, r).split(sep).join('/')));
    expect(malos, `Faltan nombres accesibles:\n${malos.join('\n')}`).toEqual([]);
  });

  describe('el detector muerde (con su hermano que no)', () => {
    it('marca un Select suelto sin aria-label', () => {
      expect(
        sinNombre('<div><Select value="a" onChange={(e) => f(e)}></Select></div>'),
      ).toHaveLength(1);
    });
    it('marca un Combobox suelto', () => {
      expect(sinNombre('<Combobox kind="X" value="" onChange={() => {}} />')).toHaveLength(1);
    });
    it('NO marca un Select con aria-label', () => {
      expect(sinNombre('<Select aria-label="Moneda" value="a"></Select>')).toEqual([]);
    });
    it('NO marca un Select dentro de un Field', () => {
      expect(sinNombre('<Field label="M"><Select value="a"></Select></Field>')).toEqual([]);
    });
    it('marca el Select que está DESPUÉS de cerrar el Field', () => {
      expect(
        sinNombre('<Field label="M"><Input /></Field><Select value="a"></Select>'),
      ).toHaveLength(1);
    });
    it('un `=>` dentro de las props no corta la etiqueta antes de ver el aria-label', () => {
      expect(sinNombre('<Select onChange={(e) => f(e)} aria-label="Moneda"></Select>')).toEqual([]);
    });
  });
});
