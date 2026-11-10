import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { finDeEtiqueta, fuentesTsx } from '@/test/jsx-estatico';

/**
 * GUARDIÁN POR CÓDIGO: TODO DESPLEGABLE CON LISTA PROPIA REGISTRA SU CAPA.
 *
 * `Escape.spec.tsx` prueba que el Escape cierre la lista y no el modal, pero
 * solo de los dos desplegables que HOY existen. El agujero que queda es de
 * MEMORIA: el tercero que se escriba tiene que acordarse de llamar a
 * `useCapaDescartable`, y si no lo hace nada falla — el Escape se vuelve a
 * llevar el formulario y se descubre usándolo.
 *
 * Así que el conjunto se DERIVA de los fuentes, en vez de enumerarlo:
 *
 * | Lo que declara el archivo | Qué es | Qué se le exige |
 * |---|---|---|
 * | `role="listbox"` + `aria-haspopup="listbox"` | una lista que se abre SOBRE otro contenido | que llame a `useCapaDescartable` |
 * | `role="listbox"` + `aria-modal` | la capa de arriba, ella misma (`CommandPalette`) | que NO registre: no hay nada detrás que proteger |
 * | `role="listbox"` y nada más | sin clasificar | **rojo**: hay que decir cuál de las dos es |
 *
 * ⚠️ **Por qué `aria-haspopup="listbox"` y no `role="listbox"` a secas.**
 * Medido antes de elegir: `role="listbox"` da TRES archivos (`ui.tsx`,
 * `Combobox.tsx` y `CommandPalette.tsx`) y solo los dos primeros son
 * desplegables sobre un formulario. El `CommandPalette` no es un desplegable:
 * es un overlay propio (declara `role="dialog" aria-modal`), su lista no flota
 * sobre nada y su Escape tiene que cerrarlo A ÉL. Exigirle registrar sería
 * justo lo que apaga un guardián — marcar algo que no es el problema.
 *
 * Y no se usa `aria-haspopup` SOLO, porque olvidárselo dejaría al guardián
 * callado: la tercera fila de la tabla existe para que un `role="listbox"` que
 * no declara ninguna de las dos cosas tampoco pase.
 */

const RAIZ = join(__dirname, '..');
/**
 * Define el hook, no lo usa — pero el barrido solo mira `.tsx` y este archivo
 * es `.ts`, así que hoy no aparece en la lista y la exclusión no filtra nada.
 * Se deja escrita a propósito: el día que la definición se mueva a un `.tsx`,
 * su `export function useCapaDescartable(` entraría como un uso.
 */
const DEFINICION = `components${sep}capas-del-modal.ts`;

