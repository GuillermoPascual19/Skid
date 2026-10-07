// Worker de Cloudflare: sirve el juego (archivos estáticos de dist/) y la API
// del reto diario y del ranking en /api/*.
//
// El servidor no se fía del cliente: al terminar el reto, el navegador manda el
// registro de movimientos y aquí se reproduce con la misma lógica del juego
// (src/core) para calcular movimientos, reintentos, tiempo y puntuación.

import { dailyLevel, dayKey, decodeRun, minPlayTimeMs, replayRun, shiftDay } from '../src/core/daily';
import { streaks } from '../src/core/stats';
import { dailyScore } from '../src/core/score';
import { GOOGLE_CERTS_URL, googleKeyProvider, InvalidTokenError, verifyGoogleIdToken } from './google';

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SESSION_RATE_LIMITER: RateLimit;
  JOIN_RATE_LIMITER: RateLimit;
  /** ID de cliente OAuth de Google (público). Sin él, el login con Google está desactivado. */
  GOOGLE_CLIENT_ID?: string;
  /** Solo para pruebas en local: de dónde descargar las claves de firma. */
  GOOGLE_CERTS_URL?: string;
}

interface Session {
  readonly playerId: string;
  readonly tokenHash: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const MAX_LOG_LENGTH = 5000;
/** Cuentas nuevas por IP y día (alto a propósito: en una universidad muchos comparten IP). */
const MAX_SESSIONS_PER_IP_PER_DAY = 20;
/** Ligas que puede crear cada jugador. */
const MAX_LEAGUES_PER_PLAYER = 10;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin 0/O ni 1/I.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await handleApi(req, url, env);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Error interno' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function handleApi(req: Request, url: URL, env: Env): Promise<Response> {
  const route = `${req.method} ${url.pathname.replace(/^\/api/, '')}`;
  let m: RegExpMatchArray | null;

  if (route === 'POST /session') return json(await createSession(req, env));
  if (route === 'GET /config') return json({ googleClientId: env.GOOGLE_CLIENT_ID || null });

  const session = await authenticate(req, env);
  const { playerId } = session;

  if (route === 'POST /auth/google') {
    const { credential } = await body<{ credential?: unknown }>(req);
    return json(await googleLogin(env, session, credential));
  }
  if (route === 'POST /auth/logout') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash).run();
    return json({ ok: true });
  }

  if (route === 'GET /me') {
    const row = await env.DB.prepare('SELECT name, email FROM players WHERE id = ?')
      .bind(playerId)
      .first<{ name: string | null; email: string | null }>();
    return json({ name: row?.name ?? null, email: row?.email ?? null });
  }
  if (route === 'PUT /me') {
    const { name } = await body<{ name?: unknown }>(req);
    const clean = cleanText(name, 2, 20, 'El nombre');
    // Nombres únicos (sin distinguir mayúsculas), para que nadie se haga pasar por otro.
    const taken = await env.DB.prepare('SELECT 1 FROM players WHERE lower(name) = lower(?) AND id <> ?')
      .bind(clean, playerId)
      .first();
    if (taken) throw new HttpError(409, 'Ese nombre ya lo tiene otro jugador. Prueba con otro.');
    await env.DB.prepare('UPDATE players SET name = ? WHERE id = ?').bind(clean, playerId).run();
    return json({ name: clean });
  }

  if (route === 'GET /stats') return json(await playerStats(env, playerId));
  if ((m = route.match(/^GET \/daily\/(\d{4}-\d{2}-\d{2})$/))) return json(await getRun(env, playerId, m[1]));
  if ((m = route.match(/^POST \/daily\/(\d{4}-\d{2}-\d{2})\/start$/))) return json(await startRun(env, playerId, m[1]));
  if ((m = route.match(/^GET \/daily\/(\d{4}-\d{2}-\d{2})\/wins$/))) return json(await dailyWins(env, playerId, m[1]));
  if ((m = route.match(/^POST \/daily\/(\d{4}-\d{2}-\d{2})\/finish$/))) {
    const { log } = await body<{ log?: unknown }>(req);
    return json(await finishRun(env, playerId, m[1], log));
  }

  if (route === 'GET /leagues') return json(await myLeagues(env, playerId));
  if (route === 'POST /leagues') {
    const { name } = await body<{ name?: unknown }>(req);
    return json(await createLeague(env, playerId, name));
  }
  if (route === 'POST /leagues/join') {
    // Sin límite se podrían probar códigos hasta acertar con una liga ajena.
    const { success } = await env.JOIN_RATE_LIMITER.limit({ key: playerId });
    if (!success) throw new HttpError(429, 'Demasiados intentos. Espera un minuto.');
    const { code } = await body<{ code?: unknown }>(req);
    return json(await joinLeague(env, playerId, code));
  }
  if ((m = route.match(/^GET \/leagues\/([\w-]+)\/ranking$/))) {
    const day = url.searchParams.get('day') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, 'Día no válido');
    return json(await leagueRanking(env, playerId, m[1], day));
  }
  if ((m = route.match(/^GET \/leagues\/([\w-]+)\/standings$/))) {
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpError(400, 'Periodo no válido');
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days < 0 || days > 31) throw new HttpError(400, 'El periodo debe ser de 1 a 32 días');
    return json(await leagueStandings(env, playerId, m[1], from, to));
  }

  throw new HttpError(404, 'No encontrado');
}

