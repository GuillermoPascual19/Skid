/**
 * Estrellas al terminar un nivel: 3 si se iguala (o mejora) el óptimo,
 * 2 si se supera en 2 movimientos o menos, 1 en otro caso.
 */
export function starsFor(moves: number, optimal: number): 1 | 2 | 3 {
  const extra = moves - optimal;
  if (extra <= 0) return 3;
  if (extra <= 2) return 2;
  return 1;
}

/**
 * Reto diario al estilo golf: el resultado es lo que te pasas del óptimo
 * ("Par" si lo igualas, "+2" con dos golpes de más). Cada movimiento es un
 * golpe y cada pista suma otro. Reintentar es gratis: cuenta el mejor intento.
 */
export const GOLF = {
  /** Puntos de liga (semanal, mensual) de un reto al par. */
  parPoints: 1000,
  /** Puntos de liga que resta cada golpe de más. */
  perStroke: 100,
  /** Terminar el reto garantiza al menos estos puntos. */
  minimum: 100,
} as const;

/** Golpes por encima del óptimo (nunca negativo: el óptimo es el mínimo). */
export function overPar(strokes: number, optimal: number): number {
  return Math.max(0, strokes - optimal);
}

/** Puntos de liga de un resultado: las clasificaciones suman estos puntos día a día. */
export function golfPoints(over: number): number {
  return Math.max(GOLF.minimum, GOLF.parPoints - over * GOLF.perStroke);
}

/** "Par" o "+N". */
export function golfLabel(over: number): string {
  return over <= 0 ? 'Par' : `+${over}`;
}
