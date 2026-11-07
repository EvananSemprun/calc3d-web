import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * EL ICONO DE LA PESTAÑA SON DOS ARCHIVOS, Y PERDER UNO NO AVISA (2026-11-07).
 *
 * El isotipo de la marca es **negro puro** (luminancia medida 0.0/255). Contra
 * el fondo de una pestaña en tema oscuro (#202124) da **1.30:1** de contraste:
 * no se ve. Medido con contraste WCAG el día que se puso el favicon, junto con
 * el resto de las variantes de marca:
 *
 *     NEGRO    21.00:1 en claro ·  1.30:1 en oscuro
 *     AMARILLO  1.40:1 en claro · 11.52:1 en oscuro
 *     BLANCO    1.13:1 en claro · 14.25:1 en oscuro
 *     AZUL      17.71:1 en claro ·  1.10:1 en oscuro
 *
 * **Ninguna sirve para los dos temas** — ni el amarillo, que era la apuesta
 * intuitiva y se cayó al medirla. Por eso se declaran dos y elige el navegador.
 *
 * ⚠️ **Por qué este test:** si alguien borra `icono-oscuro.png`, o le cambia el
 * nombre, o saca la media query, el navegador cae al negro y **el icono
 * desaparece para quien use tema oscuro**. No falla el build, no falla ningún
 * otro test, y nadie lo nota porque quien desarrolla no mira su propia pestaña.
 * Es el mismo tipo de fallo silencioso que el hash del CSP (`csp-hash.spec.ts`).
 */

const RAIZ = join(__dirname, '..', '..');
const html = () => readFileSync(join(RAIZ, 'index.html'), 'utf8');

/** Los `<link rel="icon">` del HTML, en orden, con su `media`. */
function iconos(): { href: string; media: string | null }[] {
  return [...html().matchAll(/<link\b[^>]*\brel="icon"[^>]*>/g)].map(([etiqueta]) => ({
    href: /href="([^"]+)"/.exec(etiqueta)?.[1] ?? '',
    media: /media="([^"]+)"/.exec(etiqueta)?.[1] ?? null,
  }));
}

describe('El icono de la pestaña se ve en los dos temas', () => {
  it('declara dos: uno sin media (respaldo) y uno para tema oscuro', () => {
    const ls = iconos();

    expect(ls).toHaveLength(2);
    expect(ls[0].media).toBeNull();
    expect(ls[1].media).toBe('(prefers-color-scheme: dark)');
  });

  // ⚠️ El orden NO es estético: donde `media` se ignora en `rel="icon"`, el
  // navegador se queda con el ÚLTIMO. El respaldo va primero a propósito.
  it('el respaldo sin media va PRIMERO', () => {
    const sinMedia = iconos().findIndex((l) => l.media === null);

    expect(sinMedia).toBe(0);
  });

  it('los dos archivos existen de verdad y son PNG no vacíos', () => {
    for (const { href } of iconos()) {
      const archivo = join(RAIZ, 'public', href.replace(/^\//, ''));

      expect(existsSync(archivo), `Falta ${href} en public/`).toBe(true);
      expect(statSync(archivo).size).toBeGreaterThan(1000);
      // Firma PNG: los bytes 1-3 son "PNG".
      expect(readFileSync(archivo).subarray(1, 4).toString('ascii')).toBe('PNG');
    }
  });

  // Si los dos apuntaran al mismo archivo, todo lo de arriba pasaría y el tema
  // oscuro seguiría sin icono visible: exactamente el bug que esto previene.
  it('son archivos DISTINTOS, o la media query no sirve de nada', () => {
    const [claro, oscuro] = iconos().map(({ href }) =>
      readFileSync(join(RAIZ, 'public', href.replace(/^\//, ''))),
    );

    expect(claro.equals(oscuro)).toBe(false);
  });
});
