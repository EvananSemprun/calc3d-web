import { promedioPorFicha, valorDelInventario, FichaValorizable } from './valor-inventario';

const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);
const HASTA = dia('2026-12-01');

describe('promedioPorFicha', () => {
  const dosCompras = [
    { materialId: 'a', amount: 40, quantity: 2, date: dia('2026-01-01') },
    { materialId: 'a', amount: 22, quantity: 1, date: dia('2026-02-01') },
  ];

  it('promedia por rollo: $40 por 2 rollos y $22 por 1 dan $20,67', () => {
    expect(promedioPorFicha(dosCompras, HASTA).get('a')).toBe(20.6667);
  });

  it('NO promedia precios unitarios: ese camino daría $21,00 y está mal', () => {
    expect(promedioPorFicha(dosCompras, HASTA).get('a')).not.toBe(21);
  });

  it('el rollo regalado no entra: una compra en $0 no baja el promedio', () => {
    const m = promedioPorFicha(
      [
        { materialId: 'a', amount: 20, quantity: 1, date: dia('2026-01-01') },
        { materialId: 'a', amount: 0, quantity: 1, date: dia('2026-02-01') },
      ],
      HASTA,
    );
    expect(m.get('a')).toBe(20);
  });

  it('una compra sin cantidad no entra: no infla el costo por rollo', () => {
    const m = promedioPorFicha(
      [
        { materialId: 'a', amount: 20, quantity: 1, date: dia('2026-01-01') },
        { materialId: 'a', amount: 100, quantity: null, date: dia('2026-02-01') },
        { materialId: 'a', amount: 100, quantity: 0, date: dia('2026-03-01') },
      ],
      HASTA,
    );
    expect(m.get('a')).toBe(20);
  });

  it('corta en la fecha: una compra posterior a `hasta` no cuenta', () => {
    const m = promedioPorFicha(
      [
        { materialId: 'a', amount: 20, quantity: 1, date: dia('2026-01-01') },
        { materialId: 'a', amount: 40, quantity: 1, date: dia('2026-12-01') },
        { materialId: 'a', amount: 60, quantity: 1, date: dia('2026-12-15') },
      ],
      HASTA,
    );
    expect(m.get('a')).toBe(20);
  });

  it('una ficha sin ninguna compra válida no aparece en el mapa', () => {
    const m = promedioPorFicha(
      [
        { materialId: 'a', amount: 0, quantity: 1, date: dia('2026-01-01') },
        { materialId: 'b', amount: 10, quantity: null, date: dia('2026-01-01') },
        { materialId: 'c', amount: 10, quantity: 1, date: dia('2027-01-01') },
      ],
      HASTA,
    );
    expect(m.size).toBe(0);
  });
});

const ficha = (p: Partial<FichaValorizable>): FichaValorizable => ({
  materialId: 'a',
  sealed: 0,
  abiertosSinPesar: 0,
  pesados: [],
  promedioDelRollo: 20,
  gramosDelRollo: 1000,
  ...p,
});

describe('valorDelInventario', () => {
  it('un rollo sellado vale el promedio entero', () => {
    const v = valorDelInventario([ficha({ sealed: 3 })]);
    expect(v).toEqual({ sellados: 60, abiertosPesados: 0, total: 60, rollosSinPesar: 0, sinPrecio: 0 });
  });

  it('un rollo pesado vale (balanza − carrete) × promedio / gramosDelRollo', () => {
    // 750 − 250 = 500 g de 1000: media bobina a $20 = $10
    const v = valorDelInventario([
      ficha({ pesados: [{ pesoEnBalanza: 750, pesoDelCarrete: 250 }] }),
    ]);
    expect(v.abiertosPesados).toBe(10);
    expect(v.total).toBe(10);
    expect(v.rollosSinPesar).toBe(0);
  });

  it('un rollo abierto sin pesar vale 0 y suma a rollosSinPesar', () => {
    const v = valorDelInventario([ficha({ abiertosSinPesar: 2 })]);
    expect(v.total).toBe(0);
    expect(v.rollosSinPesar).toBe(2);
  });

  it('una ficha sin promedio no vale 0: sus rollos van a sinPrecio', () => {
    const v = valorDelInventario([
      ficha({
        promedioDelRollo: null,
        sealed: 2,
        abiertosSinPesar: 1,
        pesados: [{ pesoEnBalanza: 750, pesoDelCarrete: 250 }],
      }),
    ]);
    expect(v.total).toBe(0);
    expect(v.sinPrecio).toBe(4);
    expect(v.rollosSinPesar).toBe(0);
  });

  it('balanza menor que el carrete: el rollo vale 0 y cuenta como sin pesar, nunca negativo', () => {
    const v = valorDelInventario([
      ficha({ pesados: [{ pesoEnBalanza: 100, pesoDelCarrete: 250 }] }),
    ]);
    expect(v.abiertosPesados).toBe(0);
    expect(v.total).toBe(0);
    expect(Object.is(v.total, -0)).toBe(false);
    expect(v.rollosSinPesar).toBe(1);
  });

  it('gramosDelRollo en 0: el rollo vale 0 y cuenta como sin pesar, sin dividir por cero', () => {
    const v = valorDelInventario([
      ficha({ gramosDelRollo: 0, pesados: [{ pesoEnBalanza: 750, pesoDelCarrete: 250 }] }),
    ]);
    expect(Number.isFinite(v.total)).toBe(true);
    expect(v.abiertosPesados).toBe(0);
    expect(v.total).toBe(0);
    expect(v.rollosSinPesar).toBe(1);
  });

  it('neto exactamente 0: el rollo está medido y vacío, vale 0 y NO cuenta como sin pesar', () => {
    const v = valorDelInventario([
      ficha({ pesados: [{ pesoEnBalanza: 250, pesoDelCarrete: 250 }] }),
    ]);
    expect(v.abiertosPesados).toBe(0);
    expect(v.total).toBe(0);
    expect(v.rollosSinPesar).toBe(0);
  });

  it('neto mayor que gramosDelRollo: no se recorta, vale más que un sellado y no cuenta como sin pesar', () => {
    // 1270 − 250 = 1020 g de 1000 a $20 = $20,40 (un sellado valdría $20)
    const v = valorDelInventario([
      ficha({ pesados: [{ pesoEnBalanza: 1270, pesoDelCarrete: 250 }] }),
    ]);
    expect(v.abiertosPesados).toBe(20.4);
    expect(v.total).toBe(20.4);
    expect(v.rollosSinPesar).toBe(0);
  });
});
