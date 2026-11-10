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
  'mandá',
] as const;

const RAIZ = path.resolve(__dirname);
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
    for (const ruta of archivos(RAIZ)) {
      if (ruta === ESTE_ARCHIVO) continue;
      const texto = readFileSync(ruta, 'utf8');
      for (const forma of hallazgos(texto)) {
        const n = texto.match(regexDe(forma))?.length ?? 0;
        encontrados.push(`${path.relative(RAIZ, ruta)}: «${forma}» x${n}`);
      }
    }
    expect(encontrados, `Voseo en el panel (usa «tú»):\n${encontrados.join('\n')}`).toEqual([]);
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
