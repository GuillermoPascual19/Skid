// Logros del reto diario. Cada uno desbloquea un gorro para el pingüino. Se
// calculan en el servidor a partir de las partidas verificadas, así que no se
// pueden falsear y valen en todos los dispositivos.

import type { HatId } from '../../art/hats.ts';
import { weekRange } from '../daily/daily.ts';
import { streaks } from '../daily/streaks.ts';

export type AchievementId =
  | 'first'
  | 'streak3'
  | 'streak7'
  | 'streak14'
  | 'streak30'
  | 'perfect'
  | 'clean5'
  | 'firstWin'
  | 'veteran'
  | 'weekChampion';

/** El nombre y la descripción de cada logro están en los diccionarios del juego (achievements.<id>). */
export interface AchievementDef {
  readonly id: AchievementId;
  readonly hat: HatId;
  readonly target: number;
}

/** En el orden en que se muestran (de más fácil a más difícil). */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first', hat: 'beanie', target: 1 },
  { id: 'streak3', hat: 'earmuffs', target: 3 },
  { id: 'firstWin', hat: 'party', target: 1 },
  { id: 'clean5', hat: 'viking', target: 5 },
  { id: 'streak7', hat: 'cap', target: 7 },
  { id: 'perfect', hat: 'tophat', target: 1 },
  { id: 'streak14', hat: 'ushanka', target: 14 },
  { id: 'veteran', hat: 'santa', target: 30 },
  { id: 'streak30', hat: 'wizard', target: 30 },
  { id: 'weekChampion', hat: 'crown', target: 1 },
];

export interface FinishedRun {
  readonly day: string;
  readonly score: number;
  readonly retries: number;
  readonly hints: number;
  /**
   * Golpes por encima del óptimo; null en los retos de antes del golf, cuando
   * reintentar restaba puntos (entonces "sin ayuda" era también sin reintentos).
   */
  readonly overPar: number | null;
}

export interface AchievementInput {
  /** Retos terminados por el jugador. */
  readonly runs: readonly FinishedRun[];
  /** Días que quedó 1.º en alguna liga (con al menos 2 que terminaron). */
  readonly wonDays: number;
  /** Semanas completas que ganó en alguna liga. */
  readonly weekTitles: number;
  readonly today: string;
}

export interface AchievementProgress {
  readonly id: AchievementId;
  readonly current: number;
  readonly target: number;
  readonly unlocked: boolean;
}

export function computeAchievements(input: AchievementInput): AchievementProgress[] {
  const { best } = streaks(
    input.runs.map((r) => r.day),
    input.today,
  );
  const value: Record<AchievementId, number> = {
    first: input.runs.length,
    streak3: best,
    streak7: best,
    streak14: best,
    streak30: best,
    perfect: input.runs.filter((r) => r.score >= 1000).length,
    clean5: input.runs.filter((r) => r.hints === 0 && (r.overPar !== null || r.retries === 0)).length,
    firstWin: input.wonDays,
    veteran: input.runs.length,
    weekChampion: input.weekTitles,
  };
  return ACHIEVEMENTS.map(({ id, target }) => ({
    id,
    target,
    current: Math.min(value[id], target),
    unlocked: value[id] >= target,
  }));
}

/** Gorros que puede llevar el jugador: los de los logros desbloqueados. */
export function unlockedHats(progress: readonly AchievementProgress[]): Set<HatId> {
  const unlocked = new Set(progress.filter((p) => p.unlocked).map((p) => p.id));
  return new Set(ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).map((a) => a.hat));
}

export interface LeagueRun {
  readonly leagueId: string;
  readonly playerId: string;
  readonly day: string;
  readonly score: number;
}

/**
 * Semanas completas (de lunes a domingo, ya terminadas) en las que `playerId`
 * sumó más puntos que nadie en alguna de sus ligas, con al menos 2 jugadores
 * con retos esa semana. Un empate en cabeza cuenta para todos los empatados.
 */
export function weekTitles(runs: readonly LeagueRun[], playerId: string, today: string): number {
  const currentWeek = weekRange(today).from;
  const totals = new Map<string, Map<string, number>>(); // "liga|semana" -> jugador -> puntos
  for (const run of runs) {
    const week = weekRange(run.day).from;
    if (week >= currentWeek) continue; // La semana en curso aún no ha terminado.
    const key = `${run.leagueId}|${week}`;
    const byPlayer = totals.get(key) ?? new Map<string, number>();
    byPlayer.set(run.playerId, (byPlayer.get(run.playerId) ?? 0) + run.score);
    totals.set(key, byPlayer);
  }
  let titles = 0;
  for (const byPlayer of totals.values()) {
    const mine = byPlayer.get(playerId);
    if (mine === undefined || byPlayer.size < 2) continue;
    if (mine >= Math.max(...byPlayer.values())) titles++;
  }
  return titles;
}
