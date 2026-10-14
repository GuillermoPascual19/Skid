// Temporadas de las ligas: cada mes se cierra la primera vez que alguien de la
// liga lo consulta después de acabar, y el campeón se lleva el gorro de ese mes.

import { type HatId, isHatId } from '../../../common/art/hats';
import { dayKey } from '../../../common/logic/daily/daily';
import { finishedSeasons, seasonHat, seasonOf, seasonPodium, seasonRange, shiftSeason } from '../../../common/logic/leagues/seasons';
import type { Env } from '../http';
import { leagueTotals, requireMember } from './leagues';

/** Cierra las temporadas ya terminadas de las ligas del jugador que aún estén abiertas. */
export async function settleSeasons(env: Env, playerId: string): Promise<void> {
  const today = dayKey(new Date());
  const { results: leagues } = await env.DB.prepare(
    `SELECT l.id, l.name, substr(l.created_at, 1, 7) AS since,
            (SELECT group_concat(s.season) FROM league_seasons s WHERE s.league_id = l.id) AS settled
     FROM leagues l
     JOIN league_members m ON m.league_id = l.id AND m.player_id = ?`,
  )
    .bind(playerId)
    .all<{ id: string; name: string; since: string; settled: string | null }>();

  const statements: D1PreparedStatement[] = [];
  for (const league of leagues) {
    const settled = new Set(league.settled?.split(',') ?? []);
    for (const season of finishedSeasons(league.since, today)) {
      if (settled.has(season)) continue;
      const { from, to } = seasonRange(season);
      const podium = seasonPodium(await leagueTotals(env, league.id, from, to));
      // Si otra petición la cierra a la vez, calcula lo mismo: OR IGNORE basta.
      statements.push(
        env.DB.prepare('INSERT OR IGNORE INTO league_seasons (league_id, season, settled_at) VALUES (?, ?, ?)').bind(league.id, season, Date.now()),
        ...podium.map((p) =>
          env.DB.prepare(
            'INSERT OR IGNORE INTO season_results (league_id, league_name, season, player_id, position, points) VALUES (?, ?, ?, ?, ?, ?)',
          ).bind(league.id, league.name, season, p.playerId, p.position, p.points),
        ),
      );
    }
  }
  if (statements.length) await env.DB.batch(statements);
}

export interface SeasonTitle {
  leagueId: string;
  leagueName: string;
  season: string;
  points: number;
  hat: HatId;
}

/** Temporadas que ha ganado el jugador, de la más reciente a la más antigua. */
export async function seasonTitles(env: Env, playerId: string): Promise<SeasonTitle[]> {
  const { results } = await env.DB.prepare(
    `SELECT league_id AS leagueId, league_name AS leagueName, season, points
     FROM season_results WHERE player_id = ? AND position = 1
     ORDER BY season DESC, league_name`,
  )
    .bind(playerId)
    .all<Omit<SeasonTitle, 'hat'>>();
  return results.map((r) => ({ ...r, hat: seasonHat(r.season) }));
}

/** Gorros de temporada que puede llevar el jugador. */
export async function seasonHats(env: Env, playerId: string): Promise<Set<HatId>> {
  return new Set((await seasonTitles(env, playerId)).map((t) => t.hat));
}

/** La temporada en curso de una liga (premio y fin) y el podio de la anterior. */
export async function leagueSeason(env: Env, playerId: string, leagueId: string) {
  await requireMember(env, playerId, leagueId);
  await settleSeasons(env, playerId);
  const season = seasonOf(dayKey(new Date()));
  const previous = shiftSeason(season, -1);
  const [closed, { results: podium }] = await Promise.all([
    env.DB.prepare('SELECT 1 FROM league_seasons WHERE league_id = ? AND season = ?').bind(leagueId, previous).first(),
    env.DB.prepare(
      `SELECT r.player_id AS id, p.name, p.hat, r.position, r.points, r.player_id = ?1 AS is_me
       FROM season_results r
       JOIN players p ON p.id = r.player_id
       WHERE r.league_id = ?2 AND r.season = ?3
       ORDER BY r.position, p.name`,
    )
      .bind(playerId, leagueId, previous)
      .all<{ id: string; name: string | null; hat: string | null; position: number; points: number; is_me: number }>(),
  ]);
  return {
    season,
    ends: seasonRange(season).to,
    hat: seasonHat(season),
    // Null si la liga aún no existía o la temporada no contaba (antes de FIRST_SEASON).
    previous: closed
      ? {
          season: previous,
          hat: seasonHat(previous),
          podium: podium.map((r) => ({
            id: r.id,
            name: r.name,
            hat: isHatId(r.hat) ? r.hat : null,
            position: r.position,
            points: r.points,
            isMe: r.is_me === 1,
          })),
        }
      : null,
  };
}
