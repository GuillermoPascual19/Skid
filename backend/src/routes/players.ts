// Jugadores: nombre obligatorio para algunas acciones y perfil público con el cara a cara.

import { isHatId } from '../../../common/art/hats';
import { type Env, HttpError } from '../http';
import { playerAchievements } from './achievements';
import { seasonTitles } from './seasons';
import { playerStats } from './stats';

export async function requireName(env: Env, playerId: string): Promise<void> {
  const row = await env.DB.prepare('SELECT name FROM players WHERE id = ?').bind(playerId).first<{ name: string | null }>();
  if (!row?.name) throw new HttpError(400, 'nameRequired');
}

/**
 * Perfil público de un jugador: estadísticas, gorros conseguidos y el cara a
 * cara con quien lo mira. Solo se puede ver el propio o el de alguien que
 * comparta liga contigo.
 */
export async function playerProfile(env: Env, viewerId: string, targetId: string) {
  const isMe = viewerId === targetId;
  const { results: shared } = await env.DB.prepare(
    `SELECT l.name FROM leagues l
     JOIN league_members a ON a.league_id = l.id AND a.player_id = ?1
     JOIN league_members b ON b.league_id = l.id AND b.player_id = ?2
     ORDER BY a.joined_at`,
  )
    .bind(viewerId, targetId)
    .all<{ name: string }>();
  if (!isMe && shared.length === 0) throw new HttpError(403, 'onlyLeagueProfiles');

  const player = await env.DB.prepare('SELECT name, hat FROM players WHERE id = ?')
    .bind(targetId)
    .first<{ name: string | null; hat: string | null }>();
  if (!player) throw new HttpError(404, 'playerNotFound');

  const [stats, achievements, seasons, headToHead] = await Promise.all([
    playerStats(env, targetId),
    playerAchievements(env, targetId),
    seasonTitles(env, targetId),
    isMe ? Promise.resolve(null) : headToHeadRecord(env, viewerId, targetId),
  ]);

  return {
    name: player.name,
    hat: isHatId(player.hat) ? player.hat : null,
    isMe,
    sharedLeagues: shared.map((l) => l.name),
    stats,
    achievements: achievements.filter((a) => a.unlocked).map((a) => a.id),
    seasons: seasons.map(({ leagueName, season, hat }) => ({ leagueName, season, hat })),
    headToHead,
  };
}

/** Días que jugaron los dos: quién sacó más puntos (a igualdad, menos tiempo). */
async function headToHeadRecord(env: Env, viewerId: string, targetId: string) {
  const { results } = await env.DB.prepare(
    `SELECT a.score AS my_score, a.time_ms AS my_time, b.score AS their_score, b.time_ms AS their_time
     FROM daily_runs a
     JOIN daily_runs b ON b.day = a.day AND b.player_id = ?2 AND b.finished_at IS NOT NULL
     WHERE a.player_id = ?1 AND a.finished_at IS NOT NULL`,
  )
    .bind(viewerId, targetId)
    .all<{ my_score: number; my_time: number; their_score: number; their_time: number }>();
  let myWins = 0;
  let theirWins = 0;
  for (const r of results) {
    const diff = r.my_score - r.their_score || r.their_time - r.my_time;
    if (diff > 0) myWins++;
    else if (diff < 0) theirWins++;
  }
  return { played: results.length, myWins, theirWins, ties: results.length - myWins - theirWins };
}
