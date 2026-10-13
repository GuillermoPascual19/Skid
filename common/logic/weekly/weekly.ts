// Reto semanal: un tablero más grande y difícil para toda la semana (de lunes
// a domingo, hora de Madrid). Se juega cuantas veces se quiera, sin pistas, y
// cuenta el mejor intento. El servidor lo genera una vez y lo guarda.

import { weekRange } from '../daily/daily.ts';
import { generateLevel, type GeneratedLevel } from '../engine/generator.ts';
import { hashSeed } from '../engine/rng.ts';

/** Dificultad del reto semanal, en la escala del modo libre (con nieve y corrientes). */
export const WEEKLY_LEVEL = 30;

/** Semana ("YYYY-MM-DD" de su lunes) que contiene `day`. */
export function weekKey(day: string): string {
  return weekRange(day).from;
}

export function weeklyLevel(week: string): GeneratedLevel {
  return generateLevel(WEEKLY_LEVEL, hashSeed(`skid-weekly:${week}`), { rejectDeadEnds: true });
}
