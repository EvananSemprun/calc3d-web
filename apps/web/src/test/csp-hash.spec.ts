import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * EL HASH DEL CSP TIENE QUE SEGUIR AL SCRIPT QUE PROTEGE (2026-11-05).
 *
 * `index.html` lleva UN script inline: el que aplica el tema antes del primer
 * render para que no parpadee. El CSP de `public/_headers` lo permite por su
 * hash sha256 — eso es lo que hace que el CSP sirva, porque la alternativa
 * ('unsafe-inline') dejaría pasar cualquier script inyectado y perdería el 90 %
 * de su valor.
 *
 * ⚠️ **El problema es que ese hash se queda viejo sin avisar.** Si alguien toca
 * el script del tema —una línea, un espacio— el hash cambia, el navegador
 * bloquea el script y **el tema vuelve a parpadear en cada carga**. No falla el
 * build, no falla ningún otro test, y en Report-Only ni siquiera se bloquea:
 * solo aparece una violación en una consola que nadie mira. Este test es lo
 * único que lo convierte en un error visible.
 *
 * Se mide sobre el `index.html` FUENTE y no sobre el construido, a propósito:
 * así corre sin build. Vale porque Vite copia ese script **tal cual** — fue
 * verificado comparando los dos hashes el día que se escribió esto, y si algún
 * día Vite empezara a minificarlo, el CSP fallaría en producción con este test
 * en verde. Si eso pasa, hay que pasar a medir sobre `dist/index.html`.
 */

const RAIZ = join(__dirname, '..', '..');

/** El contenido del único script inline de index.html. */
function scriptDelTema(): string {
  const html = readFileSync(join(RAIZ, 'index.html'), 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .filter((s) => s.trim());
  // Si aparece un segundo script inline, el CSP necesita SU hash también y
  // nadie se va a acordar: que falle acá y no en producción.
  expect(inline).toHaveLength(1);
  return inline[0];
}

const headers = () => readFileSync(join(RAIZ, 'public', '_headers'), 'utf8');

describe('El hash del CSP sigue al script inline', () => {
  it('el hash que declara _headers es el del script de index.html', () => {
    const esperado = createHash('sha256').update(scriptDelTema()).digest('base64');
    expect(headers()).toContain(`'sha256-${esperado}'`);
  });

  // Sin esto, borrar la directiva entera dejaría el test de arriba en verde
  // solo si el hash siguiera escrito en un comentario.
  it('el CSP declara script-src y no cae en unsafe-inline', () => {
    // ⚠️ Ignora los comentarios: el archivo EXPLICA el CSP además de
    // declararlo, y una línea de prosa que lo menciona no es la cabecera. La
    // primera versión de este test se cayó justo ahí — y de paso destapó que
    // el comentario seguía diciendo que no había CSP.
    const linea = headers()
      .split('\n')
      .find((l) => !l.trim().startsWith('#') && l.includes('Content-Security-Policy'));
    expect(linea).toBeDefined();
    expect(linea).toContain("script-src 'self' 'sha256-");
    expect(linea).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  // El resto de las cabeceras no se puede perder al editar este archivo: ya
  // pasó en la tienda, donde una reescritura borró el bloque de caché.
  it('las otras cabeceras de seguridad siguen estando', () => {
    const h = headers();
    for (const cabecera of [
      'Strict-Transport-Security',
      'X-Frame-Options: DENY',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy',
      'Permissions-Policy',
    ]) {
      expect(h).toContain(cabecera);
    }
  });
});
