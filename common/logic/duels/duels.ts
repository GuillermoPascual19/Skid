// Duelos: dos jugadores, el mismo tablero nuevo (que ninguno ha visto) y 48 h
// para jugarlo. Estilo golf: cuenta el mejor intento de cada uno, sin pistas, y
// a igualdad de movimientos gana quien tardó menos.

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

/** Tiempo para jugarlo desde que se crea el duelo. */
export const DUEL_DURATION_MS = 48 * 60 * 60 * 1000;

export function duelLevel(difficulty: DuelDifficulty, seed: number): GeneratedLevel {
  return generateLevel(DUEL_DIFFICULTIES[difficulty].level, seed, { rejectDeadEnds: true });
}

/** Mejor intento de un jugador: movimientos y tiempo desde que empezó hasta conseguirlo. */
export interface DuelResult {
  readonly moves: number;
  readonly timeMs: number;
}

/**
 * Quién gana un duelo terminado: menos movimientos y, a igualdad, menos tiempo.
 * Quien no lo terminó pierde contra quien sí; si ninguno lo terminó, empate.
 */
export function duelWinner(a: DuelResult | null, b: DuelResult | null): 'a' | 'b' | 'draw' {
  if (!a && !b) return 'draw';
  if (!a) return 'b';
  if (!b) return 'a';
  if (a.moves !== b.moves) return a.moves < b.moves ? 'a' : 'b';
  if (a.timeMs !== b.timeMs) return a.timeMs < b.timeMs ? 'a' : 'b';
  return 'draw';
}