// ------------------------------------------------------------------ Sesión

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createSession(req: Request, env: Env): Promise<{ token: string }> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'desconocida';
  const ipHash = await sha256(`skid-ip:${ip}`);

  // Ráfagas: el limitador de Cloudflare, en memoria (no gasta base de datos).
  const { success } = await env.SESSION_RATE_LIMITER.limit({ key: ipHash });
  if (!success) throw new HttpError(429, 'Demasiadas cuentas nuevas seguidas. Espera un minuto.');

  // Total diario, en D1. Los días anteriores se borran sobre la marcha.
  const day = dayKey(new Date());
  const [, counter] = await env.DB.batch([
    env.DB.prepare('DELETE FROM session_limits WHERE day < ?').bind(day),
    env.DB.prepare(
      `INSERT INTO session_limits (ip_hash, day, count) VALUES (?, ?, 1)
       ON CONFLICT (ip_hash, day) DO UPDATE SET count = count + 1
       RETURNING count`,
    ).bind(ipHash, day),
  ]);
  const count = (counter.results[0] as { count: number } | undefined)?.count ?? 0;
  if (count > MAX_SESSIONS_PER_IP_PER_DAY) {
    throw new HttpError(429, 'Se han creado demasiadas cuentas desde esta conexión hoy. Prueba mañana.');
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO players (id, token_hash) VALUES (?, ?)').bind(id, tokenHash),
    env.DB.prepare('INSERT INTO sessions (token_hash, player_id) VALUES (?, ?)').bind(tokenHash, id),
  ]);
  return { token };
}

async function authenticate(req: Request, env: Env): Promise<Session> {
  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, 'Sin sesión');
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare('SELECT player_id FROM sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ player_id: string }>();
  if (!row) throw new HttpError(401, 'Sesión no válida');
  return { playerId: row.player_id, tokenHash };
}

// ------------------------------------------------------------- Login Google

let googleKeys: ReturnType<typeof googleKeyProvider> | null = null;

interface GoogleLoginResult {
  /** Token nuevo si este dispositivo pasa a ser otro jugador; null si sigue siendo el mismo. */
  token: string | null;
  switched: boolean;
  name: string | null;
  email: string | null;
}

/**
 * Entra con una cuenta de Google desde la sesión actual:
 * - Si la cuenta ya tiene jugador, este dispositivo pasa a ser ese jugador.
 * - Si no, se vincula al jugador actual (conserva nombre, historial y ligas)...
 * - ...salvo que el jugador actual ya esté vinculado a otra cuenta: entonces se
 *   crea un jugador nuevo para esta.
 */
