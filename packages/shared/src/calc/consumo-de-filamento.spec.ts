import { consumoPorMes, MesDeInventario, RolloDelMes } from './consumo-de-filamento';

const rollo = (clave: string, valor: number, pesado = true): RolloDelMes => ({ clave, valor, pesado });
const mes = (m: string, compras: number, sellados: number, abiertos: RolloDelMes[] = []): MesDeInventario => ({
  mes: m,
  compras,
  sellados,
  abiertos,
});

describe('consumoPorMes', () => {
  it('sin cambio de medición el ajuste es 0 y el consumo es inicial + compras − final', () => {
    const r = consumoPorMes([
      mes('2026-10', 0, 100, [rollo('a:inUse', 10)]),
      mes('2026-11', 50, 120, [rollo('a:inUse', 8)]),
    ]);
    expect(r[1].ajuste).toBe(0);
    expect(r[1].inventarioFinal).toBe(128);
    expect(r[1].consumo).toBe(110 + 50 - 128);
  });

  it('un rollo que pasa de sin pesar a pesado: el ajuste lo cancela y el consumo no baja', () => {
    const r = consumoPorMes([
      mes('2026-10', 0, 100, [rollo('a:inUse', 0, false)]),
      mes('2026-11', 0, 90, [rollo('a:inUse', 12, true)]),
    ]);
    // Sin ajuste: 100 − 102 = −2 (consumo negativo). Con ajuste: +12 → 10.
    expect(r[1].ajuste).toBe(12);
    expect(r[1].consumo).toBe(10);
  });

  it('un rollo que pasa de pesado a sin pesar: el ajuste lo cancela y NO aparece un pico de consumo', () => {
    const r = consumoPorMes([
      mes('2026-10', 0, 100, [rollo('a:inUse', 12, true)]),
      mes('2026-11', 0, 90, [rollo('a:inUse', 0, false)]),
    ]);
    // Sin ajuste: 112 − 90 = 22 (pico falso). Con ajuste: −12 → 10.
    expect(r[1].ajuste).toBe(-12);
    expect(r[1].consumo).toBe(10);
  });

  it('el primer mes arranca con inventario inicial 0', () => {
    const r = consumoPorMes([mes('2026-10', 200, 150, [rollo('a:inUse', 20)])]);
    expect(r[0].ajuste).toBe(0);
    expect(r[0].consumo).toBe(200 - 170);
  });

  // Una medición que no existe en uno de los dos meses no se puede comparar, así
  // que no genera ajuste. Esto NO evita un pico por unir fichas: eso lo garantiza
  // `unir` (apps/api/src/materials/materials.service.ts), que reescribe también
  // el mes anterior sumando los conteos. Si esa garantía cae, mirar allá.
  it('una clave que no está en los dos meses no genera ajuste', () => {
    const r = consumoPorMes([
      mes('2026-10', 0, 100, [rollo('a:inUse', 12, true), rollo('b:inUse', 5, true)]),
      mes('2026-11', 0, 90, [rollo('b:inUse', 5, true)]),
    ]);
    expect(r[1].ajuste).toBe(0);
    expect(r[1].consumo).toBe(117 - 95);
  });

  it('una ficha se une el mismo mes en que otra cambia de medición: solo cuenta la que cambió', () => {
    const r = consumoPorMes([
      mes('2026-10', 0, 100, [rollo('a:inUse', 12, true), rollo('b:inUse', 0, false)]),
      mes('2026-11', 0, 90, [rollo('b:inUse', 5, true)]),
    ]);
    // b aparece +5; a (pesado, desaparece) no resta nada.
    expect(r[1].ajuste).toBe(5);
    expect(r[1].consumo).toBe(112 - 95 + 5);
  });

  it('alternancia pesado → sin pesar → pesado: el ajuste es por pares (+v, −v, +v)', () => {
    const r = consumoPorMes([
      mes('2026-09', 0, 100, [rollo('a:inUse', 0, false)]),
      mes('2026-10', 0, 100, [rollo('a:inUse', 8, true)]),
      mes('2026-11', 0, 100, [rollo('a:inUse', 0, false)]),
      mes('2026-12', 0, 100, [rollo('a:inUse', 6, true)]),
    ]);
    expect(r.map((x) => x.ajuste)).toEqual([0, 8, -8, 6]);
  });

  it('cuenta CUÁNTOS rollos cambiaron de medición, separando los que aparecen de los que desaparecen', () => {
    const r = consumoPorMes([
      mes('2026-09', 0, 100, [rollo('a:inUse', 0, false), rollo('b:inUse', 9, true), rollo('c:running', 0, false)]),
      mes('2026-10', 0, 100, [rollo('a:inUse', 8, true), rollo('b:inUse', 0, false), rollo('c:running', 0, false)]),
    ]);
    expect(r[0].rollosPesados).toBe(0);
    expect(r[0].rollosSinPesar).toBe(0);
    // a pasa a pesado (aparece), b a sin pesar (desaparece), c no cambia.
    expect(r[1].rollosPesados).toBe(1);
    expect(r[1].rollosSinPesar).toBe(1);
  });

  it('con un mes sin conteo en el medio, el siguiente parte del último cierre anterior, no de 0', () => {
    const r = consumoPorMes([mes('2026-09', 0, 100), mes('2026-11', 30, 110)]);
    expect(r.map((x) => x.mes)).toEqual(['2026-09', '2026-11']);
    expect(r[1].consumo).toBe(100 + 30 - 110);
  });

  it('ordena los meses por su clave aunque lleguen al revés', () => {
    const r = consumoPorMes([mes('2026-11', 30, 110), mes('2026-09', 0, 100)]);
    expect(r.map((x) => x.mes)).toEqual(['2026-09', '2026-11']);
    expect(r[1].consumo).toBe(20);
  });

  it('la suma de los consumos es compras totales − inventario final, con cualquier mezcla de pesados', () => {
    const meses = [
      mes('2026-08', 40, 60, [rollo('a:inUse', 0, false), rollo('b:running', 9, true)]),
      mes('2026-09', 25, 70, [rollo('a:inUse', 7, true), rollo('b:running', 0, false)]),
      mes('2026-10', 0, 55, [rollo('a:inUse', 0, false), rollo('b:running', 4, true), rollo('c:inUse', 3, true)]),
      mes('2026-11', 80, 100, [rollo('a:inUse', 6, true), rollo('c:inUse', 0, false)]),
    ];
    const r = consumoPorMes(meses);
    const consumos = r.reduce((s, x) => s + x.consumo, 0);
    const compras = meses.reduce((s, x) => s + x.compras, 0);
    // El ajuste se calcula A MANO (no se lee de la salida, o un signo invertido
    // cumpliría la igualdad igual): 08→09 a +7, b −9; 09→10 a −7, b +4 (c no
    // estaba antes: se ignora); 10→11 a +6, c −3.
    const ajusteAMano = 7 - 9 - 7 + 4 + 6 - 3;
    expect(r.reduce((s, x) => s + x.ajuste, 0)).toBe(ajusteAMano);
    expect(consumos).toBeCloseTo(compras - r[r.length - 1].inventarioFinal + ajusteAMano, 6);
  });

  it('si las mediciones no cambian de estado, la suma es exactamente compras totales − inventario final', () => {
    const meses = [
      mes('2026-08', 40, 60, [rollo('a:inUse', 9, true), rollo('b:running', 0, false)]),
      mes('2026-09', 25, 70, [rollo('a:inUse', 7, true), rollo('b:running', 0, false)]),
      mes('2026-10', 10, 55, [rollo('a:inUse', 4, true), rollo('b:running', 0, false)]),
    ];
    const r = consumoPorMes(meses);
    const consumos = r.reduce((s, x) => s + x.consumo, 0);
    expect(consumos).toBeCloseTo(75 - r[2].inventarioFinal, 6);
  });
});
