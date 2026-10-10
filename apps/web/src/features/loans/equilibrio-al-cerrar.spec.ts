import { describe, expect, it } from 'vitest';
import { breakEvenLevels, monthlyLoanPayments } from '@calc3d/shared';
import { paraEquilibrio, type Loan } from './api';

/**
 * CERRAR UN PRÉSTAMO CAMBIA EL PUNTO DE EQUILIBRIO. Esto lo fija.
 *
 * El nivel 2 ("además pagar la cuota") sale de los préstamos **ABIERTOS**:
 * `monthlyLoanPayments` filtra por `!closedAt`. Así que `closedAt` no es un
 * sello de archivo — es lo que deja de exigirle al negocio esa cuota. Es
 * justamente lo que el dueño va a necesitar cuando termine de pagarle al
 * prestamista: un préstamo saldado pero sin cerrar **sigue pidiendo su cuota**
 * todos los meses.
 *
 * ⚠️ Se mide por el camino REAL del panel (`paraEquilibrio` → `shared`), no
 * llamando a `monthlyLoanPayments` con objetos escritos a mano: la cuota viaja
 * en SU frecuencia y el puente es el que la normaliza. Un `paraEquilibrio` que
 * dejara de pasar `closedAt` haría que cerrar no cambiara nada, y un test que
 * salteara el puente no se enteraría.
 */
const prestamo = (over: Partial<Loan> = {}): Loan =>
  ({
    id: 'l1',
    name: 'Deuda impresora',
    concept: null,
    principal: 1000,
    installmentTarget: 100,
    paymentFrequency: 'MONTHLY',
    counterparty: null,
    nextDueDate: null,
    startDate: null,
    closedAt: null,
    notes: null,
    printer: null,
    payments: [],
    paid: 1000,
    balance: 0,
    progress: 1,
    status: 'PAGADO',
    estimate: { atTarget: 0, atActualPace: 0, actualPace: null, unit: 'MONTHLY' },
    ...over,
  }) as Loan;

/** Los mismos costos fijos y margen en los dos escenarios: lo único que cambia es el cierre. */
const niveles = (loans: Loan[]) =>
  breakEvenLevels({
    fixedMonthly: 200,
    marginPct: 0.4,
    loanPayment: monthlyLoanPayments(paraEquilibrio(loans)),
  });

describe('Cerrar un préstamo cambia el punto de equilibrio', () => {
  it('abierto: su cuota entra en el nivel 2, aunque ya esté saldado', () => {
    const abierto = [prestamo()];

    expect(monthlyLoanPayments(paraEquilibrio(abierto))).toBe(100);
    // ($200 fijos + $100 de cuota) ÷ 0,4
    expect(niveles(abierto).withDebt).toBe(750);
  });

  it('cerrado: la cuota sale, y el nivel 2 baja a lo mismo que el nivel 1', () => {
    const cerrado = [prestamo({ closedAt: '2026-10-10T00:00:00.000Z' })];

    expect(monthlyLoanPayments(paraEquilibrio(cerrado))).toBe(0);
    // $200 ÷ 0,4 = 500: son $250/mes MENOS de facturación exigida.
    expect(niveles(cerrado).withDebt).toBe(500);
    expect(niveles(cerrado).withDebt).toBe(niveles(cerrado).survive);
  });

  it('el nivel 1 NO se mueve: cerrar no toca los costos fijos', () => {
    expect(niveles([prestamo()]).survive).toBe(500);
    expect(niveles([prestamo({ closedAt: '2026-10-10T00:00:00.000Z' })]).survive).toBe(500);
  });

  /**
   * ⚠️ El nivel 2 **se OCULTA** cuando no hay cuota (`oculto: cuota <= 0` en el
   * Dashboard). Cerrar el único préstamo no baja el número: hace desaparecer la
   * línea. Por eso cerrar uno que todavía se debe es tan caro — y por eso el
   * servidor no lo deja.
   */
  it('con un solo préstamo, cerrarlo deja la cuota en 0 y el Dashboard esconde el nivel 2', () => {
    const cuota = monthlyLoanPayments(paraEquilibrio([prestamo({ closedAt: '2026-10-10' })]));

    expect(cuota).toBe(0);
    expect(cuota <= 0).toBe(true);
  });

  it('con dos, cerrar uno deja la cuota del otro: no es todo o nada', () => {
    const loans = [
      prestamo({ id: 'l1', closedAt: '2026-10-10' }),
      prestamo({ id: 'l2', installmentTarget: 50, paymentFrequency: 'WEEKLY' }),
    ];

    // $50 por semana normalizados a mes: 50 × (365,2425/7/12) ≈ 217,41.
    expect(monthlyLoanPayments(paraEquilibrio(loans))).toBeCloseTo(217.41, 2);
  });
});
