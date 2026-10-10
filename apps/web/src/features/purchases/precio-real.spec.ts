import { describe, expect, it } from 'vitest';
import { avisoDePrecio, preciosRealesDeLaLinea } from './precio-real';
import type { InvoiceLine } from './api';

/**
 * ⚠️ **El precio informado cambia el total de la factura, así que no puede
 * pasar en silencio.** Pediste 10 a $7 y te cobraron $7,50: la factura pasa de
 * $70 a $73. Un número de plata que se mueve sin que la pantalla diga por qué
 * miente de la peor manera, la que nadie nota.
 *
 * Los números están puestos a mano, igual que en el motor.
 */
const linea = (over: Partial<InvoiceLine> = {}): InvoiceLine => ({
  id: 'l1',
  materialId: 'mat-1',
  materialName: 'PLA Negro',
  printerId: null,
  printerName: null,
  nombreNuevo: null,
  nuevoTipo: null,
  quantity: 10,
  unitPrice: 7,
  received: 0,
  porRecibir: 10,
  recepciones: [],
  ...over,
});

describe('avisoDePrecio — lo que la pantalla dice ANTES de guardar', () => {
  it('al precio pactado no hay nada que avisar', () => {
    expect(avisoDePrecio(7, 7, 6)).toBeNull();
  });

  it('sin precio informado tampoco: se usa el de la línea', () => {
    expect(avisoDePrecio(7, null, 6)).toBeNull();
  });

  it('$7,50 contra $7 pedidos: más caro, 0,50 por unidad y $3 en esta entrega', () => {
    expect(avisoDePrecio(7, 7.5, 6)).toEqual({
      masCaro: true,
      porUnidad: 0.5,
      enEstaEntrega: 3,
    });
  });

  /** Más barato también se avisa: también cambia el total. */
  it('$6,50 contra $7 pedidos: más barato, −0,50 y −$3', () => {
    expect(avisoDePrecio(7, 6.5, 6)).toEqual({
      masCaro: false,
      porUnidad: -0.5,
      enEstaEntrega: -3,
    });
  });

  /** Un rollo regalado es un dato verdadero: 0 no es "no informó nada". */
  it('un precio informado de 0 SÍ se avisa', () => {
    expect(avisoDePrecio(7, 0, 2)).toEqual({ masCaro: false, porUnidad: -7, enEstaEntrega: -14 });
  });

  /**
   * ⚠️ Se compara al centésimo de centavo (4 decimales), la misma precisión con
   * la que el motor redondea. Sin eso, un precio que vuelve de la base como
   * 7,4999999 se avisaría como distinto de 7,50 y el cartel aparecería siempre.
   */
  it('una diferencia por basura de coma flotante no es una diferencia', () => {
    expect(avisoDePrecio(7.5, 7.5 + 1e-9, 6)).toBeNull();
  });

  it('la diferencia también sale limpia de decimales: 19,99 contra 18', () => {
    expect(avisoDePrecio(18, 19.99, 3)).toEqual({
      masCaro: true,
      porUnidad: 1.99,
      enEstaEntrega: 5.97,
    });
  });
});

describe('preciosRealesDeLaLinea — lo que la lista muestra DESPUÉS', () => {
  it('sin recepciones no hay nada que mostrar', () => {
    expect(preciosRealesDeLaLinea(linea())).toEqual([]);
  });

  it('una entrega al precio pactado no se marca', () => {
    const l = linea({
      received: 6,
      recepciones: [{ id: 'g1', date: '2026-10-10T00:00:00.000Z', quantity: 6, unitPrice: 7 }],
    });

    expect(preciosRealesDeLaLinea(l)).toEqual([]);
  });

  it('6 que te cobraron a $7,50 se muestran con su precio', () => {
    const l = linea({
      received: 6,
      recepciones: [{ id: 'g1', date: '2026-10-10T00:00:00.000Z', quantity: 6, unitPrice: 7.5 }],
    });

    expect(preciosRealesDeLaLinea(l)).toEqual([{ quantity: 6, unitPrice: 7.5 }]);
  });

  /** Dos entregas al mismo precio distinto se juntan en una sola línea. */
  it('dos entregas al mismo precio se agrupan: 3 + 3 = 6 a $7,50', () => {
    const l = linea({
      received: 6,
      recepciones: [
        { id: 'g1', date: '2026-10-05T00:00:00.000Z', quantity: 3, unitPrice: 7.5 },
        { id: 'g2', date: '2026-10-09T00:00:00.000Z', quantity: 3, unitPrice: 7.5 },
      ],
    });

    expect(preciosRealesDeLaLinea(l)).toEqual([{ quantity: 6, unitPrice: 7.5 }]);
  });

  it('dos precios distintos se muestran por separado, en el orden en que llegaron', () => {
    const l = linea({
      received: 6,
      recepciones: [
        { id: 'g1', date: '2026-10-05T00:00:00.000Z', quantity: 3, unitPrice: 7.5 },
        { id: 'g2', date: '2026-10-09T00:00:00.000Z', quantity: 3, unitPrice: 8 },
      ],
    });

    expect(preciosRealesDeLaLinea(l)).toEqual([
      { quantity: 3, unitPrice: 7.5 },
      { quantity: 3, unitPrice: 8 },
    ]);
  });

  /** Y la que llegó a lo pactado no ensucia el aviso de la que no. */
  it('solo se muestran las que difieren: la de $7 se calla', () => {
    const l = linea({
      received: 6,
      recepciones: [
        { id: 'g1', date: '2026-10-05T00:00:00.000Z', quantity: 4, unitPrice: 7 },
        { id: 'g2', date: '2026-10-09T00:00:00.000Z', quantity: 2, unitPrice: 9 },
      ],
    });

    expect(preciosRealesDeLaLinea(l)).toEqual([{ quantity: 2, unitPrice: 9 }]);
  });

  /** Una recepción sin cantidad no dice a cuánto salió la unidad: no se avisa. */
  it('una recepción de 0 unidades no se muestra', () => {
    const l = linea({
      received: 6,
      recepciones: [{ id: 'g1', date: '2026-10-10T00:00:00.000Z', quantity: 0, unitPrice: 0 }],
    });

    expect(preciosRealesDeLaLinea(l)).toEqual([]);
  });
});
