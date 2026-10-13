// Niveles de la comunidad: listado, publicar, superar, valorar, denunciar y borrar.

import { isHatId } from '../../src/art/hats';
import { parseBoard } from '../../src/logic/engine/board';
import { checkCustomLevel, CUSTOM_LIMITS, decodeRows, encodeRows, movesToFinish } from '../../src/logic/community/community';
import { type Env, HttpError, cleanText } from '../http';
import { requireName } from './players';

/** Niveles de la comunidad que puede tener publicados cada jugador. */
const MAX_CUSTOM_LEVELS_PER_PLAYER = 30;

/** Niveles por página en el listado. */
const CUSTOM_PAGE_SIZE = 20;

/** Denuncias (de jugadores distintos) con las que un nivel deja de verse. */
const REPORTS_TO_HIDE = 3;

const REPORT_REASONS = ['name', 'broken', 'other'];

interface CustomLevelRow {
  id: string;
  name: string;
  rows: string;
  optimal: number;
  elements: string;
  created_at: number;
  author_id: string;
  author: string | null;
  author_hat: string | null;
  plays: number;
  rating_avg: number | null;
  rating_count: number;
  my_best: number | null;
  my_rating: number | null;
  reports: number;
  my_report: number;
}

/** Datos de un nivel con sus totales y lo que ha hecho en él quien lo pide. */
const CUSTOM_LEVEL_SELECT = `
  SELECT l.id, l.name, l.rows, l.optimal, l.elements, l.created_at, l.author_id,
         p.name AS author, p.hat AS author_hat,
         (SELECT COUNT(*) FROM custom_level_runs r WHERE r.level_id = l.id AND r.player_id <> l.author_id) AS plays,
         (SELECT AVG(r.rating) FROM custom_level_runs r WHERE r.level_id = l.id AND r.rating IS NOT NULL) AS rating_avg,
         (SELECT COUNT(r.rating) FROM custom_level_runs r WHERE r.level_id = l.id) AS rating_count,
         me.best_moves AS my_best, me.rating AS my_rating,
         (SELECT COUNT(*) FROM custom_level_reports rp WHERE rp.level_id = l.id) AS reports,
         EXISTS (SELECT 1 FROM custom_level_reports rp WHERE rp.level_id = l.id AND rp.player_id = ?1) AS my_report
  FROM custom_levels l
  JOIN players p ON p.id = l.author_id
  LEFT JOIN custom_level_runs me ON me.level_id = l.id AND me.player_id = ?1`;

function customLevelResponse(row: CustomLevelRow, playerId: string) {
  return {
    id: row.id,
    name: row.name,
    rows: decodeRows(row.rows),
    optimal: row.optimal,
    elements: row.elements ? row.elements.split(',') : [],
    createdAt: row.created_at,
    author: row.author ?? 'Anónimo',
    authorId: row.author_id,
    authorHat: isHatId(row.author_hat) ? row.author_hat : null,
    mine: row.author_id === playerId,
    plays: row.plays,
    rating: row.rating_avg === null ? null : Math.round(row.rating_avg * 10) / 10,
    ratingCount: row.rating_count,
    myBest: row.my_best,
    myRating: row.my_rating,
    /** Oculto por denuncias (solo lo ve su autor). */
    hidden: row.reports >= REPORTS_TO_HIDE,
    reported: row.my_report === 1,
  };
}

export async function listCustomLevels(env: Env, playerId: string, sort: string, offset: number) {
  const order = {
    // Media "suavizada" (como si tuviera 2 votos de 3 estrellas): un 5 con un solo voto no gana a un 4,6 con veinte.
    top: '(COALESCE(rating_avg * rating_count, 0) + 6) / (rating_count + 2) DESC, plays DESC, created_at DESC',
    new: 'created_at DESC',
    mine: 'created_at DESC',
  }[sort];
  if (!order) throw new HttpError(400, 'Orden no válido');
  // Los ocultos por denuncias solo los ve su autor (en "Mis niveles").
  const where = sort === 'mine' ? 'author_id = ?1' : `reports < ${REPORTS_TO_HIDE}`;
  const { results } = await env.DB.prepare(`SELECT * FROM (${CUSTOM_LEVEL_SELECT}) WHERE ${where} ORDER BY ${order} LIMIT ?2 OFFSET ?3`)
    .bind(playerId, CUSTOM_PAGE_SIZE + 1, offset)
    .all<CustomLevelRow>();
  return {
    levels: results.slice(0, CUSTOM_PAGE_SIZE).map((r) => customLevelResponse(r, playerId)),
    more: results.length > CUSTOM_PAGE_SIZE,
  };
}

export async function getCustomLevel(env: Env, playerId: string, id: string) {
  const row = await env.DB.prepare(`${CUSTOM_LEVEL_SELECT} WHERE l.id = ?2`).bind(playerId, id).first<CustomLevelRow>();
  if (!row) throw new HttpError(404, 'Ese nivel ya no existe');
  if (row.reports >= REPORTS_TO_HIDE && row.author_id !== playerId) throw new HttpError(404, 'Este nivel se ha ocultado por denuncias');
  return customLevelResponse(row, playerId);
}

