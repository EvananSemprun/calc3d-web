import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { IMPERATIVOS_DE_VOSEO } from '@calc3d/shared';

/**
 * Guardián de idioma: el panel habla de «tú», nunca de voseo.
 *
 * ⚠️ Las formas van CON ACENTO y como palabra completa. Sin el acento,
 * `hace`/`toca`/`mira`/`registra` son tercera persona del indicativo
 * («el motor hace la cuenta») y dan 133 falsos positivos solo en el panel:
 * un guardián que grita por todo lo apaga alguien a la semana.
 *
 * ⚠️ La lista NO se recorta a las diez formas que nombró el dueño: con ésas el
 * inventario da 27 ocurrencias en 17 archivos; con la lista completa, 116 en 60.
 *
 * Se exporta para que la API use LA MISMA lista.
 */
/**
 * ⚠️ Dos listas, y SE TRATAN DISTINTO a propósito (no las «unifiques»):
 * - La de IMPERATIVOS depende del IDIOMA: una forma que es voseo en el panel lo
 *   es en la API. Por eso **ya no se copia**: vive en
 *   `packages/shared/src/idioma.ts`, el único artefacto que `pnpm sync:shared`
 *   mantiene idéntico entre los dos repos, y los dos guardianes la importan de
 *   ahí. Hasta el 2026-11-10 los dos DECLARABAN que eran idénticas y **nada lo
 *   comprobaba**: coincidían de casualidad (74 formas), y el día que una sumara
 *   una forma el otro repo perdía cobertura con todo en verde — que es
 *   literalmente el incidente que creó estos guardianes.
 * - `PALABRAS_PERMITIDAS` depende del CORPUS de cada repo (qué palabras
 *   legítimas usa): es DISTINTA en cada uno y cada entrada tiene que usarse en
 *   ESTE código. Tratar las dos como «del corpus» dejó al panel con la lista
 *   corta.
 *
 * Se re-exporta con el nombre viejo para no tocar a quien ya la importaba.
 */
export const FORMAS_DE_VOSEO = IMPERATIVOS_DE_VOSEO;

/**
 * Presente de voseo POR PATRÓN: toda palabra terminada en `-ás`, `-és` o `-ís`
 * (anotás, pagás, elegís...) se marca sin que nadie la enumere.
 *
 * ⚠️ Las terminadas en `-rás`/`-rés`/`-rís` TAMBIÉN se marcan. Antes se excluían
 * por ser el futuro del tuteo (verás, tendrás), pero eso escondía el voseo de los
 * verbos en `-rar` (comprás, cobrás, declarás, mostrás, esperás, enterás). Se
 * prefiere el falso positivo, que se ve y se arregla con una entrada en
 * `PALABRAS_PERMITIDAS`, al falso negativo, que no avisa.
 *
 * Los imperativos (`cargá`, `volvé`) NO se pueden cazar por patrón (`está`,
 * `acá`, `todavía`...), por eso para ellos queda la lista explícita de arriba.
 *
 * ⚠️ Si el guardián marca una palabra LEGÍTIMA (no es voseo), agrégala a
 * `PALABRAS_PERMITIDAS` en minúscula. Cada entrada tiene que seguir apareciendo
 * en el código (hay un test): una lista blanca con palabras que ya nadie usa
 * es la forma lenta de desactivar el guardián.
 */
export const PALABRAS_PERMITIDAS = [
  'más',
  'además',
  'después',
  'demás',
  'revés',
  'estás',
  // Aparecen al barrer `shared` (arnés vive solo en la API): código de país y
  // «estar» en tú (subjuntivo).
  // Adverbio, no voseo (schemas/store.ts).
  'jamás',
  'país',
  'estés',
  // `-rás/-rés`: futuro del tuteo y adverbios, medidos en este corpus.
  'atrás',
  'detrás',
  'verás',
] as const;

const PATRON_PRESENTE = /(?<![\p{L}\p{N}_])[\p{L}]*(?:ás|és|ís)(?![\p{L}\p{N}_])/giu;

export function presentesDeVoseo(texto: string): string[] {
  const permitidas: readonly string[] = PALABRAS_PERMITIDAS;
  return (texto.match(PATRON_PRESENTE) ?? [])
    .map((p) => p.toLowerCase())
    .filter((p) => !permitidas.includes(p));
}

// El panel y la copia sincronizada de `shared`: si se corrige en calc3d-api y
// nadie sincroniza, el panel seguiría con voseo y ningún test lo notaría.
const RAICES = [path.resolve(__dirname), path.resolve(__dirname, '../../../packages/shared/src')];
const RAIZ = RAICES[0];
const ESTE_ARCHIVO = path.resolve(__dirname, 'idioma.spec.ts');

/**
 * El ÚNICO archivo exento además de este spec: la lista de formas del voseo.
 * Es la lista misma, no texto de cara al usuario, y sin la exención se
 * denunciaría a sí misma. Hay un test que fija que la exención sea exactamente
 * esa — una exención que crece es la forma lenta de apagar el guardián.
 */
