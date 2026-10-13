// Reto diario: empezar, consultar, terminar y mejorar (el servidor reproduce la partida para verificarla).

import { dailyLevel, dayKey, decodeRun, minPlayTimeMs, replayRun } from '../../../common/logic/daily/daily';
import { streaks } from '../../../common/logic/daily/streaks';
import { golfPoints, overPar } from '../../../common/logic/daily/score';
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
  over_par: number | null;
  log: string | null;
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
    overPar: row.over_par,
    // El registro enviado: para seguir mejorando desde otro dispositivo.
    log: row.finished_at !== null ? row.log : null,
  };
}

function selectRun(env: Env, playerId: string, day: string): Promise<RunRow | null> {
  return env.DB.prepare(
    'SELECT started_at, finished_at, moves, retries, hints, time_ms, score, over_par, log FROM daily_runs WHERE player_id = ? AND day = ?',
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

/**
 * Envía la partida al terminar un intento. El primer envío completa el reto (y
 * cuenta para la racha); los siguientes, el mismo día, solo pueden mejorarlo:
 * el registro tiene que continuar el ya enviado y se guarda el mejor intento,
 * con el tiempo hasta este envío.
 */
export async function finishRun(env: Env, playerId: string, day: string, log: unknown) {
  if (typeof log !== 'string' || log.length > MAX_LOG_LENGTH) throw new HttpError(400, 'Registro no válido');
  const run = await selectRun(env, playerId, day);
  if (!run) throw new HttpError(409, 'No has empezado el reto de ese día');
  const improving = run.finished_at !== null;
  if (improving) {
    if (run.over_par === null) throw new HttpError(409, 'Ya completaste este reto');
    if (day !== dayKey(new Date())) throw new HttpError(409, 'Solo se puede mejorar el reto de hoy');
    if (!log.startsWith(run.log ?? '')) throw new HttpError(409, 'La partida ha cambiado en otro dispositivo; vuelve a abrir el reto');
  }

  const level = dailyLevel(day);
  let replay;
  try {
    replay = replayRun(level.board, decodeRun(log));
  } catch (err) {
    throw new HttpError(400, `Registro no válido: ${(err as Error).message}`);
  }
  if (!replay.best) throw new HttpError(400, 'El registro no completa el reto');

  const finishedAt = Date.now();
  const timeMs = finishedAt - run.started_at;
  // Jugando de verdad no se puede terminar antes de que acaben las animaciones
  // (con un 10 % de margen). Más rápido = enviado con un script, sin jugar.
  if (timeMs < minPlayTimeMs(replay) * 0.9) {
    throw new HttpError(400, 'Partida demasiado rápida para haberse jugado en el juego');
  }
  const optimal = level.solution.length;
  // El mejor intento de todo el registro: si uno bueno no llegó a enviarse (se
  // cerró la página), cuenta igual en el envío siguiente.
  const attempt = replay.best;
  const bestOverPar = overPar(attempt.strokes, optimal);
  const attemptOverPar = overPar((replay.last ?? attempt).strokes, optimal);
  const improved = !improving || bestOverPar < run.over_par!;

  // Las condiciones del WHERE evitan que dos envíos simultáneos escriban los dos.
  const update = improved
    ? env.DB.prepare(
        `UPDATE daily_runs SET finished_at = COALESCE(finished_at, ?1), moves = ?2, retries = ?3, hints = ?4, time_ms = ?5,
           score = ?6, over_par = ?7, log = ?8
         WHERE player_id = ?9 AND day = ?10 AND ${improving ? 'log = ?11' : 'finished_at IS NULL'}`,
      ).bind(
        finishedAt,
        attempt.moves,
        replay.retries,
        attempt.hints,
        timeMs,
        golfPoints(bestOverPar),
        bestOverPar,
        log,
        playerId,
        day,
        ...(improving ? [run.log] : []),
      )
    : // Sin mejora: solo se guarda el registro, para que el siguiente intento lo continúe.
      env.DB.prepare('UPDATE daily_runs SET retries = ?, log = ? WHERE player_id = ? AND day = ? AND log = ?').bind(
        replay.retries,
        log,
        playerId,
        day,
        run.log,
      );
  if (!(await update.run()).meta.changes) {
    throw new HttpError(409, improving ? 'La partida ha cambiado en otro dispositivo; vuelve a abrir el reto' : 'Ya completaste este reto');
  }

  const { results: played } = await env.DB.prepare('SELECT day FROM daily_runs WHERE player_id = ? AND finished_at IS NOT NULL')
    .bind(playerId)
    .all<{ day: string }>();
  const streak = streaks(
    played.map((r) => r.day),
    day,
  );
  const best = improved
    ? { moves: attempt.moves, hints: attempt.hints, timeMs, overPar: bestOverPar }
    : { moves: run.moves!, hints: run.hints, timeMs: run.time_ms!, overPar: run.over_par! };

  return {
    ...best,
    retries: replay.retries,
    optimal,
    score: golfPoints(best.overPar),
    // Resultado del intento que se acaba de enviar (puede ser peor que el mejor).
    attemptOverPar,
    improved,
    streak: streak.current,
    freezes: streak.freezes,
    freezeEarned: !improving && streak.lastFreezeEarned === day,
  };
}
