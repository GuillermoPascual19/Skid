// Rachas del reto diario: días seguidos con el reto terminado.
//
// Protectores de racha: cada 7 retos seguidos se gana uno (como mucho se
// guardan MAX_FREEZES). Cada día sin jugar gasta uno y la racha sigue viva,
// aunque ese día no suma. Si faltan protectores para cubrir el hueco, la racha
// se rompe y se pierden los que quedaban.

import { shiftDay } from './daily.ts';

/** Retos seguidos para ganar un protector. */
export const FREEZE_EVERY = 7;
/** Protectores que se pueden guardar a la vez. */
export const MAX_FREEZES = 2;

export interface Streaks {
  /** Retos de la racha actual. Sigue viva si aún se puede jugar hoy sin romperla. */
  readonly current: number;
  readonly best: number;
  readonly playedToday: boolean;
  /** Protectores disponibles (ya descontados los días sin jugar hasta ayer). */
  readonly freezes: number;
  /** Días sin jugar que salvó un protector, en orden. */
  readonly frozenDays: readonly string[];
  /** Último día en que se ganó un protector (null si nunca). */
  readonly lastFreezeEarned: string | null;
}

/** Días entre dos fechas "YYYY-MM-DD" (b - a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** `days`: días ("YYYY-MM-DD") con el reto terminado, en cualquier orden y con repetidos. */
export function streaks(days: readonly string[], today: string): Streaks {
  const sorted = [...new Set(days)].filter((d) => d <= today).sort();
  let best = 0;
  let run = 0;
  let freezes = 0;
  const frozen: string[] = [];
  let lastFreezeEarned: string | null = null;
  let previous: string | null = null;

  /** Cubre con protectores los días sin jugar desde `previous`; false si no llegan. */
  const bridge = (missed: number): boolean => {
    if (missed > freezes) return false;
    freezes -= missed;
    for (let i = 1; i <= missed; i++) frozen.push(shiftDay(previous!, i));
    return true;
  };

  for (const day of sorted) {
    if (previous === null || !bridge(daysBetween(previous, day) - 1)) {
      run = 0;
      freezes = 0;
    }
    run++;
    if (run % FREEZE_EVERY === 0 && freezes < MAX_FREEZES) {
      freezes++;
      lastFreezeEarned = day;
    }
    best = Math.max(best, run);
    previous = day;
  }

  // Hoy aún se puede jugar: solo cuentan como perdidos los días hasta ayer.
  const alive = previous !== null && bridge(Math.max(0, daysBetween(previous, today) - 1));
  if (!alive) freezes = 0;
  return {
    current: alive ? run : 0,
    best,
    playedToday: previous === today,
    freezes,
    frozenDays: frozen,
    lastFreezeEarned,
  };
}
