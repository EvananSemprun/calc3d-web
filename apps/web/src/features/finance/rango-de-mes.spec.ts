import { describe, expect, it } from 'vitest';
import { isCalendarDay } from '@calc3d/shared';
import { rangoDeAnio, rangoDeMes } from './DateRange';

/**
 * EL RANGO DE UN MES TIENE QUE TERMINAR EN UN DÍA QUE EXISTA.
 *
 * El Dashboard lo armaba a mano: `{ from: `${mes}-01`, to: `${mes}-31` }`. En
 * un mes de 30 (o en febrero) ese 31 **no existe**, y los servicios de la API
 * hacen `new Date(\`${to}T23:59:59.999Z\`)`: `2026-02-31` se corre al **3 de
 * marzo**, así que la tarjeta del punto de equilibrio contaba hasta TRES días
 * del mes siguiente como ingresos "del mes". Nadie lo veía porque el número
 * seguía siendo plausible.
 *
 * ⚠️ Y desde que `RangoQuerySchema` valida el calendario, ese `-31` ya no es
 * solo un número mal contado: es un **400** y la tarjeta no se dibuja. Por eso
 * el panel se arregla en el MISMO despliegue que la validación.
 *
 * ⚠️ Hay UNA sola definición del rango de un mes, y el preset "Este mes" usa
 * esta misma: con dos, el día que una cambie el Dashboard y el filtro dirían
 * cosas distintas sobre "este mes".
 */
describe('rangoDeMes', () => {
  it('un mes de 31 termina el 31', () => {
    expect(rangoDeMes('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('un mes de 30 termina el 30, no el 31', () => {
    expect(rangoDeMes('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  });

  it('febrero termina el 28', () => {
    expect(rangoDeMes('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('y el febrero bisiesto, el 29', () => {
    expect(rangoDeMes('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  /**
   * El barrido completo: los 12 meses de un año común y de uno bisiesto. Es la
   * comprobación que de verdad importa, porque el bug no era "febrero": era
   * "cualquier mes que no tenga 31 días", y son CINCO.
   */
  it('los dos extremos existen en el calendario, en los 24 meses de 2026 y 2028', () => {
    const malos: string[] = [];

    for (const anio of [2026, 2028]) {
      for (let m = 1; m <= 12; m++) {
        const { from, to } = rangoDeMes(`${anio}-${String(m).padStart(2, '0')}`);
        if (!isCalendarDay(from)) malos.push(from);
        if (!isCalendarDay(to)) malos.push(to);
      }
    }

    expect(malos).toEqual([]);
  });

  it('el `to` es el ÚLTIMO día del mes, no el primero del siguiente', () => {
    // Un `2026-12-01` como tope dejaría afuera noviembre entero menos un día;
    // un `2026-12-01` como `to` de noviembre metería un día de diciembre.
    expect(rangoDeMes('2026-11').to.slice(0, 7)).toBe('2026-11');
    expect(rangoDeMes('2026-12').to).toBe('2026-12-31');
  });
});

/**
 * EL RANGO DE UN AÑO (2026-10-11).
 *
 * El Dashboard lo armaba a mano (`${anio}-01-01` .. `${anio}-12-31`). No
 * estaba mal —diciembre siempre tiene 31— y por eso era peligroso: funciona,
 * así que invita a copiarlo para un mes donde el 31 no existe, que es el
 * camino por el que el punto de equilibrio contó tres días de marzo como
 * ingresos de febrero.
 */
describe('rangoDeAnio', () => {
  it('va del primero de enero al último de diciembre', () => {
    expect(rangoDeAnio(2026)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  /** Sale de `rangoDeMes`: una sola definición de dónde empieza y termina. */
  it('sus extremos son los mismos que los de enero y diciembre', () => {
    const anio = rangoDeAnio(2024);

    expect(anio.from).toBe(rangoDeMes('2024-01').from);
    expect(anio.to).toBe(rangoDeMes('2024-12').to);
  });

  /** Un bisiesto no cambia los extremos del año, pero sí los de febrero. */
  it('en un año bisiesto sigue dando los mismos extremos', () => {
    expect(rangoDeAnio(2024)).toEqual({ from: '2024-01-01', to: '2024-12-31' });
    expect(rangoDeMes('2024-02').to).toBe('2024-02-29');
  });
});
