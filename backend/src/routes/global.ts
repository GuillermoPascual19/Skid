// Ranking global: todos los jugadores con nombre (salvo los que se ocultan),
// ordenados por la suma de sus puntos en el reto diario, este mes o desde siempre.
// Cada mes cerrado tiene su podio: oro, plata y bronce se llevan su laurel.

import { type HatId, isHatId } from '../../../common/art/hats';
import { dayKey } from '../../../common/logic/daily/daily';
import {
  FIRST_GLOBAL_SEASON,
  GLOBAL_HATS,
  finishedSeasons,
  globalHat,
  seasonOf,
  seasonPodium,
  seasonRange,
  shiftSeason,
} from '../../../common/logic/leagues/seasons';
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
  await settleGlobalSeasons(env);
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
  const season = seasonOf(today);
  return {
    period,
    from,
    /** Último día del mes en curso (cuándo se reparte su podio). */
    ends: seasonRange(season).to,
    prizes: GLOBAL_HATS,
    previous: period === 'month' ? await previousPodium(env, playerId, shiftSeason(season, -1)) : null,
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

/** Cierra los meses ya terminados que aún no tienen podio. Si dos peticiones lo hacen a la vez, calculan lo mismo. */
export async function settleGlobalSeasons(env: Env): Promise<void> {
  const today = dayKey(new Date());
  const { results } = await env.DB.prepare('SELECT season FROM global_seasons').all<{ season: string }>();
  const settled = new Set(results.map((r) => r.season));
  const statements: D1PreparedStatement[] = [];
  for (const season of finishedSeasons(FIRST_GLOBAL_SEASON, today)) {
    if (settled.has(season)) continue;
    const { from, to } = seasonRange(season);
    const { results: totals } = await env.DB.prepare(
      `SELECT r.player_id AS playerId, SUM(r.score) AS points, COUNT(*) AS days
       FROM daily_runs r
       JOIN players p ON p.id = r.player_id
       WHERE r.finished_at IS NOT NULL AND r.day BETWEEN ?1 AND ?2 AND p.name IS NOT NULL AND p.hide_global = 0
       GROUP BY r.player_id`,
    )
      .bind(from, to)
      .all<{ playerId: string; points: number; days: number }>();
    const podium = seasonPodium(totals.map((t) => ({ ...t, wins: 0 })));
    statements.push(
      env.DB.prepare('INSERT OR IGNORE INTO global_seasons (season, settled_at) VALUES (?, ?)').bind(season, Date.now()),
      ...podium.map((p) =>
        env.DB.prepare('INSERT OR IGNORE INTO global_results (season, player_id, position, points) VALUES (?, ?, ?, ?)').bind(season, p.playerId, p.position, p.points),
      ),
    );
  }
  if (statements.length) await env.DB.batch(statements);
}

/** El podio de un mes ya cerrado (null si aún no se ha cerrado o no contaba). */
async function previousPodium(env: Env, playerId: string, season: string) {
  const [closed, { results }] = await Promise.all([
    env.DB.prepare('SELECT 1 FROM global_seasons WHERE season = ?').bind(season).first(),
    env.DB.prepare(
      `SELECT g.player_id AS id, p.name, g.position, g.points
       FROM global_results g
       JOIN players p ON p.id = g.player_id
       WHERE g.season = ?1
       ORDER BY g.position, p.name`,
    )
      .bind(season)
      .all<{ id: string; name: string | null; position: number; points: number }>(),
  ]);
  if (!closed) return null;
  return {
    season,
    podium: results.map((r) => ({ id: r.id, name: r.name, position: r.position, points: r.points, hat: globalHat(r.position), isMe: r.id === playerId })),
  };
}

export interface GlobalTitle {
  season: string;
  position: number;
  points: number;
  hat: HatId;
}

/** Los podios del ranking global en los que ha estado el jugador, del más reciente al más antiguo. */
export async function globalTitles(env: Env, playerId: string): Promise<GlobalTitle[]> {
  const { results } = await env.DB.prepare('SELECT season, position, points FROM global_results WHERE player_id = ? ORDER BY season DESC')
    .bind(playerId)
    .all<Omit<GlobalTitle, 'hat'>>();
  return results.map((r) => ({ ...r, hat: globalHat(r.position) }));
}
