// Reto semanal: consultar, empezar, enviar intentos (el servidor los reproduce)
// y el ranking con tus amigos (quienes comparten alguna liga contigo).

import { isHatId } from '../../../common/art/hats';
import { parseBoard } from '../../../common/logic/engine/board';
import { decodeRows, encodeRows } from '../../../common/logic/community/community';
import { dayKey, decodeRun, minPlayTimeMs, replayRun } from '../../../common/logic/daily/daily';
import { weekKey, weeklyLevel } from '../../../common/logic/weekly/weekly';
import { type Env, HttpError } from '../http';

const MAX_LOG_LENGTH = 2000;
/** Amigos que se ven en el ranking de la semana. */
const WEEKLY_RANKING_SIZE = 50;

interface WeeklyRunRow {
  started_at: number;
  best_moves: number | null;
  best_at: number | null;
  attempts: number;
}

/** Comprueba que `week` es el lunes de una semana que ya ha empezado. */
function checkWeek(week: string): void {
  if (weekKey(week) !== week || week > weekKey(dayKey(new Date()))) throw new HttpError(400, 'Semana no válida');
}

/** Tablero de la semana: se genera la primera vez que alguien lo pide y se guarda. */
async function weeklyBoard(env: Env, week: string): Promise<{ rows: string[]; optimal: number }> {
  const saved = await env.DB.prepare('SELECT rows, optimal FROM weekly_boards WHERE week = ?').bind(week).first<{ rows: string; optimal: number }>();
  if (saved) return { rows: decodeRows(saved.rows), optimal: saved.optimal };
  const level = weeklyLevel(week);
  const rows = [...level.rows];
  await env.DB.prepare('INSERT OR IGNORE INTO weekly_boards (week, rows, optimal) VALUES (?, ?, ?)')
    .bind(week, encodeRows(rows), level.solution.length)
    .run();
  return { rows, optimal: level.solution.length };
}

function selectRun(env: Env, playerId: string, week: string): Promise<WeeklyRunRow | null> {
  return env.DB.prepare('SELECT started_at, best_moves, best_at, attempts FROM weekly_runs WHERE player_id = ? AND week = ?')
    .bind(playerId, week)
    .first<WeeklyRunRow>();
}

function runResponse(row: WeeklyRunRow | null, optimal: number) {
  if (!row) return null;
  return {
    startedAt: row.started_at,
    bestMoves: row.best_moves,
    overPar: row.best_moves === null ? null : Math.max(0, row.best_moves - optimal),
    bestAt: row.best_at,
    attempts: row.attempts,
  };
}

interface RankingRow {
  player_id: string;
  name: string | null;
  hat: string | null;
  best_moves: number;
  pos: number;
}

/** Tus amigos (de todas tus ligas) y tú, con su mejor intento de la semana, ordenados. */
const FRIENDS_RANKED = `
  WITH friends AS (
    SELECT b.player_id FROM league_members a JOIN league_members b ON b.league_id = a.league_id WHERE a.player_id = ?1
    UNION SELECT ?1
  )
  SELECT r.player_id, p.name, p.hat, r.best_moves, RANK() OVER (ORDER BY r.best_moves, r.best_at) AS pos
  FROM weekly_runs r
  JOIN friends f ON f.player_id = r.player_id
  JOIN players p ON p.id = r.player_id
  WHERE r.week = ?2 AND r.best_moves IS NOT NULL`;

/** Tu puesto entre tus amigos y cuántos lo han terminado. */
async function myPlace(env: Env, playerId: string, week: string) {
  const row = await env.DB.prepare(
    `SELECT (SELECT pos FROM (${FRIENDS_RANKED}) WHERE player_id = ?1) AS position, (SELECT COUNT(*) FROM (${FRIENDS_RANKED})) AS total`,
  )
    .bind(playerId, week)
    .first<{ position: number | null; total: number }>();
  return { position: row?.position ?? null, total: row?.total ?? 0 };
}

