// Duelos en directo: retar a un amigo de tus ligas o a cualquiera con un enlace,
// esperar en la sala a que estéis los dos y pulséis Empezar, jugar a la vez (el
// servidor reproduce el intento) y ver quién gana. Hasta que terminan los dos no se ve el resultado
// del rival.

import { CIRCLE, areFriends } from './friends';
import { isHatId } from '../../../common/art/hats';
import { parseBoard } from '../../../common/logic/engine/board';
import { decodeRows, encodeRows } from '../../../common/logic/community/community';
import { decodeRun, minPlayTimeMs, replayRun } from '../../../common/logic/daily/daily';
import {
  DUEL_COUNTDOWN_MS,
  DUEL_DURATION_MS,
  DUEL_LIVE_MS,
  DUEL_PRESENCE_MS,
  duelLevel,
  duelVerdict,
  isDuelDifficulty,
} from '../../../common/logic/duels/duels';
import { type Env, HttpError } from '../http';
import { background, notify } from '../push';
import { requireName } from './players';

const MAX_LOG_LENGTH = 2000;
/** Duelos sin terminar que puede haber creado un jugador a la vez (contra el spam). */
const MAX_ACTIVE_DUELS = 20;
/** Los duelos terminados se listan durante este tiempo. */
const LIST_DAYS_MS = 14 * 86_400_000;

interface DuelRow {
  id: string;
  challenger_id: string;
  opponent_id: string | null;
  difficulty: string;
  rows: string;
  optimal: number;
  created_at: number;
  expires_at: number;
  declined_at: number | null;
  challenger_seen_at: number | null;
  opponent_seen_at: number | null;
  challenger_ready_at: number | null;
  opponent_ready_at: number | null;
  starts_at: number | null;
}

interface PlayerRow {
  id: string;
  name: string | null;
  hat: string | null;
}

interface RunRow {
  player_id: string;
  started_at: number;
  best_moves: number | null;
  best_time_ms: number | null;
  best_log: string | null;
  attempts: number;
  done_at: number | null;
}

/**
 * open: nadie ha aceptado el enlace · waiting: hay rival, pero aún no han
 * coincidido en la sala o no han pulsado Empezar los dos · playing: empezado (o en la cuenta atrás) · finished:
 * terminaron los dos o se acabó el tiempo · declined: el rival lo rechazó.
 */
type DuelStatus = 'open' | 'waiting' | 'playing' | 'finished' | 'declined';

/** Avisos de un duelo a un jugador: como mucho uno cada 10 minutos por duelo. */
const DUEL_NOTIFY_MS = 10 * 60 * 1000;

async function nameOf(env: Env, playerId: string): Promise<string> {
  const row = await env.DB.prepare('SELECT name FROM players WHERE id = ?').bind(playerId).first<{ name: string | null }>();
  return row?.name ?? '?';
}

/** Avisa a `to` de algo del duelo `duelId` que ha hecho `from`. */
function notifyDuel(env: Env, to: string, from: string, duelId: string, kind: 'duelChallenge' | 'duelAccepted' | 'duelWaiting'): void {
  background(
    env,
    nameOf(env, from).then((name) => notify(env, to, kind, { name }, { url: `/?duelo=${duelId}`, throttle: { tag: `duel:${duelId}`, ms: DUEL_NOTIFY_MS } })),
  );
}

