// Ligas entre amigos: crear, ver una invitación, unirse, salir, ranking del día, ganadores y clasificación por periodo.

import { isHatId } from '../../../common/art/hats';
import type { SeasonTotal } from '../../../common/logic/leagues/seasons';
import { type Env, HttpError, cleanText } from '../http';
import { requireName } from './players';
import { leagueReactions } from './reactions';

/** Ligas que puede crear cada jugador. */
const MAX_LEAGUES_PER_PLAYER = 10;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin 0/O ni 1/I.

interface LeagueRow {
  id: string;
  name: string;
  code: string;
  members?: number;
}

export async function myLeagues(env: Env, playerId: string): Promise<LeagueRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT l.id, l.name, l.code,
            (SELECT COUNT(*) FROM league_members m2 WHERE m2.league_id = l.id) AS members
     FROM leagues l
     JOIN league_members m ON m.league_id = l.id AND m.player_id = ?
     ORDER BY m.joined_at`,
  )
    .bind(playerId)
    .all<LeagueRow>();
  return results;
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export async function createLeague(env: Env, playerId: string, name: unknown): Promise<LeagueRow> {
  await requireName(env, playerId);
  const created = await env.DB.prepare('SELECT COUNT(*) AS n FROM leagues WHERE created_by = ?').bind(playerId).first<{ n: number }>();
  if ((created?.n ?? 0) >= MAX_LEAGUES_PER_PLAYER) {
    throw new HttpError(429, 'maxLeagues', { n: MAX_LEAGUES_PER_PLAYER });
  }
  const clean = cleanText(name, 2, 30, 'leagueNameLength');
  const id = crypto.randomUUID();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO leagues (id, name, code, created_by) VALUES (?, ?, ?, ?)').bind(id, clean, code, playerId),
        env.DB.prepare('INSERT INTO league_members (league_id, player_id) VALUES (?, ?)').bind(id, playerId),
      ]);
      return { id, name: clean, code, members: 1 };
    } catch (err) {
      if (!String(err).includes('UNIQUE')) throw err; // Código repetido: se prueba otro.
    }
  }
  throw new HttpError(500, 'leagueCreateFailed');
}

export async function joinLeague(env: Env, playerId: string, code: unknown): Promise<LeagueRow> {
  await requireName(env, playerId);
  const clean = typeof code === 'string' ? code.trim().toUpperCase() : '';
  const league = await env.DB.prepare('SELECT id, name, code FROM leagues WHERE code = ?').bind(clean).first<LeagueRow>();
  if (!league) throw new HttpError(404, 'leagueNotFound');
  await env.DB.prepare('INSERT OR IGNORE INTO league_members (league_id, player_id) VALUES (?, ?)').bind(league.id, playerId).run();
  return league;
}

/**
 * Lo que se ve de una liga antes de unirse con su código (desde un enlace de
 * invitación): su nombre y cuántos son. Así nadie te mete en una liga sin que lo veas.
 */
export async function leagueInvite(env: Env, playerId: string, code: string) {
  const league = await env.DB.prepare(
    `SELECT l.name, (SELECT COUNT(*) FROM league_members m WHERE m.league_id = l.id) AS members,
            EXISTS (SELECT 1 FROM league_members m WHERE m.league_id = l.id AND m.player_id = ?2) AS member
     FROM leagues l WHERE l.code = ?1`,
  )
    .bind(code.trim().toUpperCase(), playerId)
    .first<{ name: string; members: number; member: number }>();
  if (!league) throw new HttpError(404, 'leagueNotFound');
  return { name: league.name, members: league.members, alreadyMember: league.member === 1 };
}

/** Sales de una liga: dejas de ver a los demás y ellos a ti. Si se queda vacía, se borra. */
export async function leaveLeague(env: Env, playerId: string, leagueId: string) {
  const result = await env.DB.prepare('DELETE FROM league_members WHERE league_id = ? AND player_id = ?').bind(leagueId, playerId).run();
  if (!result.meta.changes) throw new HttpError(404, 'notLeagueMember');
  await env.DB.prepare('DELETE FROM leagues WHERE id = ? AND NOT EXISTS (SELECT 1 FROM league_members WHERE league_id = ?)').bind(leagueId, leagueId).run();
  return { ok: true };
}

interface RankingDbRow {
  id: string;
  name: string;
  hat: string | null;
  is_me: number;
  started_at: number | null;
  finished_at: number | null;
  score: number | null;
  moves: number | null;
  retries: number | null;
  hints: number;
  time_ms: number | null;
  over_par: number | null;
}

/** Ranking de una liga para un día. La puntuación de quien aún juega no se muestra. */
export async function leagueRanking(env: Env, playerId: string, leagueId: string, day: string) {
  await requireMember(env, playerId, leagueId);

  const reactions = await leagueReactions(env, playerId, leagueId, day);
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.hat, p.id = ?1 AS is_me, r.started_at, r.finished_at, r.score, r.moves, r.retries, r.hints, r.time_ms, r.over_par
     FROM league_members m
     JOIN players p ON p.id = m.player_id
     LEFT JOIN daily_runs r ON r.player_id = m.player_id AND r.day = ?2
     WHERE m.league_id = ?3
     ORDER BY r.finished_at IS NULL, COALESCE(r.over_par, -r.score), r.time_ms ASC, p.name`,
  )
    .bind(playerId, day, leagueId)
    .all<RankingDbRow>();

  return results.map((r) => {
    const finished = r.finished_at !== null;
    return {
      id: r.id,
      name: r.name,
      hat: isHatId(r.hat) ? r.hat : null,
      isMe: r.is_me === 1,
      status: finished ? 'finished' : r.started_at !== null ? 'playing' : 'pending',
      score: finished ? r.score : null,
      moves: finished ? r.moves : null,
      retries: finished ? r.retries : null,
      hints: finished ? r.hints : null,
      timeMs: finished ? r.time_ms : null,
      overPar: finished ? r.over_par : null,
      reactions: reactions.get(r.id)?.counts ?? [],
      myReaction: reactions.get(r.id)?.mine ?? null,
    };
  });
}

