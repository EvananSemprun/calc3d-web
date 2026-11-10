import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { finDeEtiqueta, fuentesTsx, lineaDe } from '@/test/jsx-estatico';

/**
 * GUARDIÁN POR CÓDIGO: TODO CONTROL DE FORMULARIO TIENE NOMBRE ACCESIBLE.
 *
 * `Field` publica el id de su etiqueta y los controles lo toman como
 * `aria-labelledby` (ver `nombre-accesible.spec.tsx`), pero un control FUERA de
 * un `Field` no hereda nada. Este test recorre los fuentes del panel y exige
 * que cada uso esté dentro de un `<Field>` o lleve nombre propio.
 *
 * ⚠️ **SE LLAMABA «TODO DESPLEGABLE», Y ESE ERA EL AGUJERO** (corregido el
 * 2026-11-10). `CONTROLES` tenía solo `Select`/`SelectBuscable`/`Combobox`, así
 * que los **136 campos de texto** que viven dentro de un `Field` no los miraba
 * nadie: medido en `/login`, «Correo» y «Contraseña» daban `aria-label: null`,
 * `aria-labelledby: null`, `labels: []`, y la suite verde se leía como «los
 * formularios tienen nombre». Es el modo de falla de la casa —un test que mide
 * menos de lo que su nombre promete—, esta vez en el **alcance** y no en la
 * aserción. Un control de formulario nuevo se agrega a `CONTROLES`.
 *
 * Es análisis estático (no ejecuta nada): lee el texto y mide estructura.
 */

const RAIZ = join(__dirname, '..');

/**
 * Los controles de formulario de la casa.
 *
 * `NumberInput` y `Textarea` dibujan un `Input` por dentro, así que heredarían
 * el nombre igual; están nombrados de todos modos porque el día que uno deje de
 * envolverlo, el guardián lo sigue exigiendo en vez de quedarse callado.
 */
const CONTROLES = ['Select', 'SelectBuscable', 'Combobox', 'Input', 'NumberInput', 'Textarea'];

/**
 * ⚠️ **LA EXENCIÓN ES POR ETIQUETA, NO POR ARCHIVO** (2026-11-10). Antes había
 * un `EXCLUIDOS` que se saltaba `ui.tsx` y `Combobox.tsx` **enteros**, o sea
 * que el guardián era ciego justo donde se escribe el control siguiente. Lo
 * único que hay que exentar es la DELEGACIÓN interna de una primitiva que
 * dibuja a otra: ahí el nombre lo pone quien la llama, y ese llamador se revisa
 * en SU propio uso.
 *
 * Un uso queda exento si su etiqueta trae el nombre —en cualquiera de sus
 * cuatro grafías— o si **reenvía `{...props}`**.
 *
 * ⚠️ La cláusula del spread es LITERAL (`{...props}`) y no «cualquier spread»:
 * un `{...register('x')}` de react-hook-form no exime, porque ahí no viaja
 * ningún nombre. Medido antes de elegirla: `{...props}` aparece solo dentro de
 * las definiciones de las primitivas, nunca en una llamada de pantalla.
 */
const NOMBRE_PROPIO = /\baria-label(ledby)?=|\bariaLabel(ledBy)?=/;
const DELEGA_PROPS = /\{\.\.\.props\}/;

/**
 * Los envoltorios que DAN nombre a su control: publican el id de su etiqueta
 * con `AmbitoDeCampo`. Son `Field` y `MiniField`, la variante compacta de la
 * calculadora.
 *
 * ⚠️ **Esta lista y los que de verdad publican el ámbito son un PAR.**
 * `MiniField` arrastraba el mismo defecto que tenía `Field` —un `<label>`
 * hermano sin `htmlFor`, que no etiqueta a nadie— y sus tres campos de
 * «Insumos» se leían sin nombre. Si aparece un tercer envoltorio y no entra
 * acá, sus controles salen marcados estando bien; si entra acá sin publicar el
 * ámbito, el guardián los deja pasar estando mal.
 */
const ENVOLTORIOS = ['Field', 'MiniField'];
const abre = (n: string) => new RegExp(`<${n}(?=[\\s>])`, 'g');
const cierra = (n: string) => new RegExp(`</${n}>`, 'g');

