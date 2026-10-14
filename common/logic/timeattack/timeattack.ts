// Contrarreloj: 3 minutos para superar tantos tableros como se pueda, cada vez
// más difíciles. Los tableros de la semana son los mismos para todos (lunes a
// domingo), se juega cuantas veces se quiera y cuenta la mejor partida.

import { generateLevel, type GeneratedLevel } from '../engine/generator.ts';
import { hashSeed } from '../engine/rng.ts';

/** Duración de una partida. */
export const TIME_ATTACK_MS = 3 * 60 * 1000;

/** Lo que cuesta saltar un tablero. */
export const TIME_ATTACK_SKIP_MS = 10_000;

/** Cuenta atrás antes de empezar (el reloj de la partida arranca al acabar). */
export const TIME_ATTACK_COUNTDOWN_MS = 3_000;

/** Margen para la red al enviar el último tablero justo al acabar el tiempo. */
export const TIME_ATTACK_GRACE_MS = 3_000;

/** Tableros que puede tener una partida (nadie llega, pero pone un límite). */
export const TIME_ATTACK_MAX_BOARDS = 80;

/** Puntos de un tablero superado: más cuanto más avanzado, y un bonus en el óptimo. */
export const TIME_ATTACK_POINTS = { base: 100, perBoard: 20, perfect: 50 } as const;

/** Nivel del modo libre de cada tablero: empieza fácil y sube uno por tablero. */
export function timeAttackLevel(index: number): number {
  return Math.min(4 + index, 26);
}

/** El tablero `index` (desde 0) de la semana: el mismo para todos. */
export function timeAttackBoard(week: string, index: number): GeneratedLevel {
  return generateLevel(timeAttackLevel(index), hashSeed(`skid-timeattack:${week}:${index}`), { rejectDeadEnds: true });
}

/** Puntos por superar el tablero `index` con `moves` movimientos. */
export function boardPoints(index: number, moves: number, optimal: number): { points: number; perfect: boolean } {
  const perfect = moves <= optimal;
  const points = TIME_ATTACK_POINTS.base + TIME_ATTACK_POINTS.perBoard * index + (perfect ? TIME_ATTACK_POINTS.perfect : 0);
  return { points, perfect };
}
