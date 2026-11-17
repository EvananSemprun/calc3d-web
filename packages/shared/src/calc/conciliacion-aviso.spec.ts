import {
  conciliacionesQueSeInvalidan,
  cuerpoDeAvisoDeConciliacion,
  leerAvisoDeConciliacion,
  mensajeDeConciliacionAfectada,
  type ConciliacionParaAviso,
} from './conciliacion-aviso';

const c = (id: string, date: string, status: ConciliacionParaAviso['status']): ConciliacionParaAviso => ({
  id,
  date,
  status,
});

describe('conciliacionesQueSeInvalidan', () => {
  it('una fecha anterior a una conciliación CONFIRMADA la invalida', () => {
    const r = conciliacionesQueSeInvalidan(['2026-11-01'], [c('a', '2026-11-05', 'CONFIRMED')]);
    expect(r.map((x) => x.id)).toEqual(['a']);
  });

  it('una conciliación en DRAFT también', () => {
    const r = conciliacionesQueSeInvalidan(['2026-11-01'], [c('a', '2026-11-05', 'DRAFT')]);
    expect(r.map((x) => x.id)).toEqual(['a']);
  });

  it('la MISMA fecha cuenta: el esperado incluye el día de la conciliación', () => {
    const r = conciliacionesQueSeInvalidan(['2026-11-05'], [c('a', '2026-11-05', 'CONFIRMED')]);
    expect(r).toHaveLength(1);
  });

  it('una fecha POSTERIOR no pide nada', () => {
    const r = conciliacionesQueSeInvalidan(['2026-11-06'], [c('a', '2026-11-05', 'CONFIRMED')]);
    expect(r).toEqual([]);
  });

  it('una conciliación ANULADA ya no cuenta para nadie', () => {
    const r = conciliacionesQueSeInvalidan(['2026-11-01'], [c('a', '2026-11-05', 'VOID')]);
    expect(r).toEqual([]);
  });

  it('con varias fechas (editar mueve un movimiento) basta con que una caiga adentro', () => {
    const r = conciliacionesQueSeInvalidan(
      ['2026-11-20', '2026-11-01'],
      [c('a', '2026-11-05', 'CONFIRMED')],
    );
    expect(r).toHaveLength(1);
  });

  it('una Date (fecha de negocio guardada a medianoche UTC) se lee por su día UTC', () => {
    const r = conciliacionesQueSeInvalidan(
      [new Date('2026-11-05T00:00:00.000Z')],
      [c('a', '2026-11-05', 'CONFIRMED')],
    );
    expect(r).toHaveLength(1);
  });
});

describe('mensajeDeConciliacionAfectada', () => {
  it('distingue la confirmada de la borrador y dice cómo seguir', () => {
    const m = mensajeDeConciliacionAfectada([
      c('a', '2026-11-05', 'CONFIRMED'),
      c('b', '2026-11-08', 'DRAFT'),
    ]);
    expect(m).toContain('2026-11-05');
    expect(m).toContain('confirmada');
    expect(m).toContain('borrador');
    expect(m).toContain('confirmando');
    expect(m).toContain('anula');
  });
});

/**
 * EL CUERPO DEL 400, ida y vuelta (2026-11-17).
 *
 * El panel reconoce este 400 entre todos los demás por la clave
 * `conciliacionesAfectadas`. Si el servidor dejara de mandarla, el botón
 * «Guardar igual» no se dibuja y el formulario vuelve a ser un callejón sin
 * salida. Estos tests son esa regresión.
 */
describe('cuerpoDeAvisoDeConciliacion + leerAvisoDeConciliacion', () => {
  const unaConfirmada: ConciliacionParaAviso[] = [
    { id: 'c1', date: new Date('2026-11-16T00:00:00.000Z'), status: 'CONFIRMED' },
  ];

  it('el cuerpo que arma el servidor lo lee el panel', () => {
    const cuerpo = cuerpoDeAvisoDeConciliacion(unaConfirmada);
    expect(cuerpo.conciliacionesAfectadas).toEqual([
      { id: 'c1', date: '2026-11-16', status: 'CONFIRMED' },
    ]);
    const leido = leerAvisoDeConciliacion(cuerpo);
    expect(leido).not.toBeNull();
    expect(leido!.message).toBe(cuerpo.message);
    expect(leido!.conciliacionesAfectadas).toEqual(cuerpo.conciliacionesAfectadas);
  });

  it('el texto sale de la regla, no del panel', () => {
    const cuerpo = cuerpoDeAvisoDeConciliacion(unaConfirmada);
    expect(cuerpo.message).toBe(mensajeDeConciliacionAfectada(unaConfirmada));
    expect(cuerpo.message).toContain('2026-11-16 (confirmada)');
  });

  it('recorta la Date a día: el panel no vuelve a decidir la zona', () => {
    // Medianoche UTC leída por Caracas (−4) daría el 15: por eso se recorta acá.
    const cuerpo = cuerpoDeAvisoDeConciliacion([
      { id: 'c1', date: new Date('2026-11-16T00:00:00.000Z'), status: 'DRAFT' },
    ]);
    expect(cuerpo.conciliacionesAfectadas[0].date).toBe('2026-11-16');
  });

  it('un 400 que NO es este aviso no se confunde con él', () => {
    // El 400 de Zod: mismo status, otra forma. Dibujar «Guardar igual» acá
    // ofrecería reenviar algo que el servidor va a rechazar igual.
    expect(
      leerAvisoDeConciliacion({ message: 'Datos inválidos', errors: [{ path: 'date', message: 'x' }] }),
    ).toBeNull();
    expect(leerAvisoDeConciliacion(undefined)).toBeNull();
    expect(leerAvisoDeConciliacion(null)).toBeNull();
    expect(leerAvisoDeConciliacion('<html>502</html>')).toBeNull();
  });

  it('una lista vacía no es el aviso', () => {
    // El servidor nunca manda el 400 sin afectadas; aceptarlo dibujaría un
    // aviso que no puede nombrar ninguna conciliación.
    expect(leerAvisoDeConciliacion({ message: 'x', conciliacionesAfectadas: [] })).toBeNull();
  });

  it('una lista SOLO de basura tampoco es el aviso', () => {
    // El caso que de verdad separa este candado del resto: la clave está, pero
    // no nombra ninguna conciliación. No hay nada que ofrecer anular.
    expect(
      leerAvisoDeConciliacion({ message: 'x', conciliacionesAfectadas: [null, { id: 7 }, 'nada'] }),
    ).toBeNull();
  });

  it('descarta las entradas malformadas y se queda con las buenas', () => {
    const leido = leerAvisoDeConciliacion({
      message: 'hola',
      conciliacionesAfectadas: [
        { id: 'c1', date: '2026-11-16', status: 'CONFIRMED' },
        { id: 'c2', date: '2026-11-15', status: 'INVENTADO' },
        { date: '2026-11-14', status: 'DRAFT' },
        null,
      ],
    });
    expect(leido!.conciliacionesAfectadas).toEqual([
      { id: 'c1', date: '2026-11-16', status: 'CONFIRMED' },
    ]);
  });

  it('sin texto del servidor arma el de la regla, no una frase propia', () => {
    const leido = leerAvisoDeConciliacion({
      conciliacionesAfectadas: [{ id: 'c1', date: '2026-11-16', status: 'CONFIRMED' }],
    });
    expect(leido!.message).toBe(
      mensajeDeConciliacionAfectada([{ id: 'c1', date: '2026-11-16', status: 'CONFIRMED' }]),
    );
  });
});
