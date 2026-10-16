// Ranking global: todos los jugadores con nombre (salvo los que se ocultan),
// ordenados por la suma de sus puntos en el reto diario, este mes o desde siempre.

import { isHatId } from '../../../common/art/hats';
import { dayKey } from '../../../common/logic/daily/daily';
import { seasonOf, seasonRange } from '../../../common/logic/leagues/seasons';
import { type Env, HttpError } from '../http';

export type GlobalPeriod = 'month' | 'all';

/** Cuántos se muestran (y, si no estás entre ellos, tu puesto aparte). */
export const GLOBAL_RANKING_SIZE = 50;

interface GlobalRow {
  player_id: string;
  name: string;
  hat: string | null;
  points: number;
  days: number;
  best: number;
  pos: number;
  total: number;
}

const RANKED = `
  WITH totals AS (
    SELECT r.player_id, SUM(r.score) AS points, COUNT(*) AS days, MAX(r.score) AS best
    FROM daily_runs r
    JOIN players p ON p.id = r.player_id
    WHERE r.finished_at IS NOT NULL AND r.day BETWEEN ?2 AND ?3 AND p.name IS NOT NULL AND p.hide_global = 0
    GROUP BY r.player_id
  )
  SELECT t.*, p.name, p.hat, RANK() OVER (ORDER BY t.points DESC) AS pos, COUNT(*) OVER () AS total
  FROM totals t
  JOIN players p ON p.id = t.player_id`;

export async function globalRanking(env: Env, playerId: string, period: string) {
  if (period !== 'month' && period !== 'all') throw new HttpError(400, 'invalidPeriod');
  const today = dayKey(new Date());
  const { from, to } = period === 'month' ? seasonRange(seasonOf(today)) : { from: '0000-01-01', to: today };
  const [{ results }, me] = await Promise.all([
    env.DB.prepare(`SELECT * FROM (${RANKED}) WHERE pos <= ?4 OR player_id = ?1 ORDER BY pos, days, name`)
      .bind(playerId, from, to, GLOBAL_RANKING_SIZE)
      .all<GlobalRow>(),
    env.DB.prepare('SELECT name, hide_global FROM players WHERE id = ?').bind(playerId).first<{ name: string | null; hide_global: number }>(),
  ]);
  const entry = (r: GlobalRow) => ({
    id: r.player_id,
    name: r.name,
    hat: isHatId(r.hat) ? r.hat : null,
    position: r.pos,
    points: r.points,
    days: r.days,
    best: r.best,
    isMe: r.player_id === playerId,
  });
  const top = results.filter((r) => r.pos <= GLOBAL_RANKING_SIZE).map(entry);
  const mine = results.find((r) => r.player_id === playerId);
  return {
    period,
    from,
    total: results[0]?.total ?? 0,
    top,
    me: mine && mine.pos > GLOBAL_RANKING_SIZE ? entry(mine) : null,
    /** Te has ocultado del ranking: no sales aunque tengas puntos. */
    hidden: me?.hide_global === 1,
    /** Sin nombre tampoco se sale. */
    named: !!me?.name,
  };
}

/** Salir del ranking global o volver a él. */
export async function setGlobalVisible(env: Env, playerId: string, visible: unknown) {
  if (typeof visible !== 'boolean') throw new HttpError(400, 'invalidBody');
  await env.DB.prepare('UPDATE players SET hide_global = ? WHERE id = ?').bind(visible ? 0 : 1, playerId).run();
  return { visible };
}
