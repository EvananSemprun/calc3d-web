import {
  MaterialCorrectionSchema,
  MaterialStatusBatchSchema,
  MaterialStatusUpdateSchema,
  StockMonthCloseSchema,
  StockMonthReopenSchema,
  TipoDeCarreteCreateSchema,
  TipoDeCarreteSchema,
  TipoDeCarreteUpdateSchema,
} from './stock';

describe('StockMonthCloseSchema', () => {
  it('acepta el mes con sus conteos', () => {
    const r = StockMonthCloseSchema.parse({
      month: '2026-08',
      counts: [{ materialId: 'm1', sealed: 1, inUse: 0, running: 2 }],
    });

    expect(r.counts[0]).toEqual({ materialId: 'm1', sealed: 1, inUse: 0, running: 2 });
  });

  it('una casilla que no vino llega como 0: casillas vacías = no hay', () => {
    const r = StockMonthCloseSchema.parse({ month: '2026-08', counts: [{ materialId: 'm1' }] });

    expect(r.counts[0]).toMatchObject({ sealed: 0, inUse: 0, running: 0 });
  });

  it('sin conteos es válido: todas las fichas quedan en 0', () => {
    expect(StockMonthCloseSchema.parse({ month: '2026-08' }).counts).toEqual([]);
  });

  it('rechaza rollos negativos', () => {
    const r = StockMonthCloseSchema.safeParse({
      month: '2026-08',
      counts: [{ materialId: 'm1', sealed: -1 }],
    });

    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(['counts', 0, 'sealed']);
  });

  it('rechaza un mes mal escrito', () => {
    expect(StockMonthCloseSchema.safeParse({ month: '2026-8' }).success).toBe(false);
  });

  it('rechaza rollos que no son enteros', () => {
    const r = StockMonthCloseSchema.safeParse({
      month: '2026-08',
      counts: [{ materialId: 'm1', sealed: 1.5 }],
    });

    expect(r.success).toBe(false);
  });

  it('rechaza una ficha sin id', () => {
    const r = StockMonthCloseSchema.safeParse({ month: '2026-08', counts: [{ materialId: '' }] });

    expect(r.success).toBe(false);
  });

  it('no acepta más de 500 fichas en un cierre', () => {
    const counts = Array.from({ length: 501 }, (_, i) => ({ materialId: `m${i}` }));

    expect(StockMonthCloseSchema.safeParse({ month: '2026-08', counts }).success).toBe(false);
  });
});

describe('StockMonthReopenSchema', () => {
  it('solo pide el mes', () => {
    expect(StockMonthReopenSchema.parse({ month: '2026-08' })).toEqual({ month: '2026-08' });
  });

  it('rechaza un mes inválido', () => {
    expect(StockMonthReopenSchema.safeParse({ month: '2026-13' }).success).toBe(false);
  });
});

