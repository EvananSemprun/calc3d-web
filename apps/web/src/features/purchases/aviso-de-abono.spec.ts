import { describe, expect, it } from 'vitest';
import { avisoDeAbono } from './aviso-de-abono';

/**
 * EL AVISO DEL MONTO DE UN ABONO.
 *
 * El caso que trajo este archivo: tomás $15 del saldo a favor de una factura y
 * los aplicás a otra donde debés $5. **Se puede** —la plata no se pierde ni se
 * inventa: paga los $5 y los otros $10 quedan a favor en la factura nueva—,
 * pero el saldo SALTA de una factura a la otra, y el dueño tiene que verlo
 * antes de confirmar. Hasta el 2026-10-10 esa combinación no caía en ninguno de
 * los tres ternarios del diálogo y pasaba en silencio.
 *
 * ⚠️ El default del formulario ya propone el mínimo, así que esto solo aparece
 * si el monto se sube a mano. Eso lo hace MENOS visible, no menos importante:
 * es justo el camino que nadie recorre por accidente dos veces.
 */
describe('avisoDeAbono', () => {
  describe('con plata (sin saldo a favor de origen)', () => {
    it('no avisa nada cuando se abona lo que falta, o menos', () => {
      expect(avisoDeAbono({ monto: 50, falta: 50, disponible: null })).toBeNull();
      expect(avisoDeAbono({ monto: 20, falta: 50, disponible: null })).toBeNull();
    });

    it('avisa cuánto se paga de más: la factura queda pagada de más', () => {
      expect(avisoDeAbono({ monto: 60, falta: 50, disponible: null })).toEqual({
        clase: 'PAGA_DE_MAS',
        deMas: 10,
      });
    });
  });

  describe('tomado del saldo a favor', () => {
    it('no avisa nada cuando lo tomado entra justo en lo que falta', () => {
      // Lo que propone el formulario por defecto: el mínimo entre lo que falta
      // y lo que hay. Este es el camino normal y tiene que ser silencioso.
      expect(avisoDeAbono({ monto: 5, falta: 5, disponible: 15 })).toBeNull();
      expect(avisoDeAbono({ monto: 3, falta: 5, disponible: 15 })).toBeNull();
    });

    it('⚠️ EL CASO: tomar más de lo que la factura debe dice cuánto queda a favor', () => {
      // $15 de saldo aplicados a una factura donde se deben $5: paga los $5 y
      // los $10 de diferencia quedan a favor en ESTA factura.
      expect(avisoDeAbono({ monto: 15, falta: 5, disponible: 15 })).toEqual({
        clase: 'SALDO_QUE_SALTA',
        tomado: 15,
        falta: 5,
        quedaAFavor: 10,
        yaEstabaPaga: false,
      });
    });

    it('una factura YA PAGA lo marca: el saldo tomado salta entero', () => {
      // Se llega acá desde la tarjeta de una factura sin saldo pendiente, y el
      // formulario propone lo disponible. Sin distinguirlo, el aviso diría "le
      // faltan $0,00", que se lee como un error de la pantalla.
      expect(avisoDeAbono({ monto: 15, falta: 0, disponible: 15 })).toEqual({
        clase: 'SALDO_QUE_SALTA',
        tomado: 15,
        falta: 0,
        quedaAFavor: 15,
        yaEstabaPaga: true,
      });
    });

    it('tomar más de lo que hay en el origen gana sobre todo lo demás', () => {
      // ⚠️ El orden importa: hablarle de cuánto le va a quedar a favor sería
      // hablarle de una plata que no existe. Y es el único caso imposible —el
      // servidor lo rechaza—, así que es el que apaga el botón.
      expect(avisoDeAbono({ monto: 20, falta: 5, disponible: 15 })).toEqual({
        clase: 'SIN_SALDO',
        tomado: 20,
        disponible: 15,
      });
    });

    it('el límite es INCLUSIVO: tomar exacto lo disponible se puede', () => {
      // La misma regla que `evaluarUsoDeSaldo` en shared. Si acá fuera
      // exclusivo, usar todo el saldo de una factura quedaría bloqueado.
      const aviso = avisoDeAbono({ monto: 15, falta: 15, disponible: 15 });
      expect(aviso).toBeNull();
    });

    it('un origen sin nada disponible NO se confunde con pagar con plata', () => {
      // `disponible: 0` es "elegiste una factura que no tiene saldo"; `null` es
      // "pagás con plata". Con un solo valor para las dos, un origen agotado
      // avisaría "queda pagada de más" en vez de "no hay saldo".
      expect(avisoDeAbono({ monto: 5, falta: 5, disponible: 0 })).toEqual({
        clase: 'SIN_SALDO',
        tomado: 5,
        disponible: 0,
      });
    });
  });

  describe('la plata se compara al centavo', () => {
    it('un residuo de coma flotante NO dispara el aviso', () => {
      // 2,9 − 2,7 da 0,2000000000000002 en coma flotante. Sin redondear, un
      // abono exacto mostraría "quedan $0,00 a favor" y el cartel aparecería
      // siempre: el peor aviso posible es el que sale todas las veces.
      expect(avisoDeAbono({ monto: 0.1 + 0.2, falta: 0.3, disponible: 0.3 })).toBeNull();
      expect(avisoDeAbono({ monto: 0.1 + 0.2, falta: 0.3, disponible: null })).toBeNull();
    });

    it('medio centavo no alcanza para avisar, un centavo sí', () => {
      expect(avisoDeAbono({ monto: 5.004, falta: 5, disponible: 15 })).toBeNull();
      expect(avisoDeAbono({ monto: 5.01, falta: 5, disponible: 15 })).toEqual({
        clase: 'SALDO_QUE_SALTA',
        tomado: 5.01,
        falta: 5,
        quedaAFavor: 0.01,
        yaEstabaPaga: false,
      });
    });

    it('un residuo tampoco alcanza para bloquear por falta de saldo', () => {
      // El mismo redondeo del otro lado: 15,000000000000002 sobre 15 no es
      // "tomaste más de lo que hay".
      expect(avisoDeAbono({ monto: 15.000000000000002, falta: 15, disponible: 15 })).toBeNull();
    });
  });
});