const LISTA_DE_FORMAS = path.resolve(__dirname, '../../../packages/shared/src/idioma.ts');
const EXENTOS = [ESTE_ARCHIVO, LISTA_DE_FORMAS];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });
}

/** Palabra completa: sin letra pegada delante ni detrás (Unicode, no solo ASCII). */
function regexDe(forma: string): RegExp {
  return new RegExp(String.raw`(?<![\p{L}\p{N}_])${forma}(?![\p{L}\p{N}_])`, 'giu');
}

export function hallazgos(texto: string): string[] {
  return FORMAS_DE_VOSEO.filter((forma) => regexDe(forma).test(texto));
}

describe('idioma del panel', () => {
  it('ningún archivo del panel usa voseo', () => {
    const encontrados: string[] = [];
    for (const ruta of RAICES.flatMap(archivos)) {
      if (EXENTOS.includes(ruta)) continue;
      const texto = readFileSync(ruta, 'utf8');
      for (const forma of hallazgos(texto)) {
        const n = texto.match(regexDe(forma))?.length ?? 0;
        encontrados.push(
          `${path.relative(path.resolve(RAIZ, '../../..'), ruta)}: «${forma}» x${n}`,
        );
      }
    }
    expect(encontrados, `Voseo en el panel (usa «tú»):\n${encontrados.join('\n')}`).toEqual([]);
  });

  it('ningún archivo del panel usa el presente de voseo (-ás/-és/-ís)', () => {
    const encontrados: string[] = [];
    for (const ruta of RAICES.flatMap(archivos)) {
      if (EXENTOS.includes(ruta)) continue;
      for (const palabra of new Set(presentesDeVoseo(readFileSync(ruta, 'utf8')))) {
        encontrados.push(`${path.relative(path.resolve(RAIZ, '../../..'), ruta)}: «${palabra}»`);
      }
    }
    expect(
      encontrados,
      `Voseo en el panel (usa «tú»):\n${encontrados.join('\n')}\n` +
        'Si la palabra es legítima (no es voseo), agrégala a PALABRAS_PERMITIDAS en idioma.spec.ts.',
    ).toEqual([]);
  });

  it('el patrón caza voseo que nadie enumeró y deja pasar lo legítimo', () => {
    expect(presentesDeVoseo('Si escribís o elegís algo')).toEqual(['escribís', 'elegís']);
    expect(
      presentesDeVoseo('Después verás que estás además más aquí, atrás y detrás, el revés'),
    ).toEqual([]);
    // El voseo de los verbos en -rar ya no se cuela por la excepción del futuro.
    expect(presentesDeVoseo('lo que comprás y declarás')).toEqual(['comprás', 'declarás']);
  });

  it('la lista blanca no está vacía y cada entrada sigue usándose en el código', () => {
    expect(PALABRAS_PERMITIDAS.length).toBeGreaterThan(0);
    const todo = RAICES.flatMap(archivos)
      .filter((r) => !EXENTOS.includes(r))
      .map((r) => readFileSync(r, 'utf8').toLowerCase())
      .join('\n');
    const sinUso = PALABRAS_PERMITIDAS.filter(
      (p) => !new RegExp(String.raw`(?<![\p{L}\p{N}_])${p}(?![\p{L}\p{N}_])`, 'u').test(todo),
    );
    expect(sinUso, `Entradas de la lista blanca que ya nadie usa: ${sinUso.join(', ')}`).toEqual(
      [],
    );
  });

  it('la lista de formas llega de shared y el barrido la exime (y nada más)', () => {
    // Importando una lista vacía —o dejando de importarla— el guardián seguiría
    // verde sin revisar un solo imperativo.
    expect(FORMAS_DE_VOSEO.length).toBeGreaterThan(70);
    expect(FORMAS_DE_VOSEO).toContain('tocá');
    const barridos = RAICES.flatMap(archivos).filter((r) => !EXENTOS.includes(r));
    // Barre `shared`, pero no el archivo de la lista…
    expect(barridos.some((r) => r.includes(`shared`))).toBe(true);
    expect(barridos).not.toContain(LISTA_DE_FORMAS);
    // …y la exención no se amplió a nada más.
    expect(EXENTOS).toHaveLength(2);
  });

  it('la lista cubre más que las diez formas del pedido original', () => {
    expect(FORMAS_DE_VOSEO.length).toBeGreaterThan(10);
  });

  it('no marca la tercera persona sin acento', () => {
    expect(hallazgos('el motor hace la cuenta, toca el botón, mira y registra')).toEqual([]);
  });

  it('sí marca el voseo con acento y como palabra completa', () => {
    expect(hallazgos('Tocá acá y mirá el total')).toEqual(['tocá', 'mirá']);
  });
});
