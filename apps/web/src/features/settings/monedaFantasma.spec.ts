import { describe, expect, it } from 'vitest';
import { monedaPorDefectoFantasma } from './monedaFantasma';

const tasas = [{ label: 'BCV Dólar' }, { label: 'Binance / USDT' }];

describe('monedaPorDefectoFantasma', () => {
  it('avisa cuando el nombre guardado no existe entre las tasas', () => {
    // El caso real: quedó «Bolívar (BCV)» y las tasas se llaman «BCV Dólar».
    expect(monedaPorDefectoFantasma('Bolívar (BCV)', tasas)).toBe(true);
  });

  it('no avisa cuando la tasa existe', () => {
    expect(monedaPorDefectoFantasma('BCV Dólar', tasas)).toBe(false);
  });

  it('no avisa sin moneda por defecto: trabajar en dólares es válido', () => {
    expect(monedaPorDefectoFantasma(null, tasas)).toBe(false);
    expect(monedaPorDefectoFantasma(undefined, tasas)).toBe(false);
  });

  it('no avisa con la lista vacía: ahí el mensaje es «agrega una tasa»', () => {
    expect(monedaPorDefectoFantasma('Bolívar (BCV)', [])).toBe(false);
  });

  it('distingue mayúsculas y espacios, como la API', () => {
    // La comparación del servidor es exacta: si acá fuera tolerante, el panel diría
    // que está bien y la tienda seguiría sin bolívares.
    expect(monedaPorDefectoFantasma('bcv dólar', tasas)).toBe(true);
    expect(monedaPorDefectoFantasma('BCV Dólar ', tasas)).toBe(true);
  });
});