/** Denuncia un nivel ajeno. Cada jugador cuenta una vez por nivel. */
export async function reportCustomLevel(env: Env, playerId: string, id: string, reason: unknown) {
  if (typeof reason !== 'string' || !REPORT_REASONS.includes(reason)) throw new HttpError(400, 'Motivo no válido');
  const level = await env.DB.prepare('SELECT author_id FROM custom_levels WHERE id = ?').bind(id).first<{ author_id: string }>();
  if (!level) throw new HttpError(404, 'Ese nivel ya no existe');
  if (level.author_id === playerId) throw new HttpError(403, 'No puedes denunciar tus propios niveles');
  await env.DB.prepare('INSERT OR IGNORE INTO custom_level_reports (level_id, player_id, reason, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, playerId, reason, Date.now())
    .run();
  return { ok: true };
}

/** Publica un nivel. Hay que mandar también cómo lo superó el autor (`log`). */
export async function createCustomLevel(env: Env, playerId: string, input: { name?: unknown; rows?: unknown; log?: unknown }) {
  await requireName(env, playerId);
  const name = cleanText(input.name, CUSTOM_LIMITS.minName, CUSTOM_LIMITS.maxName, 'El nombre del nivel');
  let checked;
  try {
    checked = checkCustomLevel(input.rows);
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
  const moves = movesToFinish(checked.board, input.log);
  if (moves === null) throw new HttpError(400, 'Antes de publicarlo tienes que superarlo tú');

  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM custom_levels WHERE author_id = ?').bind(playerId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_CUSTOM_LEVELS_PER_PLAYER) {
    throw new HttpError(429, `Ya has publicado ${MAX_CUSTOM_LEVELS_PER_PLAYER} niveles, que es el máximo. Borra alguno para publicar otro.`);
  }
  const rows = encodeRows(input.rows as string[]);
  const duplicate = await env.DB.prepare('SELECT 1 FROM custom_levels WHERE rows = ?').bind(rows).first();
  if (duplicate) throw new HttpError(409, 'Ya hay un nivel publicado exactamente igual');

  const id = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO custom_levels (id, author_id, name, rows, optimal, elements, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(
      id,
      playerId,
      name,
      rows,
      checked.solution.length,
      checked.elements.join(','),
      now,
    ),
    env.DB.prepare('INSERT INTO custom_level_runs (level_id, player_id, best_moves, finished_at) VALUES (?, ?, ?, ?)').bind(id, playerId, moves, now),
  ]);
  return getCustomLevel(env, playerId, id);
}

/** Apunta que el jugador ha superado el nivel (se queda con su mejor marca). */
export async function finishCustomLevel(env: Env, playerId: string, id: string, log: unknown) {
  const level = await env.DB.prepare('SELECT rows FROM custom_levels WHERE id = ?').bind(id).first<{ rows: string }>();
  if (!level) throw new HttpError(404, 'Ese nivel ya no existe');
  const moves = movesToFinish(parseBoard(decodeRows(level.rows)), log);
  if (moves === null) throw new HttpError(400, 'El registro no completa el nivel');
  await env.DB.prepare(
    `INSERT INTO custom_level_runs (level_id, player_id, best_moves, finished_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (level_id, player_id) DO UPDATE SET best_moves = MIN(best_moves, ?3), finished_at = ?4`,
  )
    .bind(id, playerId, moves, Date.now())
    .run();
  return getCustomLevel(env, playerId, id);
}

/** Valora un nivel de 1 a 5. Solo si lo has superado y no es tuyo. */
export async function rateCustomLevel(env: Env, playerId: string, id: string, stars: unknown) {
  if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, 'La valoración va de 1 a 5');
  const row = await env.DB.prepare(
    `SELECT l.author_id, r.best_moves FROM custom_levels l
     LEFT JOIN custom_level_runs r ON r.level_id = l.id AND r.player_id = ?1
     WHERE l.id = ?2`,
  )
    .bind(playerId, id)
    .first<{ author_id: string; best_moves: number | null }>();
  if (!row) throw new HttpError(404, 'Ese nivel ya no existe');
  if (row.author_id === playerId) throw new HttpError(403, 'No puedes valorar tus propios niveles');
  if (row.best_moves === null) throw new HttpError(403, 'Supera el nivel para poder valorarlo');
  await env.DB.prepare('UPDATE custom_level_runs SET rating = ? WHERE level_id = ? AND player_id = ?').bind(stars, id, playerId).run();
  return getCustomLevel(env, playerId, id);
}

export async function deleteCustomLevel(env: Env, playerId: string, id: string) {
  // D1 cuenta también las partidas que se borran en cascada: basta con que cambie algo.
  const result = await env.DB.prepare('DELETE FROM custom_levels WHERE id = ? AND author_id = ?').bind(id, playerId).run();
  if (!result.meta.changes) throw new HttpError(404, 'No tienes ningún nivel con ese id');
  return { ok: true };
}
