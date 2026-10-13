// Logros: se calculan a partir de las partidas verificadas.

import { dayKey } from '../../src/logic/daily/daily';
import { computeAchievements, weekTitles, type LeagueRun } from '../../src/logic/achievements/achievements';
import type { Env } from '../http';
import { wonDays } from './stats';

export async function playerAchievements(env: Env, playerId: string) {
  const [{ results: runs }, wins, { results: leagueRuns }] = await Promise.all([
    env.DB.prepare('SELECT day, score, retries, hints FROM daily_runs WHERE player_id = ? AND finished_at IS NOT NULL')
      .bind(playerId)
      .all<{ day: string; score: number; retries: number; hints: number }>(),
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
  ]);
  const today = dayKey(new Date());
  return computeAchievements({ runs, wonDays: wins.size, weekTitles: weekTitles(leagueRuns, playerId, today), today });
}