/** Rangos [inicio, fin) del contenido de cada envoltorio que da nombre. */
function rangosDeCampo(src: string): Array<[number, number]> {
  const rangos: Array<[number, number]> = [];
  for (const nombre of ENVOLTORIOS) {
    for (const m of [...src.matchAll(abre(nombre))]) {
      const ini = m.index!;
      const finApertura = finDeEtiqueta(src, ini);
      if (src[finApertura - 1] === '/') continue; // <Field ... /> sin hijos
      let profundidad = 1;
      const re = new RegExp(`${abre(nombre).source}|${cierra(nombre).source}`, 'g');
      re.lastIndex = finApertura;
      let fin = src.length;
      for (let r = re.exec(src); r; r = re.exec(src)) {
        profundidad += r[0] === `</${nombre}>` ? -1 : 1;
        if (profundidad === 0) {
          fin = r.index;
          break;
        }
      }
      rangos.push([finApertura, fin]);
    }
  }
  return rangos;
}

/**
 * Cuántos `<Field>` quedan sin cerrar en un archivo.
 *
 * ⚠️ **Un `<Field` sin su `</Field>` APAGA el guardián hacia abajo**: el rango
 * del campo se extiende hasta el final del archivo, así que TODO control
 * posterior pasa como «dentro de un Field» y nadie vuelve a pedirle nombre. No
 * es hipotético: es exactamente cómo un guardián deja de proteger sin ponerse
 * rojo. Hoy el balance está parejo en los 28 archivos que usan `Field`.
 */
export function fieldsSinCerrar(src: string): number {
  let saldo = 0;
  for (const nombre of ENVOLTORIOS) {
    const abiertos = [...src.matchAll(abre(nombre))].filter(
      (m) => src[finDeEtiqueta(src, m.index!) - 1] !== '/',
    ).length;
    saldo += abiertos - (src.match(cierra(nombre)) ?? []).length;
  }
  return saldo;
}

/**
 * Controles que llevan `aria-label` propio **estando** dentro de un envoltorio
 * que ya los nombra y siendo el ÚNICO control de ese envoltorio: `ruta:línea`.
 *
 * ⚠️ Eran 26 y hasta el 2026-11-10 **se descartaban en silencio** (el
 * `aria-label` no llegaba al control), así que nadie los limpió. El arreglo del
 * nombre accesible los RESUCITÓ: ahora GANAN sobre la etiqueta visible, y van a
 * quedar viejos el día que alguien edite el `label` y no se acuerde de ellos —
 * el mismo caso que el `CLAUDE.md` global ya dejó escrito para los
 * `comboboxProps` sueltos de Mantine.
 *
 * ⚠️ **La excepción es un envoltorio con DOS o más controles**: ahí los dos
 * heredarían el mismo nombre y el `aria-label` es justo lo que los distingue.
 * Medido al limpiar: de los 26, los 26 eran el único control de su campo, así
 * que no se borró ninguno que hiciera falta.
 */
export function etiquetaDeMas(src: string, ruta = 'x.tsx'): string[] {
  const campos = rangosDeCampo(src);
  const re = new RegExp(`<(${CONTROLES.join('|')})(?=[\\s/>])`, 'g');
  const dentroDe = (ini: number) =>
    campos.filter(([a, b]) => ini > a && ini < b).sort((x, y) => y[0] - x[0])[0];
  const malos: string[] = [];
  for (const m of src.matchAll(re)) {
    const ini = m.index!;
    const campo = dentroDe(ini);
    if (!campo) continue;
    if (!/\baria-label=/.test(src.slice(ini, finDeEtiqueta(src, ini)))) continue;
    const hermanos = [...src.slice(campo[0], campo[1]).matchAll(re)].length;
    if (hermanos > 1) continue; // Hacen falta para distinguirse.
    malos.push(`${ruta}:${lineaDe(src, ini)} <${m[1]}>`);
  }
  return malos;
}

/** Usos de los controles sin nombre: `ruta:línea`. */
export function sinNombre(src: string, ruta = 'x.tsx'): string[] {
  const campos = rangosDeCampo(src);
  const malos: string[] = [];
  const re = new RegExp(`<(${CONTROLES.join('|')})(?=[\\s/>])`, 'g');
  for (const m of src.matchAll(re)) {
    const ini = m.index!;
    const etiqueta = src.slice(ini, finDeEtiqueta(src, ini));
    const dentro = campos.some(([a, b]) => ini > a && ini < b);
    if (dentro || NOMBRE_PROPIO.test(etiqueta) || DELEGA_PROPS.test(etiqueta)) continue;
    malos.push(`${ruta}:${lineaDe(src, ini)} <${m[1]}>`);
  }
  return malos;
}

