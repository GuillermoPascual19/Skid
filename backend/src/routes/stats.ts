// Estadísticas personales del reto diario: rachas, totales y los últimos 30 días.

import { dayKey, shiftDay } from '../../../common/logic/daily/daily';
import { streaks } from '../../../common/logic/daily/streaks';
import type { Env } from '../http';

const HISTORY_DAYS = 30;

/**
 * Días en los que el jugador quedó 1.º en alguna de sus ligas (con al menos 2
 * que terminaron). Un empate exacto en cabeza cuenta para todos los empatados.
 */
export async function wonDays(env: Env, playerId: string): Promise<Set<string>> {
  const { results } = await env.DB.prepare(
    `WITH runs AS (
       SELECT lm.league_id, r.player_id, r.day, r.score, r.time_ms, COALESCE(r.over_par, -r.score) AS rank_key
       FROM daily_runs r
       JOIN league_members lm ON lm.player_id = r.player_id
       WHERE r.finished_at IS NOT NULL
         AND lm.league_id IN (SELECT league_id FROM league_members WHERE player_id = ?1)
     ),
     ranked AS (
       SELECT *,
              RANK() OVER (PARTITION BY league_id, day ORDER BY rank_key, time_ms ASC) AS pos,
              COUNT(*) OVER (PARTITION BY league_id, day) AS finishers
       FROM runs
     )
     SELECT DISTINCT day FROM ranked WHERE player_id = ?1 AND pos = 1 AND finishers >= 2`,
  )
    .bind(playerId)
    .all<{ day: string }>();
  return new Set(results.map((r) => r.day));
}

/** Estadísticas personales del reto diario: rachas, totales y los últimos 30 días. */
export async function playerStats(env: Env, playerId: string) {
  const { results: runs } = await env.DB.prepare('SELECT day, over_par FROM daily_runs WHERE player_id = ? AND finished_at IS NOT NULL ORDER BY day')
    .bind(playerId)
    .all<{ day: string; over_par: number | null }>();
  const wins = await wonDays(env, playerId);
  const today = dayKey(new Date());
  const streak = streaks(
    runs.map((r) => r.day),
    today,
  );

  // Movimientos de más de cada reto. Los de antes de contar por movimientos no
  // tienen (null): cuentan como jugados, pero no para la media ni los perfectos.
  const byDay = new Map(runs.map((r) => [r.day, r.over_par]));
  const history = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const day = shiftDay(today, i - (HISTORY_DAYS - 1));
    return { day, played: byDay.has(day), over: byDay.get(day) ?? null, won: wins.has(day) };
  });
  const overs = runs.map((r) => r.over_par).filter((o): o is number => o !== null);

  return {
    played: runs.length,
    currentStreak: streak.current,
    bestStreak: streak.best,
    playedToday: streak.playedToday,
    freezes: streak.freezes,
    calendar: { played: runs.map((r) => r.day), won: [...wins].sort(), frozen: streak.frozenDays },
    /** Retos contados por movimientos (los que tienen over_par). */
    counted: overs.length,
    perfect: overs.filter((o) => o === 0).length,
    /** Media de movimientos por encima del óptimo, con un decimal. */
    averageOver: overs.length ? Math.round((overs.reduce((a, b) => a + b, 0) / overs.length) * 10) / 10 : null,
    wins: wins.size,
    history,
  };
}
