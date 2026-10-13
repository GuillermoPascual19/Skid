// Reto diario: empezar, consultar y terminar (el servidor reproduce la partida para verificarla).

import { dailyLevel, dayKey, decodeRun, minPlayTimeMs, replayRun } from '../../src/logic/daily/daily';
import { streaks } from '../../src/logic/daily/streaks';
import { dailyScore } from '../../src/logic/daily/score';
import { type Env, HttpError } from '../http';

const MAX_LOG_LENGTH = 5000;

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

export async function getRun(env: Env, playerId: string, day: string) {
  return { run: runResponse(await selectRun(env, playerId, day)) };
}

/** Empieza el reto de hoy; el cronómetro arranca aquí. Si ya existía, lo devuelve tal cual. */
export async function startRun(env: Env, playerId: string, day: string) {
  if (day !== dayKey(new Date())) throw new HttpError(400, 'Solo se puede jugar el reto de hoy');
  await env.DB.prepare('INSERT OR IGNORE INTO daily_runs (player_id, day, started_at) VALUES (?, ?, ?)')
    .bind(playerId, day, Date.now())
    .run();
  return { run: runResponse(await selectRun(env, playerId, day)) };
}

export async function finishRun(env: Env, playerId: string, day: string, log: unknown) {
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
  const streak = streaks(
    played.map((r) => r.day),
    day,
  );

  return {
    moves: replay.moves,
    retries: replay.retries,
    hints: replay.hints,
    timeMs,
    optimal,
    score,
    streak: streak.current,
    freezes: streak.freezes,
    freezeEarned: streak.lastFreezeEarned === day,
  };
}
