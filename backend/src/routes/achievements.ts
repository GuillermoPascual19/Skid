// Logros: se calculan a partir de las partidas verificadas.

import { dayKey } from '../../../common/logic/daily/daily';
import { computeAchievements, duelWins, weekTitles, type LeagueRun, type ModeStats } from '../../../common/logic/achievements/achievements';
import type { Env } from '../http';
import { wonDays } from './stats';

/** Valoraciones de otros jugadores que necesita un nivel para el logro de las estrellas, y la media mínima. */
const STAR_MIN_RATINGS = 3;
const STAR_MIN_AVERAGE = 4;

export async function playerAchievements(env: Env, playerId: string) {
  const [{ results: runs }, wins, { results: leagueRuns }, modes] = await Promise.all([
    env.DB.prepare('SELECT day, score, retries, hints, over_par AS overPar FROM daily_runs WHERE player_id = ? AND finished_at IS NOT NULL').bind(playerId).all<{
      day: string;
      score: number;
      retries: number;
      hints: number;
      overPar: number | null;
    }>(),
    wonDays(env, playerId),
    env.DB.prepare(
      `SELECT lm.league_id AS leagueId, r.player_id AS playerId, r.day, r.score
       FROM daily_runs r
       JOIN league_members lm ON lm.player_id = r.player_id
       WHERE r.finished_at IS NOT NULL
         AND lm.league_id IN (SELECT league_id FROM league_members WHERE player_id = ?)`,
    )
      .bind(playerId)
      .all<LeagueRun>(),
    modeStats(env, playerId),
  ]);
  const today = dayKey(new Date());
  return computeAchievements({
    runs,
    wonDays: wins.size,
    weekTitles: weekTitles(leagueRuns, playerId, today),
    modes,
    today,
  });
}

/** Lo que cuenta para los logros de duelos, contrarreloj, reto semanal y comunidad. */
async function modeStats(env: Env, playerId: string): Promise<ModeStats> {
  const [duels, timeAttack, weekly, community, levels] = await env.DB.batch([
    // Duelos terminados (entregaron los dos o se acabó el plazo) con rival y sin rechazar.
    env.DB.prepare(
      `SELECT me.best_moves AS myMoves, me.best_time_ms AS myTime, them.best_moves AS theirMoves, them.best_time_ms AS theirTime
       FROM duels d
       JOIN duel_runs me ON me.duel_id = d.id AND me.player_id = ?1
       LEFT JOIN duel_runs them ON them.duel_id = d.id AND them.player_id <> ?1
       WHERE d.opponent_id IS NOT NULL AND d.declined_at IS NULL
         AND (d.expires_at <= ?2 OR (me.done_at IS NOT NULL AND them.done_at IS NOT NULL))`,
    ).bind(playerId, Date.now()),
    env.DB.prepare('SELECT COALESCE(MAX(boards), 0) AS boards, COALESCE(MAX(perfect), 0) AS perfect FROM time_attack_runs WHERE player_id = ?').bind(playerId),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM weekly_runs r JOIN weekly_boards b ON b.week = r.week
       WHERE r.player_id = ? AND r.best_moves IS NOT NULL AND r.best_moves <= b.optimal`,
    ).bind(playerId),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM custom_level_runs r JOIN custom_levels l ON l.id = r.level_id
       WHERE r.player_id = ?1 AND l.author_id <> ?1`,
    ).bind(playerId),
    // Sus niveles: cuántos otros jugadores los completaron y cómo los valoraron.
    env.DB.prepare(
      `SELECT COUNT(r.player_id) AS players, COUNT(r.rating) AS ratings, AVG(r.rating) AS average
       FROM custom_levels l
       LEFT JOIN custom_level_runs r ON r.level_id = l.id AND r.player_id <> l.author_id
       WHERE l.author_id = ?
       GROUP BY l.id`,
    ).bind(playerId),
  ]);
  type DuelRow = {
    myMoves: number | null;
    myTime: number | null;
    theirMoves: number | null;
    theirTime: number | null;
  };
  const result = (moves: number | null, time: number | null) => (moves === null ? null : { moves, timeMs: time ?? 0 });
  const ta = (timeAttack.results[0] ?? { boards: 0, perfect: 0 }) as {
    boards: number;
    perfect: number;
  };
  const levelRows = levels.results as {
    players: number;
    ratings: number;
    average: number | null;
  }[];
  return {
    duelWins: duelWins(
      (duels.results as DuelRow[]).map((d) => ({
        mine: result(d.myMoves, d.myTime),
        theirs: result(d.theirMoves, d.theirTime),
      })),
    ),
    timeAttackBoards: ta.boards,
    timeAttackPerfect: ta.perfect,
    weeklyPars: (weekly.results[0] as { n: number } | undefined)?.n ?? 0,
    communityLevels: (community.results[0] as { n: number } | undefined)?.n ?? 0,
    bestLevelPlayers: Math.max(0, ...levelRows.map((l) => l.players)),
    starLevels: levelRows.filter((l) => l.ratings >= STAR_MIN_RATINGS && (l.average ?? 0) >= STAR_MIN_AVERAGE).length,
  };
}