async function googleLogin(env: Env, session: Session, credential: unknown): Promise<GoogleLoginResult> {
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(503, 'El login con Google no está configurado');
  if (typeof credential !== 'string' || credential.length > 4096) throw new HttpError(400, 'Credencial no válida');

  googleKeys ??= googleKeyProvider(env.GOOGLE_CERTS_URL || GOOGLE_CERTS_URL);
  let claims;
  try {
    claims = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID, googleKeys);
  } catch (err) {
    // 400 y no 401: un 401 haría que el cliente tirase su sesión.
    if (err instanceof InvalidTokenError) throw new HttpError(400, `No se pudo verificar la cuenta de Google: ${err.message}`);
    throw err;
  }
  const email = claims.email_verified === false ? null : (claims.email ?? null);

  const linked = await env.DB.prepare('SELECT id, name FROM players WHERE google_sub = ?')
    .bind(claims.sub)
    .first<{ id: string; name: string | null }>();

  if (linked?.id === session.playerId) {
    await env.DB.prepare('UPDATE players SET email = ? WHERE id = ?').bind(email, linked.id).run();
    return { token: null, switched: false, name: linked.name, email };
  }

  if (linked) return switchDevice(env, session, linked.id, linked.name, email);

  const current = await env.DB.prepare('SELECT name, google_sub FROM players WHERE id = ?')
    .bind(session.playerId)
    .first<{ name: string | null; google_sub: string | null }>();
  if (current?.google_sub) {
    // El jugador de este dispositivo es de otra cuenta de Google: jugador nuevo.
    const id = crypto.randomUUID();
    const token = randomToken();
    const tokenHash = await sha256(token);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO players (id, token_hash, google_sub, email) VALUES (?, ?, ?, ?)').bind(id, tokenHash, claims.sub, email),
      env.DB.prepare('INSERT INTO sessions (token_hash, player_id) VALUES (?, ?)').bind(tokenHash, id),
      env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash),
    ]);
    return { token, switched: true, name: null, email };
  }

  // Primera vez con esta cuenta: se vincula al jugador actual.
  await env.DB.prepare('UPDATE players SET google_sub = ?, email = ? WHERE id = ? AND google_sub IS NULL')
    .bind(claims.sub, email, session.playerId)
    .run();
  return { token: null, switched: false, name: current?.name ?? null, email };
}

/** Este dispositivo pasa a ser `playerId`: sesión nueva para él y fuera la actual. */
async function switchDevice(
  env: Env,
  session: Session,
  playerId: string,
  name: string | null,
  email: string | null,
): Promise<GoogleLoginResult> {
  const token = randomToken();
  const tokenHash = await sha256(token);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, player_id) VALUES (?, ?)').bind(tokenHash, playerId),
    env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash),
    env.DB.prepare('UPDATE players SET email = ? WHERE id = ?').bind(email, playerId),
  ]);
  return { token, switched: true, name, email };
}

// ------------------------------------------------------------ Utilidades

async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Cuerpo no válido');
  }
}

function cleanText(value: unknown, min: number, max: number, what: string): string {
  // Sin caracteres de control y con espacios normalizados.
  const text = typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim() : '';
  if (text.length < min || text.length > max) throw new HttpError(400, `${what} debe tener entre ${min} y ${max} caracteres`);
  return text;
}

async function requireName(env: Env, playerId: string): Promise<void> {
  const row = await env.DB.prepare('SELECT name FROM players WHERE id = ?').bind(playerId).first<{ name: string | null }>();
  if (!row?.name) throw new HttpError(400, 'Elige un nombre primero');
}

// ------------------------------------------------------------ Reto diario

interface RunRow {
  started_at: number;
  finished_at: number | null;
  moves: number | null;
  retries: number | null;
  hints: number;
  time_ms: number | null;
  score: number | null;
}

function runResponse(row: RunRow | null) {
  if (!row) return null;
  return {
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    moves: row.moves,
    retries: row.retries,
    hints: row.hints,
    timeMs: row.time_ms,
    score: row.score,
  };
}

function selectRun(env: Env, playerId: string, day: string): Promise<RunRow | null> {
  return env.DB.prepare(
    'SELECT started_at, finished_at, moves, retries, hints, time_ms, score FROM daily_runs WHERE player_id = ? AND day = ?',
  )
    .bind(playerId, day)
    .first<RunRow>();
}

async function getRun(env: Env, playerId: string, day: string) {
  return { run: runResponse(await selectRun(env, playerId, day)) };
}