const archivos = () =>
  fuentesTsx(RAIZ).map((ruta) => ({
    ruta: relative(RAIZ, ruta).split(sep).join('/'),
    src: readFileSync(ruta, 'utf8'),
  }));

describe('Todo control de formulario tiene nombre accesible (guardián por código)', () => {
  it('ningún control queda fuera de un Field sin nombre propio', () => {
    const malos = archivos().flatMap((a) => sinNombre(a.src, a.ruta));
    expect(malos, `Faltan nombres accesibles:\n${malos.join('\n')}`).toEqual([]);
  });

  it('ningún control único repite con aria-label la etiqueta de su campo', () => {
    const demas = archivos().flatMap((a) => etiquetaDeMas(a.src, a.ruta));
    expect(
      demas,
      'Estos `aria-label` GANAN sobre la etiqueta visible y van a quedar viejos\n' +
        'cuando alguien edite el `label`. Bórralos, salvo que el campo tenga dos\n' +
        'controles que necesiten distinguirse:\n' +
        demas.join('\n'),
    ).toEqual([]);
  });

  it('ningún archivo deja un <Field> sin cerrar (si no, el guardián se apaga solo)', () => {
    const descuadrados = archivos()
      .map((a) => ({ ...a, saldo: fieldsSinCerrar(a.src) }))
      .filter((a) => a.saldo !== 0)
      .map((a) => `${a.ruta}: ${a.saldo > 0 ? `${a.saldo} sin cerrar` : `${-a.saldo} de más`}`);
    expect(
      descuadrados,
      'Un <Field> sin cerrar hace que TODO control posterior pase como «dentro\n' +
        'de un Field» y nadie le pida nombre:\n' +
        descuadrados.join('\n'),
    ).toEqual([]);
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
    it('marca un Input suelto, que es lo que no miraba', () => {
      expect(sinNombre('<div><Input value={x} onChange={f} /></div>')).toHaveLength(1);
    });
    it('marca un NumberInput y un Textarea sueltos', () => {
      expect(sinNombre('<NumberInput value={0} onChange={f} /><Textarea />')).toHaveLength(2);
    });
    it('NO marca un Select con aria-label', () => {
      expect(sinNombre('<Select aria-label="Moneda" value="a"></Select>')).toEqual([]);
    });
    it('NO marca un Input dentro de un Field', () => {
      expect(sinNombre('<Field label="M"><Input value={x} /></Field>')).toEqual([]);
    });
    it('NO marca un Input dentro de un MiniField (publica el mismo ámbito)', () => {
      expect(sinNombre('<MiniField label="Insumo"><Input value={x} /></MiniField>')).toEqual([]);
    });
    it('NO marca la delegación interna de una primitiva (reenvía {...props})', () => {
      expect(sinNombre('<Input ref={ref} type="number" {...props} />')).toEqual([]);
    });
    it('un spread que NO es {...props} no exime', () => {
      expect(sinNombre(`<Input {...register('nombre')} />`)).toHaveLength(1);
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

  describe('el detector de etiqueta de más muerde (con su hermano que no)', () => {
    it('marca el aria-label del control único de un campo', () => {
      expect(
        etiquetaDeMas('<Field label="Tipo"><Select aria-label="Tipo de banner"></Select></Field>'),
      ).toHaveLength(1);
    });
    it('NO marca los dos controles de un campo que tiene dos', () => {
      expect(
        etiquetaDeMas(
          '<Field label="Monto"><NumberInput aria-label="Monto" /><Select aria-label="Moneda"></Select></Field>',
        ),
      ).toEqual([]);
    });
    it('NO marca un control suelto con aria-label (ahí es su único nombre)', () => {
      expect(etiquetaDeMas('<Select aria-label="Filtrar por estado"></Select>')).toEqual([]);
    });
  });

  describe('el balance de Field muerde (con su hermano que no)', () => {
    it('cuenta el Field sin cerrar', () => {
      expect(fieldsSinCerrar('<Field label="a"><Input /></Field><Field label="b"><Input />')).toBe(
        1,
      );
    });
    it('un Field autocerrado no cuenta como abierto', () => {
      expect(fieldsSinCerrar('<Field label="a" />')).toBe(0);
    });
    it('un archivo balanceado da 0', () => {
      expect(fieldsSinCerrar('<Field label="a"><Input /></Field>')).toBe(0);
    });
    it('un Field sin cerrar hace pasar al control de abajo (es el daño real)', () => {
      // Sin el balance, este archivo queda verde para siempre.
      expect(sinNombre('<Field label="a"><Input /><Select value="x"></Select>')).toEqual([]);
    });
  });
});
