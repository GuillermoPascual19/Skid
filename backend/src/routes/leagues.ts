// Ligas entre amigos: crear, unirse, ranking del día, ganadores y clasificación por periodo.

import { isHatId } from '../../../common/art/hats';
import { type Env, HttpError, cleanText } from '../http';
import { requireName } from './players';

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
    throw new HttpError(429, `Ya has creado ${MAX_LEAGUES_PER_PLAYER} ligas, que es el máximo`);
  }
  const clean = cleanText(name, 2, 30, 'El nombre de la liga');
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
  throw new HttpError(500, 'No se pudo crear la liga');
}

export async function joinLeague(env: Env, playerId: string, code: unknown): Promise<LeagueRow> {
  await requireName(env, playerId);
  const clean = typeof code === 'string' ? code.trim().toUpperCase() : '';
  const league = await env.DB.prepare('SELECT id, name, code FROM leagues WHERE code = ?').bind(clean).first<LeagueRow>();
  if (!league) throw new HttpError(404, 'No existe ninguna liga con ese código');
  await env.DB.prepare('INSERT OR IGNORE INTO league_members (league_id, player_id) VALUES (?, ?)').bind(league.id, playerId).run();
  return league;
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
}

/** Ranking de una liga para un día. La puntuación de quien aún juega no se muestra. */
export async function leagueRanking(env: Env, playerId: string, leagueId: string, day: string) {
  await requireMember(env, playerId, leagueId);

  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.hat, p.id = ?1 AS is_me, r.started_at, r.finished_at, r.score, r.moves, r.retries, r.hints, r.time_ms
     FROM league_members m
     JOIN players p ON p.id = m.player_id
     LEFT JOIN daily_runs r ON r.player_id = m.player_id AND r.day = ?2
     WHERE m.league_id = ?3
     ORDER BY r.finished_at IS NULL, r.score DESC, r.time_ms ASC, p.name`,
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
               AND (r3.score > me.score OR (r3.score = me.score AND r3.time_ms < me.time_ms))) AS better
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

async function requireMember(env: Env, playerId: string, leagueId: string): Promise<void> {
  const member = await env.DB.prepare('SELECT 1 FROM league_members WHERE league_id = ? AND player_id = ?')
    .bind(leagueId, playerId)
    .first();
  if (!member) throw new HttpError(403, 'No perteneces a esta liga');
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
  const { results } = await env.DB.prepare(
    `WITH runs AS (
       SELECT r.player_id, r.day, r.score, r.time_ms
       FROM daily_runs r
       JOIN league_members lm ON lm.player_id = r.player_id AND lm.league_id = ?4
       WHERE r.day BETWEEN ?2 AND ?3 AND r.finished_at IS NOT NULL
     ),
     ranked AS (
       SELECT *,
              RANK() OVER (PARTITION BY day ORDER BY score DESC, time_ms ASC) AS pos,
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
