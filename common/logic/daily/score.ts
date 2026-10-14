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
 * Reto diario: el resultado es el número de movimientos del mejor intento, y
 * cada pista cuenta como uno más (menos es mejor; a igualdad, menos tiempo).
 * Reintentar es gratis. Por detrás, cada reto da puntos de liga para la
 * clasificación semanal y las temporadas.
 */
export const GOLF = {
  /** Puntos de liga de un reto hecho en el óptimo. */
  parPoints: 1000,
  /** Puntos de liga que resta cada movimiento de más. */
  perStroke: 100,
  /** Terminar el reto garantiza al menos estos puntos. */
  minimum: 100,
} as const;

/** Movimientos (con las pistas) por encima del óptimo (nunca negativo: el óptimo es el mínimo). */
export function overPar(strokes: number, optimal: number): number {
  return Math.max(0, strokes - optimal);
}

/** Puntos de liga de un resultado: las clasificaciones suman estos puntos día a día. */
export function golfPoints(over: number): number {
  return Math.max(GOLF.minimum, GOLF.parPoints - over * GOLF.perStroke);
}