/** El reto de una semana: su tablero, tu partida y tu puesto entre tus amigos. */
export async function getWeekly(env: Env, playerId: string, week: string) {
  checkWeek(week);
  const [board, run] = await Promise.all([weeklyBoard(env, week), selectRun(env, playerId, week)]);
  return { week, ...board, run: runResponse(run, board.optimal), ...(await myPlace(env, playerId, week)) };
}

/** Empieza el reto de esta semana (para saber cuánto se ha tardado como mínimo). */
export async function startWeekly(env: Env, playerId: string, week: string) {
  checkWeek(week);
  if (week !== weekKey(dayKey(new Date()))) throw new HttpError(400, 'Esa semana ya ha terminado');
  await env.DB.prepare('INSERT OR IGNORE INTO weekly_runs (player_id, week, started_at) VALUES (?, ?, ?)')
    .bind(playerId, week, Date.now())
    .run();
  return getWeekly(env, playerId, week);
}

/**
 * Envía un intento terminado (solo movimientos: sin reintentos ni pistas). Se
 * guarda si mejora tu marca. Devuelve tu partida, cuántos movimientos ha tenido
 * este intento y tu puesto.
 */
export async function finishWeekly(env: Env, playerId: string, week: string, log: unknown) {
  checkWeek(week);
  if (week !== weekKey(dayKey(new Date()))) throw new HttpError(409, 'Esa semana ya ha terminado');
  if (typeof log !== 'string' || log.length === 0 || log.length > MAX_LOG_LENGTH || /[XH]/.test(log)) {
    throw new HttpError(400, 'Registro no válido');
  }
  const run = await selectRun(env, playerId, week);
  if (!run) throw new HttpError(409, 'No has empezado el reto de esta semana');

  const board = await weeklyBoard(env, week);
  let replay;
  try {
    replay = replayRun(parseBoard(board.rows), decodeRun(log));
  } catch (err) {
    throw new HttpError(400, `Registro no válido: ${(err as Error).message}`);
  }
  if (!replay.completed) throw new HttpError(400, 'El registro no completa el reto');
  // Más rápido que las animaciones = enviado con un script, sin jugar.
  if (Date.now() - run.started_at < minPlayTimeMs(replay) * 0.9) {
    throw new HttpError(400, 'Partida demasiado rápida para haberse jugado en el juego');
  }

  const moves = replay.moves;
  const improved = run.best_moves === null || moves < run.best_moves;
  await env.DB.prepare(
    `UPDATE weekly_runs SET attempts = attempts + 1,
       best_at = CASE WHEN best_moves IS NULL OR ?1 < best_moves THEN ?2 ELSE best_at END,
       best_moves = MIN(COALESCE(best_moves, ?1), ?1)
     WHERE player_id = ?3 AND week = ?4`,
  )
    .bind(moves, Date.now(), playerId, week)
    .run();

  const saved = await selectRun(env, playerId, week);
  return {
    run: runResponse(saved, board.optimal),
    attemptMoves: moves,
    attemptOverPar: Math.max(0, moves - board.optimal),
    improved,
    ...(await myPlace(env, playerId, week)),
  };
}

/** Ranking de la semana entre tus amigos: menos movimientos y, a igualdad, quien lo consiguió antes. */
export async function weeklyRanking(env: Env, playerId: string, week: string) {
  checkWeek(week);
  const board = await weeklyBoard(env, week);
  const { results } = await env.DB.prepare(`${FRIENDS_RANKED} ORDER BY pos, p.name LIMIT ?3`)
    .bind(playerId, week, WEEKLY_RANKING_SIZE)
    .all<RankingRow>();
  return {
    optimal: board.optimal,
    total: results.length,
    top: results.map((r) => ({
      id: r.player_id,
      name: r.name ?? 'Anónimo',
      hat: isHatId(r.hat) ? r.hat : null,
      position: r.pos,
      moves: r.best_moves,
      overPar: Math.max(0, r.best_moves - board.optimal),
      isMe: r.player_id === playerId,
      isAuthor: false,
    })),
    me: null,
  };
}
