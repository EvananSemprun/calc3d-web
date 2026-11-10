import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lo que comparten los GUARDIANES POR CÓDIGO: recorrer los fuentes y recortar
 * la etiqueta que abre un componente. No ejecutan nada, leen el texto y miden
 * estructura.
 *
 * Vive acá y no dentro de un `*.spec.ts` porque ya lo usan dos guardianes
 * (`nombre-accesible.codigo.spec.ts` y `capas-del-modal.codigo.spec.ts`), e
 * importar un spec desde otro spec registraría sus `describe` dos veces.
 */

/** Todos los `.tsx` de un árbol, sin los specs. */
export function fuentesTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return fuentesTsx(ruta);
    if (!/\.tsx$/.test(ruta) || /\.spec\.tsx$/.test(ruta)) return [];
    return [ruta];
  });
}

/**
 * Índice del `>` que cierra la etiqueta que abre en `desde` (respeta llaves y
 * comillas, así un `=>` o un `>` dentro de una prop no la corta antes).
 */
export function finDeEtiqueta(src: string, desde: number): number {
  let llaves = 0;
  let comilla: string | null = null;
  for (let i = desde; i < src.length; i++) {
    const c = src[i];
    if (comilla) {
      if (c === comilla && src[i - 1] !== '\\') comilla = null;
      continue;
    }
    if (llaves > 0 && (c === '"' || c === "'" || c === '`')) comilla = c;
    else if (llaves === 0 && (c === '"' || c === "'")) comilla = c;
    else if (c === '{') llaves++;
    else if (c === '}') llaves--;
    else if (c === '>' && llaves === 0 && src[i - 1] !== '=') return i;
  }
  return src.length;
}

/** Número de línea (1-based) del índice `i`. */
export const lineaDe = (src: string, i: number) => src.slice(0, i).split('\n').length;
