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

export interface DailyStats {
  /** Movimientos totales, sumando los de todos los reintentos. */
  readonly moves: number;
  readonly optimal: number;
  readonly retries: number;
  /** Pistas pedidas (los registros anteriores a las pistas no las tienen). */
  readonly hints?: number;
  readonly timeMs: number;
}

export interface DailyScore {
  readonly total: number;
  readonly movePenalty: number;
  readonly retryPenalty: number;
  readonly hintPenalty: number;
  readonly timePenalty: number;
  /** Segundos "gratis" antes de que el tiempo empiece a restar. */
  readonly parSeconds: number;
}

export const SCORING = {
  base: 1000,
  minimum: 100,
  perExtraMove: 25,
  perRetry: 60,
  perHint: 100,
  parSecondsPerOptimalMove: 3,
  perSecondOverPar: 2,
  maxTimePenalty: 400,
} as const;

/**
 * Puntuación del reto diario (más es mejor). Se parte de 1000 y se resta:
 * - 25 por cada movimiento por encima del óptimo,
 * - 60 por cada reintento,
 * - 100 por cada pista,
 * - 2 por cada segundo por encima del par (3 s por movimiento óptimo), hasta 400.
 * Terminar el reto garantiza al menos 100 puntos.
 */
export function dailyScore(stats: DailyStats): DailyScore {
  const movePenalty = Math.max(0, stats.moves - stats.optimal) * SCORING.perExtraMove;
  const retryPenalty = stats.retries * SCORING.perRetry;
  const hintPenalty = (stats.hints ?? 0) * SCORING.perHint;
  const parSeconds = stats.optimal * SCORING.parSecondsPerOptimalMove;
  const overPar = Math.max(0, Math.floor(stats.timeMs / 1000) - parSeconds);
  const timePenalty = Math.min(SCORING.maxTimePenalty, overPar * SCORING.perSecondOverPar);
  const total = Math.max(SCORING.minimum, SCORING.base - movePenalty - retryPenalty - hintPenalty - timePenalty);
  return { total, movePenalty, retryPenalty, hintPenalty, timePenalty, parSeconds };
}
