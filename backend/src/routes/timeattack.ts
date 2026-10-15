// Contrarreloj: empezar una partida, enviar cada tablero superado (el servidor lo
// reproduce y suma sus puntos), saltar tableros y el ranking de la semana con tus
// amigos (quienes comparten alguna liga contigo).

import { CIRCLE } from './friends';
import { isHatId } from '../../../common/art/hats';
import { parseBoard } from '../../../common/logic/engine/board';
import { decodeRows, encodeRows } from '../../../common/logic/community/community';
import { dayKey, decodeRun, minPlayTimeMs, replayRun } from '../../../common/logic/daily/daily';
import { weekKey } from '../../../common/logic/weekly/weekly';
import {
  TIME_ATTACK_COUNTDOWN_MS,
  TIME_ATTACK_GRACE_MS,
  TIME_ATTACK_MAX_BOARDS,
  TIME_ATTACK_MS,
  TIME_ATTACK_SKIP_MS,
  boardPoints,
  timeAttackBoard,
} from '../../../common/logic/timeattack/timeattack';
import { type Env, HttpError } from '../http';

const MAX_LOG_LENGTH = 1000;
/** Amigos que se ven en el ranking de la semana. */
const RANKING_SIZE = 50;

interface RunRow {
  id: string;
  player_id: string;
  week: string;
  started_at: number;
  deadline: number;
  next_idx: number;
  last_at: number;
  score: number;
  boards: number;
  perfect: number;
  skipped: number;
}

/** Comprueba que `week` es el lunes de una semana que ya ha empezado. */
function checkWeek(week: string): void {
  if (weekKey(week) !== week || week > weekKey(dayKey(new Date()))) throw new HttpError(400, 'invalidWeek');
}

/** Un tablero de la semana: se genera la primera vez que alguien llega a él y se guarda. */
async function board(env: Env, week: string, idx: number): Promise<{ index: number; rows: string[]; optimal: number }> {
  const saved = await env.DB.prepare('SELECT rows, optimal FROM time_attack_boards WHERE week = ? AND idx = ?')
    .bind(week, idx)
    .first<{ rows: string; optimal: number }>();
  if (saved) return { index: idx, rows: decodeRows(saved.rows), optimal: saved.optimal };
  const level = timeAttackBoard(week, idx);
  const rows = [...level.rows];
  await env.DB.prepare('INSERT OR IGNORE INTO time_attack_boards (week, idx, rows, optimal) VALUES (?, ?, ?, ?)')
    .bind(week, idx, encodeRows(rows), level.solution.length)
    .run();
  return { index: idx, rows, optimal: level.solution.length };
}

async function myRun(env: Env, playerId: string, id: string): Promise<RunRow> {
  const run = await env.DB.prepare('SELECT * FROM time_attack_runs WHERE id = ?').bind(id).first<RunRow>();
  if (!run || run.player_id !== playerId) throw new HttpError(404, 'runNotFound');
  return run;
}

function runResponse(run: RunRow) {
  return {
    id: run.id,
    week: run.week,
    startedAt: run.started_at,
    deadline: run.deadline,
    serverNow: Date.now(),
    score: run.score,
    boards: run.boards,
    perfect: run.perfect,
    skipped: run.skipped,
  };
}

/** Tus amigos (directos y de tus ligas) y tú, con su mejor partida de la semana, ordenados (más puntos; a igualdad, más tableros). */
const FRIENDS_RANKED = `
  WITH friends AS (
    ${CIRCLE}
    UNION SELECT ?1
  ),
  best AS (
    SELECT r.player_id, r.score, r.boards, r.perfect,
           ROW_NUMBER() OVER (PARTITION BY r.player_id ORDER BY r.score DESC, r.boards DESC, r.started_at) AS rn
    FROM time_attack_runs r
    JOIN friends f ON f.player_id = r.player_id
    WHERE r.week = ?2 AND r.score > 0
  )
  SELECT b.player_id, p.name, p.hat, b.score, b.boards, b.perfect, RANK() OVER (ORDER BY b.score DESC, b.boards DESC) AS pos
  FROM best b
  JOIN players p ON p.id = b.player_id
  WHERE b.rn = 1`;

interface RankedRow {
  player_id: string;
  name: string | null;
  hat: string | null;
  score: number;
  boards: number;
  perfect: number;
  pos: number;
}

/** Tu mejor partida de la semana y tu puesto entre tus amigos. */
export async function timeAttackSummary(env: Env, playerId: string, week: string) {
  checkWeek(week);
  const { results } = await env.DB.prepare(`SELECT * FROM (${FRIENDS_RANKED}) ORDER BY pos`).bind(playerId, week).all<RankedRow>();
  const mine = results.find((r) => r.player_id === playerId);
  return {
    week,
    best: mine ? { score: mine.score, boards: mine.boards, perfect: mine.perfect } : null,
    position: mine?.pos ?? null,
    total: results.length,
  };
}

