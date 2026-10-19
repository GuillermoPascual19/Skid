// Reacciones al reto diario de los amigos: ponerlas, verlas en el ranking y
// avisar de las nuevas.

import { isHatId } from '../../../common/art/hats';
import { dayKey, shiftDay } from '../../../common/logic/daily/daily';
import { REACTIONS, REACTION_DAYS, type ReactionId, isReactionId } from '../../../common/logic/leagues/reactions';
import { type Env, HttpError } from '../http';
import { background, notify } from '../push';

export interface RowReactions {
  /** Cuántas de cada tipo, de los miembros de la liga que se está mirando. */
  counts: { id: ReactionId; n: number }[];
  /** La que le puso quien mira (null si ninguna). */
  mine: ReactionId | null;
}

/** Reacciones de un día en una liga, por jugador que las recibió. */
export async function leagueReactions(env: Env, viewerId: string, leagueId: string, day: string): Promise<Map<string, RowReactions>> {
  const { results } = await env.DB.prepare(
    `SELECT r.to_id, r.reaction, COUNT(*) AS n, MAX(r.from_id = ?1) AS mine
     FROM daily_reactions r
     JOIN league_members m ON m.player_id = r.from_id AND m.league_id = ?2
     WHERE r.day = ?3
     GROUP BY r.to_id, r.reaction
     ORDER BY n DESC`,
  )
    .bind(viewerId, leagueId, day)
    .all<{ to_id: string; reaction: string; n: number; mine: number }>();
  const byPlayer = new Map<string, RowReactions>();
  for (const r of results) {
    if (!isReactionId(r.reaction)) continue;
    const row = byPlayer.get(r.to_id) ?? { counts: [], mine: null };
    row.counts.push({ id: r.reaction, n: r.n });
    if (r.mine) row.mine = r.reaction;
    byPlayer.set(r.to_id, row);
  }
  return byPlayer;
}

/**
 * Pone (o cambia, o quita con null) la reacción al reto de `day` de un amigo:
 * alguien con quien compartes liga, que lo terminó, de los últimos días.
 */
export async function react(env: Env, fromId: string, toId: string, day: string, reaction: unknown) {
  if (reaction !== null && !isReactionId(reaction)) throw new HttpError(400, 'reactionInvalid');
  if (toId === fromId) throw new HttpError(400, 'reactionSelf');
  const today = dayKey(new Date());
  const allowed = await env.DB.prepare(
    `SELECT 1 FROM daily_runs r
     WHERE r.player_id = ?2 AND r.day = ?3 AND r.finished_at IS NOT NULL
       AND EXISTS (SELECT 1 FROM league_members a
                   JOIN league_members b ON b.league_id = a.league_id AND b.player_id = ?2
                   WHERE a.player_id = ?1)`,
  )
    .bind(fromId, toId, day)
    .first();
  if (!allowed || day > today || day <= shiftDay(today, -REACTION_DAYS)) {
    throw new HttpError(403, 'reactionNotAllowed', { days: REACTION_DAYS });
  }
  if (reaction === null) {
    await env.DB.prepare('DELETE FROM daily_reactions WHERE day = ? AND from_id = ? AND to_id = ?').bind(day, fromId, toId).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO daily_reactions (day, from_id, to_id, reaction, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (day, from_id, to_id) DO UPDATE SET reaction = excluded.reaction, created_at = excluded.created_at`,
    )
      .bind(day, fromId, toId, reaction, Date.now())
      .run();
    background(
      env,
      env.DB.prepare('SELECT name FROM players WHERE id = ?')
        .bind(fromId)
        .first<{ name: string | null }>()
        .then((row) =>
          notify(
            env,
            toId,
            'reaction',
            { name: row?.name ?? '?', emoji: REACTIONS[reaction] },
            { url: '/', throttle: { tag: `reaction:${fromId}:${day}`, ms: 86_400_000 } },
          ),
        ),
    );
  }
  return { reaction };
}

/** Reacciones que ha recibido el jugador después de `since` (ms), las más nuevas primero. */
export async function newReactions(env: Env, playerId: string, since: number) {
  const { results } = await env.DB.prepare(
    `SELECT p.name, p.hat, r.reaction, r.day, r.created_at AS at
     FROM daily_reactions r
     JOIN players p ON p.id = r.from_id
     WHERE r.to_id = ? AND r.created_at > ?
     ORDER BY r.created_at DESC
     LIMIT 20`,
  )
    .bind(playerId, since)
    .all<{ name: string | null; hat: string | null; reaction: string; day: string; at: number }>();
  return results
    .filter((r) => isReactionId(r.reaction))
    .map((r) => ({ name: r.name, hat: isHatId(r.hat) ? r.hat : null, reaction: r.reaction as ReactionId, day: r.day, at: r.at }));
}
