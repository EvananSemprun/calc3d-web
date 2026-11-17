import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fuentesTsx, lineaDe } from '@/test/jsx-estatico';

/**
 * GUARDIÁN POR CÓDIGO: NINGUNA PUERTA DEL CANDADO ES UN CALLEJÓN SIN SALIDA.
 *
 * El servidor corta con 400 toda operación que mueva el saldo con fecha igual o
 * anterior a una conciliación de caja, y el cliente tiene que reintentar con
 * `confirmoConciliacion`. Medido el 2026-11-17, antes del arreglo: la palabra
 * aparecía en **0 archivos** del panel, así que las puertas mostraban un toast
 * que pedía confirmar y no daban con qué.
 *
 * ⚠️ **Por qué un guardián de código y no solo tests de pantalla.** Los tests
 * de cableado prueban las puertas que EXISTEN. Lo que no pueden ver es la
 * SIGUIENTE: el día que alguien agregue otro formulario que mueva el saldo, su
 * `catch (e) { notify.error(apiErrorMessage(e)) }` va a compilar, pasar el lint
 * y dejar el mismo callejón, con la suite entera en verde. De hecho este
 * guardián encontró TRES puertas que la revisión a mano había pasado por alto
 * (corregir quién pagó un gasto, y corregir y borrar una compra de filamento).
 *
 * ⚠️ **Las rutas salen de los 22 puntos de guardia de la API** (`grep -rn
 * exigirConfirmacionDeConciliacion apps/api/src`). Si nace uno nuevo, se agrega
 * acá: la lista es la frontera y tiene que decirse a mano a propósito —
 * derivarla del propio panel haría que el test se "arregle" solo al olvidarse.
 *
 * Es análisis estático: lee el texto, no ejecuta nada.
 */

const RAIZ = join(__dirname, '..', '..');

/**
 * Los `.ts` de un árbol (sin specs). `fuentesTsx` solo trae `.tsx`, y los hooks
 * de mutación viven en `api.ts`.
 */
function fuentesTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentesTs(ruta);
    if (!/\.ts$/.test(ruta) || /\.spec\.ts$/.test(ruta)) return [];
    return [ruta];
  });
}

const fuentesDelPanel = () => [
  ...fuentesTsx(join(RAIZ, 'pages')),
  ...fuentesTsx(join(RAIZ, 'features')),
];

/**
 * Las rutas que el servidor vigila, tal como las escribe el panel.
 *
 * ⚠️ NO está `/lines/.../receive`: recibir mercadería **no** mueve el saldo
 * (la plata ya se contó al abonar), así que la API no la vigila y pedirle el
 * flag sería inventar un candado que el servidor no tiene. Medido el
 * 2026-11-17 en `purchase-invoices.module.ts`: `receive` no llama al guard.
 */
const RUTAS_VIGILADAS = [
  '/sales',
  '/expenses',
  '/expenses/with-definition',
  '/payments',
  '/cash/movements',
  '/loans/',
  '/void',
];

/** Cuántas líneas alrededor cuentan como "la misma llamada". */
const CERCA = 14;