/** Empieza el reto de hoy; el cronómetro arranca aquí. Si ya existía, lo devuelve tal cual. */
async function startRun(env: Env, playerId: string, day: string) {
  if (day !== dayKey(new Date())) throw new HttpError(400, 'Solo se puede jugar el reto de hoy');
  await env.DB.prepare('INSERT OR IGNORE INTO daily_runs (player_id, day, started_at) VALUES (?, ?, ?)')
    .bind(playerId, day, Date.now())
    .run();
  return { run: runResponse(await selectRun(env, playerId, day)) };
}

async function finishRun(env: Env, playerId: string, day: string, log: unknown) {
  if (typeof log !== 'string' || log.length > MAX_LOG_LENGTH) throw new HttpError(400, 'Registro no válido');
  const run = await selectRun(env, playerId, day);
  if (!run) throw new HttpError(409, 'No has empezado el reto de ese día');
  if (run.finished_at !== null) throw new HttpError(409, 'Ya completaste este reto');

  const level = dailyLevel(day);
  let replay;
  try {
    replay = replayRun(level.board, decodeRun(log));
  } catch (err) {
    throw new HttpError(400, `Registro no válido: ${(err as Error).message}`);
  }
  if (!replay.completed) throw new HttpError(400, 'El registro no completa el reto');

  const finishedAt = Date.now();
  const timeMs = finishedAt - run.started_at;
  // Jugando de verdad no se puede terminar antes de que acaben las animaciones
  // (con un 10 % de margen). Más rápido = enviado con un script, sin jugar.
  if (timeMs < minPlayTimeMs(replay) * 0.9) {
    throw new HttpError(400, 'Partida demasiado rápida para haberse jugado en el juego');
  }
  const optimal = level.solution.length;
  const score = dailyScore({ moves: replay.moves, optimal, retries: replay.retries, hints: replay.hints, timeMs }).total;

  // `finished_at IS NULL` evita que dos envíos simultáneos escriban los dos.
  const update = await env.DB.prepare(
    `UPDATE daily_runs SET finished_at = ?, moves = ?, retries = ?, hints = ?, time_ms = ?, score = ?, log = ?
     WHERE player_id = ? AND day = ? AND finished_at IS NULL`,
  )
    .bind(finishedAt, replay.moves, replay.retries, replay.hints, timeMs, score, log, playerId, day)
    .run();
  if (update.meta.changes !== 1) throw new HttpError(409, 'Ya completaste este reto');

  const { results: played } = await env.DB.prepare('SELECT day FROM daily_runs WHERE player_id = ? AND finished_at IS NOT NULL')
    .bind(playerId)
    .all<{ day: string }>();
  const streak = streaks(played.map((r) => r.day), dayKey(new Date())).current;

  return { moves: replay.moves, retries: replay.retries, hints: replay.hints, timeMs, optimal, score, streak };
}

// ------------------------------------------------------------------ Ligas

interface LeagueRow {
  id: string;
  name: string;
  code: string;
  members?: number;
}

