import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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
export const FORMAS_DE_VOSEO = [
  'abonás', 'tenés', 'podés', 'tocá', 'mirá', 'dejalo', 'registrá', 'elegí',
  'hacé', 'ingresá', 'avisá', 'sacá', 'pasá', 'verificá', 'poné', 'cargá',
  'borrá', 'revisá', 'usá', 'sumá', 'decí', 'fijate', 'acordate', 'escribí',
  'mandá', 'corregí', 'volvé', 'cargala', 'contá', 'llená', 'cerrá', 'anotá',
  'publicá', 'cambiá', 'marcá', 'recargá',
] as const;

/**
 * Presente de voseo POR PATRÓN: toda palabra terminada en `-ás`, `-és` o `-ís`
 * (anotás, pagás, elegís...) se marca sin que nadie la enumere. Se excluyen las
 * terminadas en `-rás`/`-rés`/`-rís`: es el futuro del tuteo (verás, tendrás).
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
  'más', 'además', 'después', 'demás', 'revés', 'estás',
  // Aparecen al barrer `shared` (jamás y arnés viven solo en la API): código de país y
  // «estar» en tú (subjuntivo).
  'país', 'estés',
] as const;

const PATRON_PRESENTE = /(?<![\p{L}\p{N}_])[\p{L}]*(?<!r)(?:ás|és|ís)(?![\p{L}\p{N}_])/giu;

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
      if (ruta === ESTE_ARCHIVO) continue;
      const texto = readFileSync(ruta, 'utf8');
      for (const forma of hallazgos(texto)) {
        const n = texto.match(regexDe(forma))?.length ?? 0;
        encontrados.push(`${path.relative(path.resolve(RAIZ, '../../..'), ruta)}: «${forma}» x${n}`);
      }
    }
    expect(encontrados, `Voseo en el panel (usa «tú»):\n${encontrados.join('\n')}`).toEqual([]);
  });

  it('ningún archivo del panel usa el presente de voseo (-ás/-és/-ís)', () => {
    const encontrados: string[] = [];
    for (const ruta of RAICES.flatMap(archivos)) {
      if (ruta === ESTE_ARCHIVO) continue;
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
    expect(presentesDeVoseo('Después verás que estás además más aquí, tendrás el revés')).toEqual([]);
  });

  it('la lista blanca no está vacía y cada entrada sigue usándose en el código', () => {
    expect(PALABRAS_PERMITIDAS.length).toBeGreaterThan(0);
    const todo = RAICES.flatMap(archivos)
      .filter((r) => r !== ESTE_ARCHIVO)
      .map((r) => readFileSync(r, 'utf8').toLowerCase())
      .join('\n');
    const sinUso = PALABRAS_PERMITIDAS.filter(
      (p) => !new RegExp(String.raw`(?<![\p{L}\p{N}_])${p}(?![\p{L}\p{N}_])`, 'u').test(todo),
    );
    expect(sinUso, `Entradas de la lista blanca que ya nadie usa: ${sinUso.join(', ')}`).toEqual([]);
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
