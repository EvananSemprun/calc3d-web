/**
 * INVENTARIO: EL PANEL NO RESTA «INGRESOS − GASTOS» POR SU CUENTA (panel).
 *
 * Gemelo del de `calc3d-api` (`common/gasto-operativo.inventario.spec.ts`).
 * La regla de la fase «filamento como inventario»: el filamento le resta al
 * resultado del negocio CUANDO SE CONSUME, no el día que se compra, y eso lo
 * sabe SOLO el servidor (`ConsumoService`). El panel muestra el resultado que
 * el servidor ya calculó (`useResultadoDeOperacion`, `resultado.utilidad`);
 * si una pantalla vuelve a restar `ingresos − gastosOperativos` con las filas
 * de Gastos, el número cuenta el filamento el día que se compró y la misma
 * pantalla vuelve a decir dos ganancias distintas. Compila, los tipos no se
 * quejan y ningún test de función pura lo nota: ya pasó en el Dashboard.
 * Por eso el panel también se recorre.
 *
 * Lo que mira (sin comentarios ni tests):
 *  1. restas del estilo `ingresos - gastos`;
 *  2. restas del estilo `gastos - inversion` (armar a mano los «operativos»);
 *  3. el filtro de operativos hecho a mano (`!r.isInvestment`, `=== false`).
 *
 * Aquí NO hay «pasar por ConsumoService» (el panel no tiene cómo): lo que
 * dibuja el resultado lo recibe del servidor. Un hallazgo solo se perdona
 * desde `EXENCIONES`, que es POR USO (archivo + patrón + trozo de código) y
 * lleva su razón escrita. Cada exención tiene que seguir USÁNDOSE: si el
 * código que justificaba desaparece, el test se pone rojo.
 *
 * ⚠️ Caja NO aplica la regla (decisión del spec): sus pantallas leen lo que
 * da `/cash`, no hacen esta resta, así que no necesitan exención.
 *
 * Un `.spec.ts` no se recorre, así que este archivo no necesita eximirse.
 * Límite conocido: no ve una resta hecha con valores guardados antes en
 * variables de otro nombre (`const a = x; a - y`). Es el precio de un
 * inventario por texto.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Quita comentarios para que un «por qué» que menciona la cuenta no cuente como código. */
function sinComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[ \t])\/\/.*$/gm, '$1');
}

const PATRONES: { nombre: string; re: RegExp }[] = [
  { nombre: 'resta ingresos - gastos', re: /\b(ingresos?|income|revenue|cobrado)\w*\s*-\s*[\w.]*(gasto|expense)/gi },
  { nombre: 'resta gastos - inversión', re: /\b(gastos?|expenses?)\w*\s*-\s*[\w.]*(inversion|investment)/gi },
  { nombre: 'filtro de operativos a mano', re: /!\s*\w+\??\.isInvestment\b|\bisInvestment\s*(===|==)\s*false\b/g },
];

interface Exencion {
  /** Sufijo de la ruta (con `/`). */
  archivo: string;
  patron: string;
  /** Si se da, solo se perdona el hallazgo cuyo código cercano coincide. */
  uso?: RegExp;
  razon: string;
}

const EXENCIONES: Exencion[] = [
  {
    archivo: 'pages/Dashboard.tsx',
    patron: 'resta gastos - inversión',
    uso: /gastos\s*-\s*inversion\s*;/,
    razon:
      'Es lo que SE GASTÓ (KPI «Gastos» y su desglose por pagador), no el resultado. El «Resultado de la ' +
      'operación» sale del servidor (useResultadoDeOperacion): esta resta nunca se le pasa como ganancia.',
  },
  {
    archivo: 'pages/Dashboard.tsx',
    patron: 'filtro de operativos a mano',
    razon:
      'Reparto de lo gastado por pagador y por recurso (gráficos del desglose): excluye la inversión en ' +
      'equipos para cuadrar con el KPI «Gastos». No calcula ninguna ganancia.',
  },
  {
    archivo: 'features/finance/expenses-view.ts',
    patron: 'filtro de operativos a mano',
    razon: 'La casilla «Solo inversión» de la lista de Gastos: decide qué filas se ven, no suma ni calcula ninguna ganancia.',
  },
];

interface Hallazgo {
  archivo: string;
  linea: number;
  patron: string;
  texto: string;
  /** Código desde el hallazgo hacia adelante: sirve para decidir una exención por uso. */
  contexto: string;
}

function hallazgosEn(archivo: string, codigo: string): Hallazgo[] {
  const limpio = sinComentarios(codigo);
  const lineas = codigo.split(/\r?\n/);
  const res: Hallazgo[] = [];
  for (const p of PATRONES) {
    for (const m of limpio.matchAll(p.re)) {
      const inicio = m.index ?? 0;
      const linea = limpio.slice(0, inicio).split('\n').length;
      res.push({
        archivo,
        linea,
        patron: p.nombre,
        texto: lineas[linea - 1].trim(),
        contexto: limpio.slice(inicio, inicio + 300),
      });
    }
  }
  return res;
}