async function myLeagues(env: Env, playerId: string): Promise<LeagueRow[]> {
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

async function createLeague(env: Env, playerId: string, name: unknown): Promise<LeagueRow> {
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

async function joinLeague(env: Env, playerId: string, code: unknown): Promise<LeagueRow> {
  await requireName(env, playerId);
  const clean = typeof code === 'string' ? code.trim().toUpperCase() : '';
  const league = await env.DB.prepare('SELECT id, name, code FROM leagues WHERE code = ?').bind(clean).first<LeagueRow>();
  if (!league) throw new HttpError(404, 'No existe ninguna liga con ese código');
  await env.DB.prepare('INSERT OR IGNORE INTO league_members (league_id, player_id) VALUES (?, ?)').bind(league.id, playerId).run();
  return league;
}

interface RankingDbRow {
  name: string;
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
async function leagueRanking(env: Env, playerId: string, leagueId: string, day: string) {
  await requireMember(env, playerId, leagueId);

  const { results } = await env.DB.prepare(
    `SELECT p.name, p.id = ?1 AS is_me, r.started_at, r.finished_at, r.score, r.moves, r.retries, r.hints, r.time_ms
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
      name: r.name,
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
  winner: string | null;
  score: number | null;
}

/**
 * Ligas en las que el jugador quedó 1.º en el reto de `day` (mejor puntuación;
 * a igualdad, menos tiempo). Solo cuenta si terminaron al menos 2 personas.
 */
async function dailyWins(env: Env, playerId: string, day: string) {
  const { results } = await env.DB.prepare(
    `SELECT l.id AS league_id, l.name AS league_name,
            (SELECT COUNT(*) FROM league_members m2
               JOIN daily_runs r2 ON r2.player_id = m2.player_id AND r2.day = ?2 AND r2.finished_at IS NOT NULL
             WHERE m2.league_id = l.id) AS finishers,
            (SELECT m3.player_id FROM league_members m3
               JOIN daily_runs r3 ON r3.player_id = m3.player_id AND r3.day = ?2 AND r3.finished_at IS NOT NULL
             WHERE m3.league_id = l.id
             ORDER BY r3.score DESC, r3.time_ms ASC LIMIT 1) AS winner,
            (SELECT score FROM daily_runs WHERE player_id = ?1 AND day = ?2) AS score
     FROM leagues l
     JOIN league_members m ON m.league_id = l.id AND m.player_id = ?1
     ORDER BY m.joined_at`,
  )
    .bind(playerId, day)
    .all<WinRow>();

  return results
    .filter((r) => r.winner === playerId && r.finishers >= 2)
    .map((r) => ({ leagueId: r.league_id, leagueName: r.league_name, players: r.finishers, score: r.score }));
}

async function requireMember(env: Env, playerId: string, leagueId: string): Promise<void> {
  const member = await env.DB.prepare('SELECT 1 FROM league_members WHERE league_id = ? AND player_id = ?')
    .bind(leagueId, playerId)
    .first();
  if (!member) throw new HttpError(403, 'No perteneces a esta liga');
}

interface StandingRow {
  name: string;
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
async function leagueStandings(env: Env, playerId: string, leagueId: string, from: string, to: string) {
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
              ROW_NUMBER() OVER (PARTITION BY day ORDER BY score DESC, time_ms ASC) AS pos,
              COUNT(*) OVER (PARTITION BY day) AS finishers
       FROM runs
     )
     SELECT p.name, p.id = ?1 AS is_me,
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
    name: r.name,
    isMe: r.is_me === 1,
    points: r.points,
    days: r.days,
    wins: r.wins,
    best: r.best,
  }));
}

// ------------------------------------------------------------ Estadísticas

const HISTORY_DAYS = 30;

/** Días en los que el jugador quedó 1.º en alguna de sus ligas (con al menos 2 que terminaron). */
async function wonDays(env: Env, playerId: string): Promise<Set<string>> {
  const { results } = await env.DB.prepare(
    `WITH runs AS (
       SELECT lm.league_id, r.player_id, r.day, r.score, r.time_ms
       FROM daily_runs r
       JOIN league_members lm ON lm.player_id = r.player_id
       WHERE r.finished_at IS NOT NULL
         AND lm.league_id IN (SELECT league_id FROM league_members WHERE player_id = ?1)
     ),
     ranked AS (
       SELECT *,
              ROW_NUMBER() OVER (PARTITION BY league_id, day ORDER BY score DESC, time_ms ASC) AS pos,
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
async function playerStats(env: Env, playerId: string) {
  const { results: runs } = await env.DB.prepare(
    'SELECT day, score FROM daily_runs WHERE player_id = ? AND finished_at IS NOT NULL ORDER BY day',
  )
    .bind(playerId)
    .all<{ day: string; score: number }>();
  const wins = await wonDays(env, playerId);
  const today = dayKey(new Date());
  const streak = streaks(
    runs.map((r) => r.day),
    today,
  );

  const byDay = new Map(runs.map((r) => [r.day, r.score]));
  const history = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const day = shiftDay(today, i - (HISTORY_DAYS - 1));
    return { day, score: byDay.get(day) ?? null, won: wins.has(day) };
  });
  const scores = runs.map((r) => r.score);

  return {
    played: runs.length,
    currentStreak: streak.current,
    bestStreak: streak.best,
    playedToday: streak.playedToday,
    bestScore: scores.length ? Math.max(...scores) : null,
    averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    wins: wins.size,
    perfect: scores.filter((s) => s >= 1000).length,
    history,
  };
}