/** Las líneas que llaman a una ruta vigilada con un verbo que escribe. */
function llamadasVigiladas(src: string) {
  const lineas = src.split('\n');
  return lineas.flatMap((linea, i) => {
    if (!/api\.(post|patch|put|delete)\s*[(<]/.test(linea)) return [];
    // La ruta puede estar en esta línea o en la siguiente (prettier corta).
    const trozo = [linea, lineas[i + 1] ?? ''].join(' ');
    if (!RUTAS_VIGILADAS.some((r) => trozo.includes(r))) return [];
    return [{ linea: i }];
  });
}

describe('guardián: toda puerta del candado de conciliación reenvía la confirmación', () => {
  it('ninguna llamada a una ruta vigilada se manda sin confirmoConciliacion cerca', () => {
    const faltan: string[] = [];
    for (const archivo of fuentesDelPanel()) {
      const src = readFileSync(archivo, 'utf8');
      const lineas = src.split('\n');
      for (const { linea } of llamadasVigiladas(src)) {
        const vecindad = lineas.slice(Math.max(0, linea - CERCA), linea + CERCA).join('\n');
        if (!vecindad.includes('confirmoConciliacion')) {
          faltan.push(`${relative(RAIZ, archivo)}:${linea + 1} — ${lineas[linea].trim()}`);
        }
      }
    }
    expect(
      faltan,
      'Estas llamadas mueven el saldo y NO reenvían la confirmación: el 400 del ' +
        'candado va a salir por toast y el dueño no va a tener con qué confirmar. ' +
        'Cablea la puerta con `useAvisoDeConciliacion` (formularios) o ' +
        '`useBorrarConAvisoDeConciliacion` (borrados y anulaciones), en ' +
        `features/cash/aviso-de-conciliacion.\n${faltan.join('\n')}`,
    ).toEqual([]);
  });

  /**
   * ⚠️ **ESTA MITAD FALTABA Y EL GUARDIÁN ERA CIEGO JUSTO DONDE IMPORTA**
   * (encontrado por mutación el 2026-11-17). Las puertas que usan react-query
   * no llaman a `api.post` en la pantalla: llaman a `algo.mutateAsync(...)`, y
   * el `api.post` vive en `features/<x>/api.ts`, donde `confirmoConciliacion`
   * SÍ aparece —está en la firma del hook—. Así que la comprobación de arriba
   * miraba el archivo correcto y se quedaba callada mientras la PANTALLA se
   * olvidaba del flag. Medido: cambiar la llamada de Caja por
   * `borrarMovimiento.mutateAsync({ id: m.id })` compilaba, pasaba el lint y
   * dejaba los otros tres tests en verde.
   *
   * Lo que mide esto: si un hook de mutación acepta el flag, todo quien lo
   * llame tiene que pasárselo.
   */
  it('quien llama a un hook de mutación que acepta el flag se lo pasa', () => {
    const hooks = new Set<string>();
    for (const archivo of fuentesTs(join(RAIZ, 'features'))) {
      const src = readFileSync(archivo, 'utf8');
      for (const m of src.matchAll(/export const (use\w+) = \(\) =>([\s\S]{0,900}?);\n/g)) {
        if (m[2].includes('confirmoConciliacion')) hooks.add(m[1]);
      }
    }
    expect(hooks.size, 'ningún hook lleva el flag: ¿se renombró algo?').toBeGreaterThan(0);

    const faltan: string[] = [];
    for (const archivo of fuentesDelPanel()) {
      const src = readFileSync(archivo, 'utf8');
      const lineas = src.split('\n');
      const locales = new Map<string, string>();
      for (const m of src.matchAll(/const (\w+) = (use\w+)\(\)/g)) {
        if (hooks.has(m[2])) locales.set(m[1], m[2]);
      }
      for (const [local, hook] of locales) {
        const uso = new RegExp(`\\b${local}\\.(mutate|mutateAsync)\\s*\\(`);
        lineas.forEach((linea, i) => {
          if (!uso.test(linea)) return;
          const vecindad = lineas.slice(Math.max(0, i - CERCA), i + CERCA).join('\n');
          if (!vecindad.includes('confirmoConciliacion')) {
            faltan.push(`${relative(RAIZ, archivo)}:${i + 1} — ${local} (${hook})`);
          }
        });
      }
    }
    expect(
      faltan,
      'Estas llamadas usan un hook que ACEPTA `confirmoConciliacion` y no se lo ' +
        'pasan: el servidor no lo va a ver, el 400 vuelve y «Guardar igual» ' +
        `parece roto.\n${faltan.join('\n')}`,
    ).toEqual([]);
  });

  it('la pieza del aviso existe UNA sola vez (no varias copias del mismo JSX)', () => {
    // ⚠️ La píldora y el texto se definen en un solo archivo. Si aparece otro
    // que dibuje su propio aviso, las dos versiones se separan el día que el
    // mensaje cambie — el modo de falla que este repo ya pagó caro.
    const definen = fuentesDelPanel()
      .filter((a) =>
        /export function AvisoDeConciliacion|export function useAvisoDeConciliacion/.test(
          readFileSync(a, 'utf8'),
        ),
      )
      .map((a) => relative(RAIZ, a));
    expect(definen).toEqual([join('features', 'cash', 'aviso-de-conciliacion.tsx')]);
  });

  it('nadie reescribe el texto del aviso en el panel', () => {
    // El mensaje lo escribe `mensajeDeConciliacionAfectada` en `shared`. Una
    // frase propia acá diría algo distinto que la del servidor el día que una
    // de las dos cambie.
    const propios: string[] = [];
    for (const archivo of fuentesDelPanel()) {
      const src = readFileSync(archivo, 'utf8');
      const i = src.indexOf('fecha igual o anterior');
      if (i >= 0) propios.push(`${relative(RAIZ, archivo)}:${lineaDe(src, i)}`);
    }
    expect(propios).toEqual([]);
  });
});