interface WinRow {
  league_id: string;
  league_name: string;
  finishers: number;
  /** Cuántos de la liga lo hicieron mejor ese día. */
  better: number;
  score: number;
}

/**
 * Ligas en las que el jugador quedó 1.º en el reto de `day` (mejor puntuación;
 * a igualdad, menos tiempo; un empate exacto en cabeza cuenta para todos).
 * Solo cuenta si terminaron al menos 2 personas.
 */
export async function dailyWins(env: Env, playerId: string, day: string) {
  const { results } = await env.DB.prepare(
    `SELECT l.id AS league_id, l.name AS league_name, me.score,
            (SELECT COUNT(*) FROM league_members m2
               JOIN daily_runs r2 ON r2.player_id = m2.player_id AND r2.day = ?2 AND r2.finished_at IS NOT NULL
             WHERE m2.league_id = l.id) AS finishers,
            (SELECT COUNT(*) FROM league_members m3
               JOIN daily_runs r3 ON r3.player_id = m3.player_id AND r3.day = ?2 AND r3.finished_at IS NOT NULL
             WHERE m3.league_id = l.id
               AND (COALESCE(r3.over_par, -r3.score) < COALESCE(me.over_par, -me.score)
                    OR (COALESCE(r3.over_par, -r3.score) = COALESCE(me.over_par, -me.score) AND r3.time_ms < me.time_ms))) AS better
     FROM leagues l
     JOIN league_members m ON m.league_id = l.id AND m.player_id = ?1
     JOIN daily_runs me ON me.player_id = ?1 AND me.day = ?2 AND me.finished_at IS NOT NULL
     ORDER BY m.joined_at`,
  )
    .bind(playerId, day)
    .all<WinRow>();

  return results
    .filter((r) => r.better === 0 && r.finishers >= 2)
    .map((r) => ({ leagueId: r.league_id, leagueName: r.league_name, players: r.finishers, score: r.score }));
}

export async function requireMember(env: Env, playerId: string, leagueId: string): Promise<void> {
  const member = await env.DB.prepare('SELECT 1 FROM league_members WHERE league_id = ? AND player_id = ?')
    .bind(leagueId, playerId)
    .first();
  if (!member) throw new HttpError(403, 'notLeagueMember');
}

interface StandingRow {
  id: string;
  name: string;
  hat: string | null;
  is_me: number;
  points: number;
  days: number;
  wins: number;
  best: number | null;
}

/**
 * Clasificación de una liga en un periodo (semana, mes): suma de las
 * puntuaciones de los retos terminados. Un día cuenta como ganado si fuiste
 * el 1.º y terminaron al menos 2 (la misma regla que la celebración).
 */
export async function leagueStandings(env: Env, playerId: string, leagueId: string, from: string, to: string) {
  await requireMember(env, playerId, leagueId);
  const results = await standingRows(env, playerId, leagueId, from, to);
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    hat: isHatId(r.hat) ? r.hat : null,
    isMe: r.is_me === 1,
    points: r.points,
    days: r.days,
    wins: r.wins,
    best: r.best,
  }));
}

/** Totales de cada miembro en un periodo, para cerrar una temporada (sin comprobar quién mira). */
export async function leagueTotals(env: Env, leagueId: string, from: string, to: string): Promise<SeasonTotal[]> {
  const results = await standingRows(env, '', leagueId, from, to);
  return results.map((r) => ({ playerId: r.id, points: r.points, wins: r.wins, days: r.days }));
}

async function standingRows(env: Env, playerId: string, leagueId: string, from: string, to: string): Promise<StandingRow[]> {
  const { results } = await env.DB.prepare(
    `WITH runs AS (
       SELECT r.player_id, r.day, r.score, r.time_ms, COALESCE(r.over_par, -r.score) AS rank_key
       FROM daily_runs r
       JOIN league_members lm ON lm.player_id = r.player_id AND lm.league_id = ?4
       WHERE r.day BETWEEN ?2 AND ?3 AND r.finished_at IS NOT NULL
     ),
     ranked AS (
       SELECT *,
              RANK() OVER (PARTITION BY day ORDER BY rank_key, time_ms ASC) AS pos,
              COUNT(*) OVER (PARTITION BY day) AS finishers
       FROM runs
     )
     SELECT p.id, p.name, p.hat, p.id = ?1 AS is_me,
            COALESCE(SUM(k.score), 0) AS points,
            COUNT(k.day) AS days,
            COALESCE(SUM(k.pos = 1 AND k.finishers >= 2), 0) AS wins,
            MAX(k.score) AS best
     FROM league_members m
     JOIN players p ON p.id = m.player_id
     LEFT JOIN ranked k ON k.player_id = m.player_id
     WHERE m.league_id = ?4
     GROUP BY p.id
     ORDER BY points DESC, wins DESC, days DESC, p.name`,
  )
    .bind(playerId, from, to, leagueId)
    .all<StandingRow>();
  return results;
}