/** Amigos para retar: tus amigos directos y quienes comparten alguna liga contigo. */
export async function listFriends(env: Env, playerId: string) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.hat
     FROM (${CIRCLE}) c
     JOIN players p ON p.id = c.player_id
     WHERE p.name IS NOT NULL
     ORDER BY p.name`,
  )
    .bind(playerId)
    .all<PlayerRow>();
  return results.map((p) => ({ id: p.id, name: p.name!, hat: isHatId(p.hat) ? p.hat : null }));
}

function statusOf(duel: DuelRow, runs: RunRow[], now: number): DuelStatus {
  if (duel.declined_at !== null) return 'declined';
  const bothDone = !!duel.opponent_id && [duel.challenger_id, duel.opponent_id].every((id) => runs.some((r) => r.player_id === id && r.done_at !== null));
  if (bothDone || now >= duel.expires_at) return 'finished';
  if (!duel.opponent_id) return 'open';
  return duel.starts_at === null ? 'waiting' : 'playing';
}

const present = (seenAt: number | null, now: number) => seenAt !== null && now - seenAt < DUEL_PRESENCE_MS;

/** Un duelo visto por uno de sus dos jugadores. El resultado del rival solo se ve al terminar. */
async function duelResponse(env: Env, duel: DuelRow, playerId: string) {
  const now = Date.now();
  const [{ results: runs }, { results: players }] = await Promise.all([
    env.DB.prepare('SELECT player_id, started_at, best_moves, best_time_ms, best_log, attempts, done_at FROM duel_runs WHERE duel_id = ?')
      .bind(duel.id)
      .all<RunRow>(),
    env.DB.prepare('SELECT id, name, hat FROM players WHERE id IN (?, ?)')
      .bind(duel.challenger_id, duel.opponent_id ?? duel.challenger_id)
      .all<PlayerRow>(),
  ]);
  const status = statusOf(duel, runs, now);
  const iAmChallenger = playerId === duel.challenger_id;
  const rivalId = iAmChallenger ? duel.opponent_id : duel.challenger_id;
  const seenAt = (id: string) => (id === duel.challenger_id ? duel.challenger_seen_at : duel.opponent_seen_at);
  const readyAt = (id: string) => (id === duel.challenger_id ? duel.challenger_ready_at : duel.opponent_ready_at);
  const side = (id: string | null, reveal: boolean) => {
    if (!id) return null;
    const player = players.find((p) => p.id === id);
    const run = runs.find((r) => r.player_id === id);
    const done = run?.best_moves != null;
    return {
      id,
      name: player?.name ?? null,
      hat: isHatId(player?.hat) ? player.hat : null,
      /** En la sala ahora mismo. */
      present: present(seenAt(id), now),
      /** Ha pulsado Empezar. */
      ready: readyAt(id) !== null,
      started: !!run,
      finished: done,
      // Ha terminado su intento (eso sí se ve: sabes que el rival ya ha acabado).
      handedIn: run?.done_at != null,
      // El resultado del rival queda oculto hasta el final: así nadie juega sabiendo qué batir.
      moves: reveal && done ? run!.best_moves : null,
      timeMs: reveal && done ? run!.best_time_ms : null,
      overPar: reveal && done ? Math.max(0, run!.best_moves! - duel.optimal) : null,
      attempts: reveal ? (run?.attempts ?? 0) : null,
    };
  };
  const over = status === 'finished';
  const me = side(playerId, true)!;
  const rival = side(rivalId, over);
  let outcome: 'win' | 'lose' | 'draw' | null = null;
  let decidedBy: 'moves' | 'time' | 'noShow' | null = null;
  if (over) {
    const result = (id: string | null) => {
      const run = runs.find((r) => r.player_id === id);
      return run?.best_moves != null ? { moves: run.best_moves, timeMs: run.best_time_ms ?? 0 } : null;
    };
    const verdict = duelVerdict(result(playerId), result(rivalId));
    outcome = verdict.winner === 'draw' ? 'draw' : verdict.winner === 'a' ? 'win' : 'lose';
    decidedBy = verdict.by;
  }
  return {
    id: duel.id,
    difficulty: duel.difficulty,
    optimal: duel.optimal,
    rows: decodeRows(duel.rows),
    createdAt: duel.created_at,
    expiresAt: duel.expires_at,
    /** Cuándo empieza (o empezó) la partida, con el reloj del servidor; null si aún no han pulsado Empezar los dos. */
    startsAt: duel.starts_at,
    /** Hora del servidor, para que el juego cuadre la cuenta atrás con su reloj. */
    serverNow: now,
    role: iAmChallenger ? 'challenger' : 'opponent',
    status,
    me,
    rival,
    outcome,
    decidedBy,
  };
}

async function loadDuel(env: Env, id: string): Promise<DuelRow> {
  const duel = await env.DB.prepare('SELECT * FROM duels WHERE id = ?').bind(id).first<DuelRow>();
  if (!duel) throw new HttpError(404, 'duelNotFound');
  return duel;
}

/** El duelo, si eres uno de sus dos jugadores. */
async function myDuel(env: Env, playerId: string, id: string): Promise<DuelRow> {
  const duel = await loadDuel(env, id);
  if (duel.challenger_id !== playerId && duel.opponent_id !== playerId) throw new HttpError(404, 'duelNotFound');
  return duel;
}

/** Reta a un amigo (`opponentId`, directo o de tus ligas) o crea un duelo abierto para compartir por enlace (null). */
export async function createDuel(env: Env, playerId: string, input: { difficulty?: unknown; opponentId?: unknown }) {
  await requireName(env, playerId);
  if (!isDuelDifficulty(input.difficulty)) throw new HttpError(400, 'invalidDifficulty');
  const opponentId = input.opponentId ?? null;
  if (opponentId !== null) {
    if (typeof opponentId !== 'string' || opponentId === playerId) throw new HttpError(400, 'invalidRival');
    if (!(await areFriends(env, playerId, opponentId))) throw new HttpError(403, 'onlyLeagueRivals');
  }
  const now = Date.now();
  const active = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM duels WHERE challenger_id = ? AND expires_at > ? AND declined_at IS NULL',
  )
    .bind(playerId, now)
    .first<{ n: number }>();
  if ((active?.n ?? 0) >= MAX_ACTIVE_DUELS) throw new HttpError(429, 'maxDuels', { n: MAX_ACTIVE_DUELS });

  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const level = duelLevel(input.difficulty, seed);
  const id = crypto.randomUUID();
  // Quien reta entra directamente en la sala.
  await env.DB.prepare(
    `INSERT INTO duels (id, challenger_id, opponent_id, difficulty, rows, optimal, created_at, expires_at, challenger_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, playerId, opponentId, input.difficulty, encodeRows(level.rows), level.solution.length, now, now + DUEL_DURATION_MS, now)
    .run();
  if (opponentId) notifyDuel(env, opponentId, playerId, id, 'duelChallenge');
  return duelResponse(env, await loadDuel(env, id), playerId);
}