describe('MaterialStatusUpdateSchema', () => {
  it('acepta descontinuar y reactivar', () => {
    expect(MaterialStatusUpdateSchema.parse({ status: 'DISCONTINUED' })).toEqual({ status: 'DISCONTINUED' });
    expect(MaterialStatusUpdateSchema.parse({ status: 'ACTIVE' })).toEqual({ status: 'ACTIVE' });
  });

  it('rechaza un estado que no existe o que falta', () => {
    expect(MaterialStatusUpdateSchema.safeParse({ status: 'BORRADO' }).success).toBe(false);
    expect(MaterialStatusUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('descarta cualquier otro campo', () => {
    expect(MaterialStatusUpdateSchema.parse({ status: 'ACTIVE', rollPrice: 0 })).toEqual({ status: 'ACTIVE' });
  });
});

/**
 * Corregir una ficha: nombre, color, marca y tipo (los dos últimos desde el
 * 2026-10-09). El precio sale de la compra y los gramos quedan como nacieron.
 */
describe('MaterialCorrectionSchema', () => {
  it('deja nombre, color, marca y tipo; lo demás se descarta', () => {
    const r = MaterialCorrectionSchema.parse({
      name: ' PLA Negro ',
      color: ' Negro ',
      brand: ' Bambu Lab ',
      type: ' PETG ',
      rollPrice: 1,
      rollGrams: 250,
      status: 'DISCONTINUED',
      organizationId: 'org-B',
    });

    expect(r).toEqual({ name: 'PLA Negro', color: 'Negro', brand: 'Bambu Lab', type: 'PETG' });
  });

  /**
   * ⚠️ Los gramos reescriben el costo POR GRAMO de todas las compras pasadas de
   * esa ficha. Que el schema los descarte es lo único que lo impide: el
   * servicio pasa el DTO entero a Prisma.
   */
  it('los gramos del rollo NO se pueden corregir, aunque vengan en el body', () => {
    expect(MaterialCorrectionSchema.parse({ rollGrams: 250 })).toEqual({});
  });

  it('marca y tipo vacíos quedan sin marca y sin tipo', () => {
    expect(MaterialCorrectionSchema.parse({ brand: '', type: '  ' })).toEqual({
      brand: null,
      type: null,
    });
  });

  it('un nombre en blanco no vale', () => {
    expect(MaterialCorrectionSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('un color vacío queda sin color', () => {
    expect(MaterialCorrectionSchema.parse({ color: '' })).toEqual({ color: null });
  });
});

describe('MaterialStatusBatchSchema', () => {
  it('acepta una lista de ids con un estado', () => {
    expect(MaterialStatusBatchSchema.parse({ ids: ['a', 'b'], status: 'DISCONTINUED' })).toEqual({
      ids: ['a', 'b'],
      status: 'DISCONTINUED',
    });
  });

  it('rechaza una lista vacía, un estado inválido y un lote desmesurado', () => {
    expect(MaterialStatusBatchSchema.safeParse({ ids: [], status: 'ACTIVE' }).success).toBe(false);
    expect(MaterialStatusBatchSchema.safeParse({ ids: ['a'], status: 'BORRADO' }).success).toBe(false);
    expect(MaterialStatusBatchSchema.safeParse({ ids: Array(201).fill('a'), status: 'ACTIVE' }).success).toBe(false);
  });
});

describe('TipoDeCarrete: topes del contrato', () => {
  const ok = { nombre: 'Carrete Bambu', gramos: 250 };

  it('el nombre llega a 80 letras y no a 81 (salida, alta y edición)', () => {
    const justo = 'x'.repeat(80);
    const pasado = 'x'.repeat(81);
    expect(TipoDeCarreteCreateSchema.safeParse({ ...ok, nombre: justo }).success).toBe(true);
    expect(TipoDeCarreteCreateSchema.safeParse({ ...ok, nombre: pasado }).success).toBe(false);
    expect(TipoDeCarreteUpdateSchema.safeParse({ nombre: justo }).success).toBe(true);
    expect(TipoDeCarreteUpdateSchema.safeParse({ nombre: pasado }).success).toBe(false);
    expect(TipoDeCarreteSchema.safeParse({ id: 'a', ...ok, nombre: pasado }).success).toBe(false);
  });

  it('el peso llega a 1.000.000 g (el techo de la balanza) y no a 1.000.001', () => {
    expect(TipoDeCarreteCreateSchema.safeParse({ ...ok, gramos: 1_000_000 }).success).toBe(true);
    expect(TipoDeCarreteCreateSchema.safeParse({ ...ok, gramos: 1_000_001 }).success).toBe(false);
    expect(TipoDeCarreteUpdateSchema.safeParse({ gramos: 1_000_001 }).success).toBe(false);
    expect(TipoDeCarreteSchema.safeParse({ id: 'a', ...ok, gramos: 1_000_001 }).success).toBe(false);
  });

  it('el alta no lleva id y la edición acepta solo un campo', () => {
    expect(TipoDeCarreteCreateSchema.parse({ id: 'robado', ...ok })).toEqual(ok);
    expect(TipoDeCarreteUpdateSchema.safeParse({ gramos: 300 }).success).toBe(true);
  });
});
