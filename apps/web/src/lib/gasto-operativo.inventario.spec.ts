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
 * desde `EXENCIONES`, que es POR USO (archivo + patrón + **la línea** del hallazgo) y
 * lleva su razón escrita. Cada exención tiene que seguir USÁNDOSE: si el
 * código que justificaba desaparece, el test se pone rojo.
 *
 * ⚠️ **`uso` es OBLIGATORIO y hay un test que lo exige.** Dos de las tres exenciones no
 * lo tenían, o sea que perdonaban el archivo entero para ese patrón — incluido un
 * hallazgo que naciera mañana al lado del que se quiso perdonar.
 *
 * ⚠️ Caja NO aplica la regla (decisión del spec): sus pantallas leen lo que
 * da `/cash`, no hacen esta resta, así que no necesitan exención.
 *
 * Un `.spec.ts` no se recorre, así que este archivo no necesita eximirse.
 * LÍMITES CONOCIDOS (lo que este barrido NO ve; no es un barrido total):
 *  - Una resta con operandos de otro nombre (`const a = ingresos; a - b`, o
 *    `entradas - salidas`): solo reconoce raíces como ingreso/cobrad/vendid/factur
 *    contra gast/egreso/costo/salida/expense, con o sin prefijo.
 *  - Una resta hecha con `reduce`, con `Decimal`/`minus` o dentro de un helper
 *    importado (`restar(a, b)`): solo mira el operador `-`.
 *  - Una pantalla que sume gastos sin restarlos de ningún ingreso.
 *  - Un resultado calculado en `shared` y mostrado acá: eso es del servidor, y lo
 *    vigila el barrido de la API.
 *  - **Qué se recorre**: solo `apps/web/src`, y nada llamado `*.spec.ts` / `*.test.tsx`.
 *    Un lector nuevo fuera de ahí es INVISIBLE — dicho para que el verde no se lea
 *    como cobertura total.
 * Es el precio de un inventario por texto: caza el descuido, no al que quiere
 * esquivarlo.
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
  {
    nombre: 'resta ingresos - gastos',
    // Sin `\b` al principio: así también entra `totalCobrado` o `p.totalGastado`. Sinónimos: egreso, costo, salida.
    // ⚠️ `venta` está en la lista porque es EL nombre que usa el código de este repo y
    // `vendid` NO matchea «ventas»: medido el 15/11, insertar
    // `const utilidadDeLaPantalla = ventas - gastosOperativos;` en `Dashboard.tsx` —justo
    // debajo de la exención, con las dos variables ya en ese ámbito— dejaba el barrido en
    // VERDE 26/26. Es la forma más probable de que la regresión vuelva.
    // El tramo `[-+]` del medio ve las restas con escalas (`ingresos - x - gastos`) y las
    // sumas de por medio (`ventas + abonos - gastos`); el `\(?` ve `ingresos - (gastos + 1)`.
    re: /(ingreso|income|revenue|cobrad|vendid|venta|factur)\w*(?:\s*[-+]\s*[\w.]{1,40}){0,4}?\s*-\s*\(?\s*[\w.]*(gast|expense|egreso|costo|salida)/gi,
  },
  {
    // Por si alguna pantalla resta con decimal.js en vez del operador.
    nombre: 'resta ingresos - gastos con decimal.js',
    re: /(ingreso|income|revenue|cobrad|vendid|venta|factur)\w*\s*\)?\s*\.\s*minus\s*\(\s*\w*\(?\s*[\w.]*(gast|expense|egreso|costo|salida)/gi,
  },
  { nombre: 'resta gastos - inversión', re: /(gast|expense)\w*\s*-\s*[\w.]*(inversion|investment)/gi },
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
      'operación» sale del servidor (useResultadoDeOperacion): esta resta nunca se le pasa como ganancia, y el pie del ' +
      'resultado dice cuánto filamento en el estante explica la brecha entre las dos tarjetas (Dashboard.resultado.spec).',
  },
  {
    archivo: 'pages/Dashboard.tsx',
    patron: 'filtro de operativos a mano',
    uso: /!r\.isInvestment\)/,
    razon:
      'Reparto de lo gastado por pagador y por recurso (gráficos del desglose): excluye la inversión en ' +
      'equipos para cuadrar con el KPI «Gastos». No calcula ninguna ganancia.',
  },
  {
    archivo: 'features/finance/expenses-view.ts',
    patron: 'filtro de operativos a mano',
    uso: /!e\.isInvestment\) return false/,
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

/**
 * El código que una exención por uso puede mirar: **lo que queda de SU línea**.
 *
 * ⚠️ Eran 300 caracteres, y eso es un agujero: un hallazgo escrito ARRIBA del que se
 * quiso perdonar hereda su permiso por alcanzar a leer el código del vecino. Acá muerde
 * de verdad, porque la única exención con `uso` de este barrido (`gastos - inversion`)
 * NO es de una lectura — un segundo `gast… - inversion…` dentro de esos 300 caracteres
 * quedaba exento sin que nadie lo decidiera.
 */
function contextoDe(limpio: string, inicio: number): string {
  const fin = limpio.indexOf('\n', inicio);
  return limpio.slice(inicio, fin === -1 ? limpio.length : fin);
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
        contexto: contextoDe(limpio, inicio),
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
    // ⚠️ ESTA LÍNEA ERA `'const neto = ventas + abonos - gastos;'.replace('ventas + abonos', 'ingresos')`:
    // el fixture **esquivaba** el caso que el barrido no veía, cambiando «ventas» por
    // «ingresos» antes de medir. Un fixture que evita el caso que la guarda cubre es uno
    // de los verdes falsos de esta fase. Ahora entra tal cual, y con ella los cuatro
    // casos medidos sobre los archivos reales.
    ['const neto = ventas + abonos - gastos;'],
    ['const utilidadDeLaPantalla = ventas - gastosOperativos;'],
    ['const x = ingresos - disenio - gastos;'],
    ['const x = ingresos - (gastos + 1);'],
    ['const x = D(ingresos).minus(gastos);'],
    ['const x = totalCobrado.minus(D(totalGastado));'],
    ['const ganancia = resultado.ingresos - resultado.gastosOperativos;'],
    ['const margen = income - operatingExpenses;'],
    ['const gastosOperativos = gastos - inversion;'],
    ['const operativos = filas.filter((r) => !r.isInvestment);'],
    ['filas.filter((r) => r.isInvestment === false)'],
    ['{resultado.ingresos - gastos}'],
    ['const neto = totalCobrado - totalGastado;'],
    ['const neto = p.totalCobrado - p.totalGastado;'],
    ['const x = cobrado - egresos;'],
    ['const x = ingresosDelMes - costoOperativo;'],
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

  /**
   * ⚠️ El `uso` mira SOLO lo que queda de su línea. Con los 300 caracteres que había,
   * el hallazgo de la línea 1 heredó el permiso del de la línea 2 por leer su código.
   */
  it('una exención por uso no se hereda desde la línea de al lado', () => {
    const codigo = [
      'const utilidad = gastos - inversion + 1;',
      'const gastosOperativos = gastos - inversion;',
    ].join('\n');

    const infracciones = infraccionesEn('src/pages/Dashboard.tsx', codigo);
    expect(infracciones.map((h) => h.linea)).toEqual([1]); // el de la línea 2 sigue exento
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

  it('toda exención es POR USO (ninguna perdona el archivo entero)', () => {
    expect(EXENCIONES.filter((e) => !e.uso).map((e) => `${e.archivo} [${e.patron}]`)).toEqual([]);
  });
});
