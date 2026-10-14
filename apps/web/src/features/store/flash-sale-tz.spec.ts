import { describe, it, expect } from 'vitest';
import { isoAInputVenezuela, inputVenezuelaAIso } from './flash-sale-tz';

describe('flash-sale-tz', () => {
  it('ISO UTC → input en hora de Venezuela (UTC-4)', () => {
    expect(isoAInputVenezuela('2026-10-20T22:00:00.000Z')).toBe('2026-10-20T18:00');
  });

  it('input en hora de Venezuela → ISO UTC', () => {
    expect(inputVenezuelaAIso('2026-10-20T18:00')).toBe('2026-10-20T22:00:00.000Z');
  });

  it('cruza el día para atrás sin corrimiento', () => {
    // 20:00 Caracas del 20 = 00:00Z del 21
    expect(inputVenezuelaAIso('2026-10-20T20:00')).toBe('2026-10-21T00:00:00.000Z');
    expect(isoAInputVenezuela('2026-10-21T00:00:00.000Z')).toBe('2026-10-20T20:00');
  });

  it('vacío/null se manejan sin romper', () => {
    expect(isoAInputVenezuela(null)).toBe('');
    expect(isoAInputVenezuela('')).toBe('');
    expect(inputVenezuelaAIso('')).toBeNull();
  });

  it('ida y vuelta es identidad', () => {
    const iso = '2026-12-01T03:30:00.000Z';
    expect(inputVenezuelaAIso(isoAInputVenezuela(iso))).toBe(iso);
  });
});