const LISTA = /role="listbox"/;
const DISPARADOR = /aria-haspopup="listbox"/;
const PROPIO_OVERLAY = /aria-modal/;
const REGISTRA = /useCapaDescartable\s*\(/;

/**
 * Cuántas veces aparece el patrón. Se recompila con `g` en vez de guardar la
 * constante global: un regex con `g` reusado en `.test()` arrastra `lastIndex`
 * entre llamadas y empieza a devolver `false` en alternancia.
 */
const cuantas = (src: string, re: RegExp) => [...src.matchAll(new RegExp(re.source, 'g'))].length;

type Clase = 'desplegable' | 'overlay-propio' | 'sin-clasificar';

/** Qué clase de lista declara este archivo, o `null` si no declara ninguna. */
export function claseDeLista(src: string): Clase | null {
  if (!LISTA.test(src)) return null;
  if (DISPARADOR.test(src)) return 'desplegable';
  if (PROPIO_OVERLAY.test(src)) return 'overlay-propio';
  return 'sin-clasificar';
}

const relativo = (ruta: string) => relative(RAIZ, ruta).split(sep).join('/');

function archivos() {
  return fuentesTsx(RAIZ).map((ruta) => ({
    ruta: relativo(ruta),
    src: readFileSync(ruta, 'utf8'),
  }));
}

describe('Todo desplegable con lista propia registra su capa (guardián por código)', () => {
  /**
   * ⚠️ **SE CUENTAN, NO SE PREGUNTA SI HAY ALGUNO** (2026-11-10). La versión
   * anterior decidía por archivo (`REGISTRA.test(src)`), y como `ui.tsx` ya
   * contenía UN `useCapaDescartable(`, pasaba **por tener uno** — tuviera los
   * que tuviera. O sea que el guardián era ciego justo en el archivo donde se
   * escribiría el desplegable siguiente: el tercero podía nacer ahí sin
   * registrar y nada se ponía rojo.
   *
   * Ahora se exige que la cantidad de DISPARADORES (`aria-haspopup="listbox"`,
   * uno por desplegable) sea igual a la de llamadas al hook.
   */
  it('cada disparador de lista tiene SU llamada al hook (se cuentan, no se pregunta)', () => {
    const descuadrados = archivos()
      .filter((a) => claseDeLista(a.src) === 'desplegable')
      .map((a) => ({
        ruta: a.ruta,
        disparadores: cuantas(a.src, DISPARADOR),
        registros: cuantas(a.src, REGISTRA),
      }))
      .filter((a) => a.disparadores !== a.registros);
    expect(
      descuadrados.map((a) => `${a.ruta}: ${a.disparadores} listas, ${a.registros} registros`),
      'Un desplegable que no registra su capa deja que el Escape, dentro de un\n' +
        'modal, cierre el formulario entero.',
    ).toEqual([]);
  });

  it('y al revés: el que registra una capa dibuja una lista propia', () => {
    const sobran = archivos()
      .filter((a) => a.ruta !== DEFINICION.split(sep).join('/'))
      .filter((a) => REGISTRA.test(a.src) && claseDeLista(a.src) !== 'desplegable')
      .map((a) => a.ruta);
    expect(
      sobran,
      `Registran una capa descartable sin dibujar una lista propia: ${sobran.join(', ')}`,
    ).toEqual([]);
  });

  it('ninguna lista queda sin clasificar', () => {
    const dudosos = archivos()
      .filter((a) => claseDeLista(a.src) === 'sin-clasificar')
      .map((a) => a.ruta);
    expect(
      dudosos,
      'Dibujan un role="listbox" sin decir qué son. Si la lista se abre sobre otro\n' +
        'contenido, va con aria-haspopup="listbox" y tiene que registrar su capa;\n' +
        'si el componente ES la capa de arriba, va con aria-modal:\n' +
        dudosos.join('\n'),
    ).toEqual([]);
  });

  /**
   * La otra mitad, y es la que cubre al `AlertDialog` del `ConfirmProvider`:
   * su contenido es título, descripción y dos botones, así que **ningún test de
   * comportamiento puede ejercerlo hoy** —no hay dónde poner un desplegable
   * adentro—. Lo que sí se puede medir es el CABLEADO: que todo overlay de
   * Radix con trampa de foco pase el mismo `onEscapeKeyDown` y publique el
   * registro a sus hijos. Un tercer overlay nace cubierto o esto se pone rojo.
   */
  it('todo overlay de Radix con trampa de foco cablea el registro', () => {
    const ruta = join(RAIZ, 'components', 'overlays.tsx');
    const src = readFileSync(ruta, 'utf8');

    // Los espacios de nombres importados de un paquete *dialog* de Radix: son
    // los que traen `DismissableLayer` + `FocusScope`. El Tooltip queda afuera
    // a propósito: no atrapa el foco y perder uno no cuesta nada.
    const espacios = [
      ...src.matchAll(/import \* as (\w+) from '@radix-ui\/react-[\w-]*dialog'/g),
    ].map((m) => m[1]);
    expect(espacios.length, 'No se encontró ningún overlay de diálogo de Radix').toBeGreaterThan(1);

    const sinCablear: string[] = [];
    let contenidos = 0;
    for (const espacio of espacios) {
      const re = new RegExp(`<${espacio}\\.Content(?=[\\s/>])`, 'g');
      for (const m of src.matchAll(re)) {
        contenidos++;
        const etiqueta = src.slice(m.index!, finDeEtiqueta(src, m.index!));
        if (!/onEscapeKeyDown=\{capas\.alEscape\}/.test(etiqueta)) {
          sinCablear.push(`<${espacio}.Content> sin onEscapeKeyDown={capas.alEscape}`);
        }
      }
    }
    expect(sinCablear, sinCablear.join('\n')).toEqual([]);

    // Cada uno publica el registro a sus hijos, o el desplegable de adentro no
    // tendría dónde anotarse.
    const proveedores = src.match(/<CapasDelModal\.Provider/g)?.length ?? 0;
    expect(proveedores, 'Falta un <CapasDelModal.Provider> en algún overlay').toBe(contenidos);
  });

  describe('el detector muerde (con sus hermanos que no)', () => {
    it('marca la lista que se abre sobre otro contenido', () => {
      expect(claseDeLista('<button aria-haspopup="listbox" /><div role="listbox" />')).toBe(
        'desplegable',
      );
    });
    it('NO marca al overlay que ES la capa de arriba', () => {
      expect(claseDeLista('<div role="dialog" aria-modal="true"><ul role="listbox" /></div>')).toBe(
        'overlay-propio',
      );
    });
    it('marca como dudosa la lista que no dice qué es', () => {
      expect(claseDeLista('<div role="listbox" />')).toBe('sin-clasificar');
    });
    it('un archivo sin lista no entra en ninguna categoría', () => {
      expect(claseDeLista('<Button aria-haspopup="listbox" />')).toBeNull();
    });
  });
});
