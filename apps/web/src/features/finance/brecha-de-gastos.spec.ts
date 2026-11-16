import type { ResultadoDeOperacion } from '@calc3d/shared';
import { describe, expect, it } from 'vitest';
import { textoDeLaBrecha } from './brecha-de-gastos';

/**
 * LA BRECHA ENTRE «GASTOS» Y EL RESULTADO, EN LAS DOS DIRECCIONES.
 *
 * El pie se dibujaba solo con `filamentoEnEstante > 0`: con el estante NEGATIVO
 * desaparecía y la brecha quedaba al revés sin que nada la explicara. El signo
 * negativo no tenía un solo test.
 */

const money = (n: number) => `$${n.toFixed(2)}`;

const base: ResultadoDeOperacion = {
  ingresos: 500,
  gastosOperativos: 179,
  utilidad: 321,
  filamentoEnEstante: 21,
  mesesCompletos: ['2026-09', '2026-10'],
  tramosSueltos: false,
  mesesSinContar: [],
  mesesConConsumoNegativo: [],
  ajustePorMedicion: 0,
};

describe('textoDeLaBrecha', () => {
  it('estante POSITIVO con el rango entero contado: dice que ese filamento sigue en el estante', () => {
    const t = textoDeLaBrecha(base, money);
    expect(t).toContain('«Gastos» incluye $21.00');
    expect(t).toContain('sigue en el estante');
    expect(t).toContain('hasta que se consuma');
  });

  it('estante NEGATIVO: dice que el resultado resta MÁS, y no desaparece', () => {
    const t = textoDeLaBrecha({ ...base, filamentoEnEstante: -40 }, money);
    expect(t).not.toBeNull();
    expect(t).toContain('resta $40.00 MÁS que «Gastos»');
    expect(t).toContain('se había comprado antes');
    // No puede decir lo contrario de lo que pasó.
    expect(t).not.toContain('sigue en el estante');
  });

  it('estante en 0: no dice nada (el silencio es el caso normal)', () => {
    expect(textoDeLaBrecha({ ...base, filamentoEnEstante: 0 }, money)).toBeNull();
  });

  /**
   * Con un tramo sin contar, X son TODAS las compras de ese tramo porque no hay
   * consumo deducible — no porque el material esté sin usar: pudo haberse
   * impreso entero. Afirmar «sigue en el estante» ahí es afirmar de más.
   */
  it('rango PARCIAL: dice «todavía no se puede descontar», no «sigue en el estante»', () => {
    const t = textoDeLaBrecha({ ...base, filamentoEnEstante: 20, mesesSinContar: ['2026-10'] }, money);
    expect(t).toContain('$20.00 de filamento que todavía no se puede descontar');
    expect(t).toContain('no hay conteo cerrado');
    expect(t).not.toContain('sigue en el estante');
  });

  it('un tramo sin contar con estante NEGATIVO sigue diciendo la dirección, que es lo que importa', () => {
    const t = textoDeLaBrecha({ ...base, filamentoEnEstante: -15, mesesSinContar: ['2026-10'] }, money);
    expect(t).toContain('resta $15.00 MÁS que «Gastos»');
  });

  it('no se decide con `tramosSueltos` sino con la LISTA: un bool en true sin meses no cambia el texto', () => {
    // ⚠️ Misma regla que `NotasDelResultado`: se DECIDE con el mismo dato con el que se REDACTA.
    const t = textoDeLaBrecha({ ...base, tramosSueltos: true, mesesSinContar: [] }, money);
    expect(t).toContain('sigue en el estante');
  });
});