/** Tus duelos: los que siguen en marcha y los terminados de las dos últimas semanas. */
export async function listDuels(env: Env, playerId: string) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM duels WHERE (challenger_id = ?1 OR opponent_id = ?1) AND expires_at > ?2 ORDER BY created_at DESC LIMIT 50`,
  )
    .bind(playerId, Date.now() - LIST_DAYS_MS)
    .all<DuelRow>();
  return Promise.all(results.map((d) => duelResponse(env, d, playerId)));
}

/**
 * Un duelo. Sus jugadores lo ven entero; quien abre el enlace de un duelo
 * abierto ve solo quién reta y la dificultad (el tablero, al aceptarlo).
 */
export async function getDuel(env: Env, playerId: string, id: string) {
  const duel = await loadDuel(env, id);
  if (duel.challenger_id === playerId || duel.opponent_id === playerId) return { duel: await duelResponse(env, duel, playerId), invite: null };
  if (duel.opponent_id !== null || duel.expires_at <= Date.now()) throw new HttpError(404, 'duelUnavailable');
  const challenger = await env.DB.prepare('SELECT id, name, hat FROM players WHERE id = ?').bind(duel.challenger_id).first<PlayerRow>();
  return {
    duel: null,
    invite: {
      id: duel.id,
      difficulty: duel.difficulty,
      expiresAt: duel.expires_at,
      challenger: { name: challenger?.name ?? null, hat: isHatId(challenger?.hat) ? challenger.hat : null },
    },
  };
}

/** Acepta un duelo abierto (por enlace): pasas a ser el rival y entras en la sala. */
export async function acceptDuel(env: Env, playerId: string, id: string) {
  await requireName(env, playerId);
  const duel = await loadDuel(env, id);
  if (duel.challenger_id === playerId) throw new HttpError(400, 'ownDuel');
  if (duel.expires_at <= Date.now()) throw new HttpError(409, 'duelOver');
  const update = await env.DB.prepare('UPDATE duels SET opponent_id = ?, opponent_seen_at = ? WHERE id = ? AND opponent_id IS NULL')
    .bind(playerId, Date.now(), id)
    .run();
  if (!update.meta.changes && duel.opponent_id !== playerId) throw new HttpError(409, 'duelHasRival');
  if (update.meta.changes) notifyDuel(env, duel.challenger_id, playerId, id, 'duelAccepted');
  return here(env, playerId, id);
}

/** El rival rechaza el duelo (antes de empezar): termina sin ganador. */
export async function declineDuel(env: Env, playerId: string, id: string) {
  const duel = await myDuel(env, playerId, id);
  if (duel.opponent_id !== playerId) throw new HttpError(400, 'onlyChallengedCanDecline');
  if (duel.starts_at !== null) throw new HttpError(409, 'alreadyStarted');
  await env.DB.prepare('UPDATE duels SET declined_at = ? WHERE id = ? AND declined_at IS NULL').bind(Date.now(), id).run();
  return duelResponse(env, await loadDuel(env, id), playerId);
}

/** Sigues en la sala (el juego lo dice cada pocos segundos). */
export async function here(env: Env, playerId: string, id: string) {
  const duel = await myDuel(env, playerId, id);
  const now = Date.now();
  if (duel.declined_at !== null || duel.expires_at <= now || duel.starts_at !== null) return duelResponse(env, duel, playerId);
  const column = playerId === duel.challenger_id ? 'challenger_seen_at' : 'opponent_seen_at';
  await env.DB.prepare(`UPDATE duels SET ${column} = ? WHERE id = ?`).bind(now, id).run();
  return maybeStart(env, playerId, id);
}

/** Pulsas Empezar (o lo deshaces con `ready` false). Cuenta también como estar en la sala. */
export async function setReady(env: Env, playerId: string, id: string, ready: unknown) {
  const duel = await myDuel(env, playerId, id);
  const now = Date.now();
  if (duel.declined_at !== null) throw new HttpError(409, 'duelDeclined');
  if (!duel.opponent_id) throw new HttpError(409, 'duelNoRival');
  if (duel.expires_at <= now) throw new HttpError(409, 'duelOver');
  if (duel.starts_at !== null) return duelResponse(env, duel, playerId); // Ya ha empezado: nada que cambiar.
  const me = playerId === duel.challenger_id ? 'challenger' : 'opponent';
  await env.DB.prepare(`UPDATE duels SET ${me}_ready_at = ?, ${me}_seen_at = ? WHERE id = ?`)
    .bind(ready === true ? now : null, now, id)
    .run();
  return maybeStart(env, playerId, id);
}

/**
 * Si los dos están en la sala y han pulsado Empezar, se fija la hora de empezar
 * para los dos: tras la cuenta atrás, y con un tiempo máximo para terminar.
 */
async function maybeStart(env: Env, playerId: string, id: string) {
  const duel = await loadDuel(env, id);
  const now = Date.now();
  const ready =
    duel.opponent_id !== null &&
    duel.challenger_ready_at !== null &&
    duel.opponent_ready_at !== null &&
    present(duel.challenger_seen_at, now) &&
    present(duel.opponent_seen_at, now);
  if (!ready || duel.starts_at !== null) {
    // Estás en la sala y el rival no: se le avisa (como mucho cada 10 minutos).
    const rivalId = playerId === duel.challenger_id ? duel.opponent_id : duel.challenger_id;
    const rivalSeen = playerId === duel.challenger_id ? duel.opponent_seen_at : duel.challenger_seen_at;
    if (duel.starts_at === null && rivalId && !present(rivalSeen, now)) notifyDuel(env, rivalId, playerId, id, 'duelWaiting');
    return duelResponse(env, duel, playerId);
  }

  const startsAt = now + DUEL_COUNTDOWN_MS;
  // Solo la primera petición que los ve listos fija la hora (si llegan dos a la vez, gana una).
  const update = await env.DB.prepare('UPDATE duels SET starts_at = ?, expires_at = ? WHERE id = ? AND starts_at IS NULL')
    .bind(startsAt, startsAt + DUEL_LIVE_MS, id)
    .run();
  if (update.meta.changes) {
    await env.DB.batch(
      [duel.challenger_id, duel.opponent_id!].map((p) =>
        env.DB.prepare('INSERT OR IGNORE INTO duel_runs (duel_id, player_id, started_at) VALUES (?, ?, ?)').bind(id, p, startsAt),
      ),
    );
  }
  return duelResponse(env, await loadDuel(env, id), playerId);
}

/**
 * Envía tu intento terminado (solo los movimientos desde el último reinicio).
 * Hay un único intento: al enviarlo ya has terminado. El tiempo cuenta desde
 * que empezó el duelo, también el de los reinicios.
 */
export async function finishDuel(env: Env, playerId: string, id: string, log: unknown) {
  const duel = await myDuel(env, playerId, id);
  if (duel.declined_at !== null) throw new HttpError(409, 'duelDeclined');
  if (!duel.opponent_id) throw new HttpError(409, 'duelNoRival');
  const now = Date.now();
  if (duel.expires_at <= now) throw new HttpError(409, 'duelOver');
  if (typeof log !== 'string' || log.length === 0 || log.length > MAX_LOG_LENGTH || /[XH]/.test(log)) {
    throw new HttpError(400, 'invalidLog');
  }
  const run = await env.DB.prepare('SELECT started_at, done_at FROM duel_runs WHERE duel_id = ? AND player_id = ?')
    .bind(id, playerId)
    .first<{ started_at: number; done_at: number | null }>();
  if (!run || now < run.started_at) throw new HttpError(409, 'duelNotStarted');
  if (run.done_at !== null) throw new HttpError(409, 'duelHandedIn');

  let replay;
  try {
    replay = replayRun(parseBoard(decodeRows(duel.rows)), decodeRun(log));
  } catch {
    throw new HttpError(400, 'invalidLog');
  }
  if (!replay.completed) throw new HttpError(400, 'logIncomplete');
  // Más rápido que las animaciones = enviado con un script, sin jugar.
  if (now - run.started_at < minPlayTimeMs(replay) * 0.9) throw new HttpError(400, 'tooFast');

  const update = await env.DB.prepare(
    `UPDATE duel_runs SET attempts = 1, best_moves = ?, best_time_ms = ?, best_log = ?, done_at = ?
     WHERE duel_id = ? AND player_id = ? AND done_at IS NULL`,
  )
    .bind(replay.moves, now - run.started_at, log, now, id, playerId)
    .run();
  if (!update.meta.changes) throw new HttpError(409, 'duelHandedIn');
  return { duel: await duelResponse(env, duel, playerId), attemptMoves: replay.moves, improved: true };
}

/** Los dos intentos para verlos a la vez, cuando el duelo ha terminado. */
export async function duelGhost(env: Env, playerId: string, id: string) {
  const duel = await myDuel(env, playerId, id);
  const view = await duelResponse(env, duel, playerId);
  if (view.status !== 'finished') throw new HttpError(409, 'duelNotOver');
  const { results } = await env.DB.prepare('SELECT player_id, best_log, best_time_ms, best_moves FROM duel_runs WHERE duel_id = ?')
    .bind(id)
    .all<{ player_id: string; best_log: string | null; best_time_ms: number | null; best_moves: number | null }>();
  const ghostOf = (side: typeof view.me | null) => {
    const run = side && results.find((r) => r.player_id === side.id);
    if (!side || !run?.best_log) return null;
    return {
      name: side.name,
      hat: side.hat,
      path: run.best_log,
      hints: 0,
      timeMs: run.best_time_ms,
      overPar: Math.max(0, (run.best_moves ?? 0) - duel.optimal),
      score: null,
    };
  };
  const friend = ghostOf(view.rival);
  if (!friend) throw new HttpError(404, 'rivalDidntFinish');
  return { rows: view.rows, me: ghostOf(view.me), friend };
}
