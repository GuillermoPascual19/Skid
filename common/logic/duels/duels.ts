// Duelos en directo: dos jugadores, el mismo tablero nuevo (que ninguno ha
// visto). Cuando los dos están en la sala, empiezan a la vez tras una cuenta
// atrás y cada uno tiene un intento (puede reiniciar, pero el reloj sigue).
// Gana quien haga menos movimientos y, a igualdad, quien tarde menos.

import { generateLevel, type GeneratedLevel } from '../engine/generator.ts';

export type DuelDifficulty = 'easy' | 'medium' | 'hard';

/** Dificultad → nivel del modo libre con el que se genera el tablero (los nombres, en los diccionarios del juego). */
export const DUEL_DIFFICULTIES: Record<DuelDifficulty, { readonly level: number }> = {
  easy: { level: 6 },
  medium: { level: 12 },
  hard: { level: 32 },
};

export function isDuelDifficulty(value: unknown): value is DuelDifficulty {
  // hasOwn y no `in`: `'constructor' in {}` es true (lo hereda de Object).
  return typeof value === 'string' && Object.hasOwn(DUEL_DIFFICULTIES, value);
}

/** Tiempo para que los dos coincidan en la sala desde que se crea el duelo. */
export const DUEL_DURATION_MS = 48 * 60 * 60 * 1000;

/** Se está en la sala si el juego ha avisado en estos últimos milisegundos. */
export const DUEL_PRESENCE_MS = 12_000;

/** Cada cuánto avisa el juego de que sigue en la sala (y pregunta por el rival). */
export const DUEL_POLL_MS = 2_000;

/** Cuenta atrás desde que están los dos hasta que empieza. */
export const DUEL_COUNTDOWN_MS = 4_000;

/** Tiempo para terminar el tablero una vez empezado; quien no acabe, no tiene resultado. */
export const DUEL_LIVE_MS = 20 * 60 * 1000;

export function duelLevel(difficulty: DuelDifficulty, seed: number): GeneratedLevel {
  return generateLevel(DUEL_DIFFICULTIES[difficulty].level, seed, { rejectDeadEnds: true });
}

/** Resultado de un jugador: movimientos y tiempo desde que empezó el duelo. */
export interface DuelResult {
  readonly moves: number;
  readonly timeMs: number;
}

/**
 * Quién gana un duelo terminado y por qué: menos movimientos y, a igualdad,
 * menos tiempo. Quien no lo terminó pierde contra quien sí; si ninguno lo
 * terminó (o empatan en todo), empate.
 */
export function duelVerdict(a: DuelResult | null, b: DuelResult | null): { winner: 'a' | 'b' | 'draw'; by: 'moves' | 'time' | 'noShow' | null } {
  if (!a && !b) return { winner: 'draw', by: null };
  if (!a) return { winner: 'b', by: 'noShow' };
  if (!b) return { winner: 'a', by: 'noShow' };
  if (a.moves !== b.moves) return { winner: a.moves < b.moves ? 'a' : 'b', by: 'moves' };
  if (a.timeMs !== b.timeMs) return { winner: a.timeMs < b.timeMs ? 'a' : 'b', by: 'time' };
  return { winner: 'draw', by: null };
}

export function duelWinner(a: DuelResult | null, b: DuelResult | null): 'a' | 'b' | 'draw' {
  return duelVerdict(a, b).winner;
}
