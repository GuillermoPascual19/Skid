// Rachas del reto diario: días seguidos con el reto terminado.

import { shiftDay } from './daily.ts';

export interface Streaks {
  /** Días seguidos hasta hoy. Sigue viva si el último fue ayer (aún se puede jugar hoy). */
  readonly current: number;
  readonly best: number;
  readonly playedToday: boolean;
}

/** `days`: días ("YYYY-MM-DD") con el reto terminado, en cualquier orden y con repetidos. */
export function streaks(days: readonly string[], today: string): Streaks {
  const sorted = [...new Set(days)].filter((d) => d <= today).sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous !== null && shiftDay(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  const last = sorted.at(-1);
  const alive = last === today || last === shiftDay(today, -1);
  return { current: alive ? run : 0, best, playedToday: last === today };
}