/** El ranking de la semana con tus amigos. */
export async function timeAttackRanking(env: Env, playerId: string, week: string) {
  checkWeek(week);
  const { results } = await env.DB.prepare(`SELECT * FROM (${FRIENDS_RANKED}) ORDER BY pos, name LIMIT ${RANKING_SIZE}`).bind(playerId, week).all<RankedRow>();
  return results.map((r) => ({
    id: r.player_id,
    name: r.name,
    hat: isHatId(r.hat) ? r.hat : null,
    position: r.pos,
    score: r.score,
    boards: r.boards,
    perfect: r.perfect,
    isMe: r.player_id === playerId,
  }));
}

/** Empieza una partida de la semana en curso: tras la cuenta atrás, 3 minutos. */
export async function startTimeAttack(env: Env, playerId: string, week: string) {
  checkWeek(week);
  if (week !== weekKey(dayKey(new Date()))) throw new HttpError(409, 'weekOver');
  const now = Date.now();
  const startedAt = now + TIME_ATTACK_COUNTDOWN_MS;
  const id = crypto.randomUUID();
  const [first] = await Promise.all([
    board(env, week, 0),
    env.DB.prepare('INSERT INTO time_attack_runs (id, player_id, week, started_at, deadline, last_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, playerId, week, startedAt, startedAt + TIME_ATTACK_MS, startedAt)
      .run(),
  ]);
  return { run: runResponse(await myRun(env, playerId, id)), board: first };
}

/** Se puede seguir jugando: ya ha empezado y no se ha acabado el tiempo (con un margen para la red). */
function checkPlaying(run: RunRow, now: number): void {
  if (now < run.started_at) throw new HttpError(409, 'runNotStarted');
  if (now > run.deadline + TIME_ATTACK_GRACE_MS) throw new HttpError(409, 'timeUp');
  if (run.next_idx >= TIME_ATTACK_MAX_BOARDS) throw new HttpError(409, 'timeUp');
}

/** Envías el tablero en curso superado (solo los movimientos desde el último reinicio). */
export async function finishTimeAttackBoard(env: Env, playerId: string, id: string, log: unknown) {
  const run = await myRun(env, playerId, id);
  const now = Date.now();
  checkPlaying(run, now);
  if (typeof log !== 'string' || log.length === 0 || log.length > MAX_LOG_LENGTH || /[XH]/.test(log)) throw new HttpError(400, 'invalidLog');

  const current = await board(env, run.week, run.next_idx);
  let replay;
  try {
    replay = replayRun(parseBoard(current.rows), decodeRun(log));
  } catch {
    throw new HttpError(400, 'invalidLog');
  }
  if (!replay.completed) throw new HttpError(400, 'logIncomplete');
  // Más rápido que las animaciones = enviado con un script, sin jugar.
  if (now - run.last_at < minPlayTimeMs(replay) * 0.9) throw new HttpError(400, 'tooFast');

  // Lo que vale depende de los tableros superados, no de los saltados.
  const { points, perfect } = boardPoints(run.boards, replay.moves, current.optimal);
  // Solo cuenta una vez aunque llegue repetido (se comprueba qué tablero tocaba).
  const update = await env.DB.prepare(
    `UPDATE time_attack_runs SET score = score + ?, boards = boards + 1, perfect = perfect + ?, next_idx = next_idx + 1, last_at = ?
     WHERE id = ? AND next_idx = ?`,
  )
    .bind(points, perfect ? 1 : 0, now, id, run.next_idx)
    .run();
  if (!update.meta.changes) throw new HttpError(409, 'runChanged');
  const next = await board(env, run.week, run.next_idx + 1);
  return { run: runResponse(await myRun(env, playerId, id)), points, perfect, board: next };
}

/** Saltas el tablero en curso: pierdes unos segundos y pasas al siguiente. */
export async function skipTimeAttackBoard(env: Env, playerId: string, id: string) {
  const run = await myRun(env, playerId, id);
  const now = Date.now();
  checkPlaying(run, now);
  const update = await env.DB.prepare(
    `UPDATE time_attack_runs SET deadline = deadline - ?, skipped = skipped + 1, next_idx = next_idx + 1, last_at = ?
     WHERE id = ? AND next_idx = ?`,
  )
    .bind(TIME_ATTACK_SKIP_MS, now, id, run.next_idx)
    .run();
  if (!update.meta.changes) throw new HttpError(409, 'runChanged');
  const next = await board(env, run.week, run.next_idx + 1);
  return { run: runResponse(await myRun(env, playerId, id)), board: next };
}

/** Resumen al acabar: la partida, tu mejor marca de la semana y tu puesto. */
export async function timeAttackResult(env: Env, playerId: string, id: string) {
  const run = await myRun(env, playerId, id);
  const summary = await timeAttackSummary(env, playerId, run.week);
  return { run: runResponse(run), ...summary };
}
