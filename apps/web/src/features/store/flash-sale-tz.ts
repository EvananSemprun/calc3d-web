// Venezuela usa un offset FIJO de UTC-4 (sin horario de verano desde 2016).
// El dueño piensa las fechas de la oferta en su hora; se guardan en UTC.
const OFFSET_MS = 4 * 60 * 60 * 1000;
const OFFSET = '-04:00';

/** ISO UTC → valor para <input type="datetime-local"> en hora de Venezuela. */
export function isoAInputVenezuela(iso: string | null): string {
  if (!iso) return '';
  const caracas = new Date(new Date(iso).getTime() - OFFSET_MS);
  // El instante desplazado, leído como UTC, ES la hora de pared en Caracas.
  return caracas.toISOString().slice(0, 16);
}

/** Valor de <input datetime-local> (hora de Venezuela) → ISO UTC. */
export function inputVenezuelaAIso(local: string): string | null {
  if (!local) return null;
  return new Date(`${local}:00${OFFSET}`).toISOString();
}
