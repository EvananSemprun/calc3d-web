/**
 * INVENTARIO: NADIE COMPARA EL ESTADO DE UNA FICHA A MANO (panel).
 *
 * Gemelo del de `calc3d-api` (`common/estado-de-ficha.inventario.spec.ts`), por
 * la misma razón: `MaterialStatus` tiene tres valores y la pregunta «¿esta
 * ficha entra acá?» se contesta SOLO con los predicados de shared
 * (`entraEnReposicion`, `entraEnCalculadora`, `entraEnCompras`, `entraEnConteo`,
 * `estadoTrasComprar`) y los rótulos con `ETIQUETA_DE_ESTADO`/`SUFIJO_DE_ESTADO`.
 * Una comparación contra texto (`status === 'DISCONTINUED'`) compila igual con
 * el valor nuevo y trata el tercer estado como si fuera ACTIVE: nada la avisa.
 * Por eso el panel también se recorre.
 *
 * Mira (sin comentarios ni tests): `===`/`!==` contra un valor del enum,
 * `case 'X'` y `status === 'ACTIVE'`. NO mira ESCRIBIR el estado
 * (`{ status: 'DISCONTINUED' }` o un `<option value="DISCONTINUED">`): decir
 * qué estado poner no es decidir quién entra a una pantalla.
 *
 * Un `.spec.ts` no se recorre, así que este archivo no necesita eximirse.
 * Límite conocido: no ve el valor guardado antes en una variable.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const VALORES = ['DISCONTINUED', 'SOLO_PEDIDO_ESPECIAL'];
const Q = '[\'"`]';
const alt = VALORES.join('|');

/** Quita comentarios para que un «por qué» que menciona la comparación no cuente como código. */
function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[ \t])\/\/.*$/gm, '$1');
}

const PATRONES: { nombre: string; re: RegExp }[] = [
  { nombre: 'comparación (valor a la derecha)', re: new RegExp(`(===|!==|==|!=)\\s*${Q}(${alt})${Q}`, 'g') },
  { nombre: 'comparación (valor a la izquierda)', re: new RegExp(`${Q}(${alt})${Q}\\s*(===|!==|==|!=)`, 'g') },
  { nombre: 'case', re: new RegExp(`\\bcase\\s+${Q}(${alt})${Q}`, 'g') },
  // ACTIVE también es un valor de CampaignStatus: solo se vigila `status ===/!== 'ACTIVE'`.
  { nombre: 'status contra ACTIVE', re: new RegExp(`\\bstatus\\s*(===|!==)\\s*${Q}ACTIVE${Q}`, 'g') },
];

interface Hallazgo {
  archivo: string;
  linea: number;
  patron: string;
  texto: string;
}

function hallazgosEn(archivo: string, codigo: string): Hallazgo[] {
  const limpio = sinComentarios(codigo);
  const res: Hallazgo[] = [];
  for (const p of PATRONES) {
    for (const m of limpio.matchAll(p.re)) {
      const linea = limpio.slice(0, m.index).split('\n').length;
      res.push({ archivo, linea, patron: p.nombre, texto: codigo.split(/\r?\n/)[linea - 1].trim() });
    }
  }
  return res;
}

function recorrer(dir: string, salida: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) recorrer(p, salida);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(spec|test)\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) {
      salida.push(p);
    }
  }
  return salida;
}

const RAIZ = join(__dirname, '..');

describe('el detector del inventario (un inventario que no ve nada pasaría siempre en verde)', () => {
  it.each([
    ["const descontinuada = fila.status === 'DISCONTINUED';"],
    ["items.filter((m) => m.status !== 'DISCONTINUED')"],
    ["if ('SOLO_PEDIDO_ESPECIAL' === s) x();"],
    ["switch (s) {\n case 'DISCONTINUED':\n return 1;\n}"],
    ["f.status === 'ACTIVE' && 'text-destructive'"],
  ])('caza %j', (codigo) => {
    expect(hallazgosEn('x.tsx', codigo).length).toBeGreaterThan(0);
  });

  it.each([
    ["// antes: status === 'DISCONTINUED'"],
    ["{/* if (s === 'DISCONTINUED') */}"],
    ["{ id, status: nuevo ? 'ACTIVE' : 'DISCONTINUED' }"], // ESCRIBIR el estado no es compararlo
    ['<option value="DISCONTINUED">Descontinuadas</option>'],
    ["campaignDisplayStatus(c) === 'ACTIVE'"],
    ["const ok = entraEnReposicion(f.status);"],
  ])('no se queja de %j', (codigo) => {
    expect(hallazgosEn('x.tsx', codigo)).toEqual([]);
  });
});

describe('inventario: el panel no compara el estado de una ficha a mano', () => {
  const archivos = recorrer(RAIZ);

  it('el recorrido ve código (si no, el inventario estaría ciego)', () => {
    expect(archivos.length).toBeGreaterThan(100);
    expect(archivos.some((a) => a.endsWith('StockTab.tsx'))).toBe(true);
    expect(archivos.some((a) => a.endsWith('ExpenseModal.tsx'))).toBe(true);
  });

  it('ninguna comparación cruda contra un estado', () => {
    const hallazgos = archivos.flatMap((a) => hallazgosEn(relative(RAIZ, a), readFileSync(a, 'utf8')));
    const informe = hallazgos.map((h) => `${h.archivo}:${h.linea} [${h.patron}] ${h.texto}`).join('\n');

    // Si salta: usa los predicados de @calc3d/shared en vez de comparar.
    expect(informe).toBe('');
  });
});
