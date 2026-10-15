// Logros del reto diario y de los demás modos con partidas en el servidor
// (duelos, contrarreloj, reto semanal y niveles de la comunidad; el modo libre
// solo se guarda en el navegador). Cada uno desbloquea un gorro para el
// pingüino. Se calculan en el servidor a partir de las partidas verificadas, así
// que no se pueden falsear y valen en todos los dispositivos.

import type { HatId } from '../../art/hats.ts';
import { weekRange } from '../daily/daily.ts';
import { streaks } from '../daily/streaks.ts';
import { duelVerdict, type DuelResult } from '../duels/duels.ts';

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
  | 'weekChampion'
  | 'duelWin'
  | 'duelWin10'
  | 'timeAttack10'
  | 'timeAttackPerfect5'
  | 'weeklyPar'
  | 'explorer10'
  | 'creator5'
  | 'creatorStar';

/** Modo al que pertenece un logro: en la pantalla de logros salen agrupados por modo. */
export type AchievementMode = 'daily' | 'duels' | 'timeAttack' | 'weekly' | 'community';

/** El nombre y la descripción de cada logro están en los diccionarios del juego (achievements.<id>). */
export interface AchievementDef {
  readonly id: AchievementId;
  readonly mode: AchievementMode;
  readonly hat: HatId;
  readonly target: number;
}

/** En el orden en que se muestran: por modo y, dentro de cada uno, de más fácil a más difícil. */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first', mode: 'daily', hat: 'beanie', target: 1 },
  { id: 'streak3', mode: 'daily', hat: 'earmuffs', target: 3 },
  { id: 'firstWin', mode: 'daily', hat: 'party', target: 1 },
  { id: 'clean5', mode: 'daily', hat: 'viking', target: 5 },
  { id: 'streak7', mode: 'daily', hat: 'cap', target: 7 },
  { id: 'perfect', mode: 'daily', hat: 'tophat', target: 1 },
  { id: 'streak14', mode: 'daily', hat: 'ushanka', target: 14 },
  { id: 'veteran', mode: 'daily', hat: 'santa', target: 30 },
  { id: 'streak30', mode: 'daily', hat: 'wizard', target: 30 },
  { id: 'weekChampion', mode: 'daily', hat: 'crown', target: 1 },
  { id: 'duelWin', mode: 'duels', hat: 'headband', target: 1 },
  { id: 'duelWin10', mode: 'duels', hat: 'knight', target: 10 },
  { id: 'timeAttack10', mode: 'timeAttack', hat: 'propeller', target: 10 },
  { id: 'timeAttackPerfect5', mode: 'timeAttack', hat: 'racing', target: 5 },
  { id: 'weeklyPar', mode: 'weekly', hat: 'beret', target: 1 },
  { id: 'explorer10', mode: 'community', hat: 'explorer', target: 10 },
  { id: 'creator5', mode: 'community', hat: 'hardhat', target: 5 },
  { id: 'creatorStar', mode: 'community', hat: 'laurel', target: 1 },
];

/** Los modos en el orden de ACHIEVEMENTS. */
export const ACHIEVEMENT_MODES: readonly AchievementMode[] = [...new Set(ACHIEVEMENTS.map((a) => a.mode))];

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
  /** Los demás modos. */
  readonly modes: ModeStats;
  readonly today: string;
}

/** Lo que cuenta para los logros de los demás modos (ver backend/src/routes/achievements.ts). */
export interface ModeStats {
  /** Duelos ganados jugando los dos (ver duelWins). */
  readonly duelWins: number;
  /** Más tableros resueltos en una sola contrarreloj. */
  readonly timeAttackBoards: number;
  /** Más tableros en el óptimo en una sola contrarreloj. */
  readonly timeAttackPerfect: number;
  /** Retos semanales resueltos en el óptimo. */
  readonly weeklyPars: number;
  /** Niveles de otros jugadores completados. */
  readonly communityLevels: number;
  /** Jugadores (sin contar al autor) que completaron su nivel más jugado. */
  readonly bestLevelPlayers: number;
  /** Niveles suyos con al menos 3 valoraciones de otros y media de 4 ★ o más. */
  readonly starLevels: number;
}

export const NO_MODE_STATS: ModeStats = {
  duelWins: 0,
  timeAttackBoards: 0,
  timeAttackPerfect: 0,
  weeklyPars: 0,
  communityLevels: 0,
  bestLevelPlayers: 0,
  starLevels: 0,
};

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
    duelWin: input.modes.duelWins,
    duelWin10: input.modes.duelWins,
    timeAttack10: input.modes.timeAttackBoards,
    timeAttackPerfect5: input.modes.timeAttackPerfect,
    weeklyPar: input.modes.weeklyPars,
    explorer10: input.modes.communityLevels,
    creator5: input.modes.bestLevelPlayers,
    creatorStar: input.modes.starLevels,
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

/** Un duelo terminado visto por un jugador: su resultado y el del rival (null si no lo terminó). */
export interface FinishedDuel {
  readonly mine: DuelResult | null;
  readonly theirs: DuelResult | null;
}

/**
 * Duelos ganados con el mismo criterio que el resultado del duelo, pero solo
 * jugando los dos: ganar porque el rival no se presentó no cuenta.
 */
export function duelWins(duels: readonly FinishedDuel[]): number {
  return duels.filter((d) => {
    const { winner, by } = duelVerdict(d.mine, d.theirs);
    return winner === 'a' && by !== 'noShow';
  }).length;
}