function exencionDe(h: Hallazgo, exenciones: Exencion[] = EXENCIONES): Exencion | undefined {
  const ruta = h.archivo.replace(/\\/g, '/');
  return exenciones.find(
    (e) => ruta.endsWith(e.archivo) && e.patron === h.patron && (!e.uso || e.uso.test(h.contexto)),
  );
}

function infraccionesEn(archivo: string, codigo: string, exenciones: Exencion[] = EXENCIONES): Hallazgo[] {
  return hallazgosEn(archivo, codigo).filter((h) => !exencionDe(h, exenciones));
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
    ['const utilidad = ingresos - gastosOperativos;'],
    ['const neto = ventas + abonos - gastos;'.replace('ventas + abonos', 'ingresos')],
    ['const ganancia = resultado.ingresos - resultado.gastosOperativos;'],
    ['const margen = income - operatingExpenses;'],
    ['const gastosOperativos = gastos - inversion;'],
    ['const operativos = filas.filter((r) => !r.isInvestment);'],
    ['filas.filter((r) => r.isInvestment === false)'],
    ['{resultado.ingresos - gastos}'],
  ])('caza %j', (codigo) => {
    expect(hallazgosEn('x.tsx', codigo).length).toBeGreaterThan(0);
  });

  it.each([
    ['// antes: const utilidad = ingresos - gastosOperativos'],
    ['{/* const utilidad = ingresos - gastosOperativos */}'],
    ['const ingresos = ventas + abonos;'],
    ['const total = ventas - devoluciones;'],
    ['<NumberTicker value={resultado.utilidad} format={money} />'],
    ['cobrado − gastos operativos'], // el texto de una etiqueta (con «−» de verdad) no es una resta
    ['const inversion = filas.filter((e) => e.isInvestment).length;'],
  ])('no se queja de %j', (codigo) => {
    expect(hallazgosEn('x.tsx', codigo)).toEqual([]);
  });

  it('la exención es POR USO: perdona el desglose del Dashboard y NO una resta del resultado en el mismo archivo', () => {
    const f = 'src/pages/Dashboard.tsx';
    expect(infraccionesEn(f, 'const gastosOperativos = gastos - inversion;')).toEqual([]);
    expect(infraccionesEn(f, 'const utilidad = ingresos - gastosOperativos;').length).toBeGreaterThan(0);
  });

  it('una exención no se hereda por parecido de nombre ni en otra carpeta', () => {
    expect(infraccionesEn('src/pages/Dashboard2.tsx', 'const gastosOperativos = gastos - inversion;').length).toBeGreaterThan(0);
    expect(infraccionesEn('src/pages/Otra.tsx', 'const utilidad = ingresos - gastos;').length).toBeGreaterThan(0);
  });
});

describe('inventario: el panel no arma el resultado del negocio por su cuenta', () => {
  const archivos = recorrer(RAIZ);
  const leidos = archivos.map((a) => ({ ruta: relative(RAIZ, a), codigo: readFileSync(a, 'utf8') }));

  it('el recorrido ve código (si no, el inventario estaría ciego)', () => {
    expect(archivos.length).toBeGreaterThan(100);
    expect(archivos.some((a) => a.endsWith('Dashboard.tsx'))).toBe(true);
    expect(archivos.some((a) => a.endsWith('expenses-view.ts'))).toBe(true);
  });

  it('ve los usos que ya existen (sin esto, patrones rotos darían verde sin mirar nada)', () => {
    const todos = leidos.flatMap((f) => hallazgosEn(f.ruta, f.codigo));
    const de = (fin: string) => todos.filter((h) => h.archivo.replace(/\\/g, '/').endsWith(fin));
    expect(de('pages/Dashboard.tsx').some((h) => h.patron === 'resta gastos - inversión')).toBe(true);
    expect(de('pages/Dashboard.tsx').some((h) => h.patron === 'filtro de operativos a mano')).toBe(true);
  });

  it('ninguna pantalla resta ingresos − gastos por su cuenta', () => {
    const infracciones = leidos.flatMap((f) => infraccionesEn(f.ruta, f.codigo));
    const informe = infracciones.map((h) => `${h.archivo}:${h.linea} [${h.patron}] ${h.texto}`).join('\n');

    // Si salta: el resultado lo calcula el servidor (`useResultadoDeOperacion`,
    // `resultado.utilidad`). Hay que mostrarlo, no rehacerlo. Si de verdad esa cuenta
    // NO es el resultado (es «lo gastado»), se agrega a EXENCIONES con su razón.
    expect(informe).toBe('');
  });

  it('cada exención sigue USÁNDOSE (una que nadie necesita es un agujero con permiso)', () => {
    const todos = leidos.flatMap((f) => hallazgosEn(f.ruta, f.codigo));
    const huerfanas = EXENCIONES.filter((e) => !todos.some((h) => exencionDe(h, [e]))).map(
      (e) => `${e.archivo} [${e.patron}]`,
    );
    expect(huerfanas).toEqual([]);
  });

  it('toda exención trae su razón escrita', () => {
    for (const e of EXENCIONES) expect(e.razon.trim().length).toBeGreaterThan(30);
  });
});
