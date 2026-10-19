// Niveles de la comunidad: listado, publicar, superar, ranking, valorar, me gusta,
// guardar, el destacado, denunciar y borrar.

import { isHatId } from '../../../common/art/hats';
import { BoardError, parseBoard } from '../../../common/logic/engine/board';
import { checkCustomLevel, CUSTOM_LIMITS, decodeRows, encodeRows, movesToFinish } from '../../../common/logic/community/community';
import { isOffensive } from '../../../common/logic/players/offensive';
import { type Env, HttpError, cleanText } from '../http';
import { forget, memo } from '../memo';
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
  likes: number;
  my_like: number;
  my_save: number;
  featured_at: number | null;
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
         EXISTS (SELECT 1 FROM custom_level_reports rp WHERE rp.level_id = l.id AND rp.player_id = ?1) AS my_report,
         (SELECT COUNT(*) FROM custom_level_likes k WHERE k.level_id = l.id) AS likes,
         EXISTS (SELECT 1 FROM custom_level_likes k WHERE k.level_id = l.id AND k.player_id = ?1) AS my_like,
         EXISTS (SELECT 1 FROM custom_level_saves s WHERE s.level_id = l.id AND s.player_id = ?1) AS my_save,
         l.featured_at
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
    author: row.author,
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
    likes: row.likes,
    liked: row.my_like === 1,
    saved: row.my_save === 1,
  };
}

/** El orden de «Mejores» y «Nuevos» es el mismo para todos: se calcula como mucho una vez por minuto. */
const LEVELS_ORDER_TTL_MS = 60_000;

/** Un nivel nuevo o borrado cambia las listas: se vuelven a ordenar. */
export function forgetLevelLists(): void {
  forget('levels:');
}

export async function listCustomLevels(env: Env, playerId: string, sort: string, offset: number) {
  const order = {
    // Media "suavizada" (como si tuviera 2 votos de 3 estrellas): un 5 con un solo voto no gana a un 4,6 con veinte.
    top: '(COALESCE(rating_avg * rating_count, 0) + 6) / (rating_count + 2) DESC, plays DESC, created_at DESC',
    new: 'created_at DESC',
    mine: 'created_at DESC',
    liked: 'created_at DESC',
    saved: 'created_at DESC',
  }[sort];
  if (!order) throw new HttpError(400, 'invalidSort');
  // Los ocultos por denuncias solo los ve su autor (en "Mis niveles").
  const visible = `reports < ${REPORTS_TO_HIDE}`;
  const where = { mine: 'author_id = ?1', liked: `my_like = 1 AND ${visible}`, saved: `my_save = 1 AND ${visible}` }[sort] ?? visible;
  let results: CustomLevelRow[];
  if (sort === 'top' || sort === 'new') {
    // Ordenar exige mirar todos los niveles (notas, partidas, denuncias): se guarda qué niveles
    // van en la página y luego solo se piden esos, con lo de cada jugador (su me gusta, su marca…).
    const ids = await memo(`levels:${sort}:${offset}`, LEVELS_ORDER_TTL_MS, async () => {
      const { results } = await env.DB.prepare(`SELECT id FROM (${CUSTOM_LEVEL_SELECT}) WHERE ${visible} ORDER BY ${order} LIMIT ?2 OFFSET ?3`)
        .bind(null, CUSTOM_PAGE_SIZE + 1, offset)
        .all<{ id: string }>();
      return results.map((r) => r.id);
    });
    results = await levelsById(env, playerId, ids);
    // Si entretanto alguno se ha ocultado o borrado, la página sale con uno menos.
    results = results.filter((r) => r.reports < REPORTS_TO_HIDE);
    return { levels: results.slice(0, CUSTOM_PAGE_SIZE).map((r) => customLevelResponse(r, playerId)), more: ids.length > CUSTOM_PAGE_SIZE };
  }
  ({ results } = await env.DB.prepare(`SELECT * FROM (${CUSTOM_LEVEL_SELECT}) WHERE ${where} ORDER BY ${order} LIMIT ?2 OFFSET ?3`)
    .bind(playerId, CUSTOM_PAGE_SIZE + 1, offset)
    .all<CustomLevelRow>());
  return {
    levels: results.slice(0, CUSTOM_PAGE_SIZE).map((r) => customLevelResponse(r, playerId)),
    more: results.length > CUSTOM_PAGE_SIZE,
  };
}

/** Esos niveles, en ese orden, con lo de quien los mira. */
async function levelsById(env: Env, playerId: string, ids: string[]): Promise<CustomLevelRow[]> {
  if (ids.length === 0) return [];
  const { results } = await env.DB.prepare(`${CUSTOM_LEVEL_SELECT} WHERE l.id IN (${ids.map((_, i) => `?${i + 2}`).join(', ')})`)
    .bind(playerId, ...ids)
    .all<CustomLevelRow>();
  const byId = new Map(results.map((r) => [r.id, r]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** Me gusta (`on`) o lo quita. Cualquiera puede, sin haberlo superado. */
export async function likeCustomLevel(env: Env, playerId: string, id: string, on: unknown) {
  return toggleMark(env, playerId, id, on, 'custom_level_likes');
}

/** Lo guarda para luego (`on`) o lo quita de guardados. Es privado. */
export async function saveCustomLevel(env: Env, playerId: string, id: string, on: unknown) {
  return toggleMark(env, playerId, id, on, 'custom_level_saves');
}

async function toggleMark(env: Env, playerId: string, id: string, on: unknown, table: 'custom_level_likes' | 'custom_level_saves') {
  if (typeof on !== 'boolean') throw new HttpError(400, 'invalidBody');
  await getCustomLevel(env, playerId, id); // Que exista y se pueda ver.
  if (on) await env.DB.prepare(`INSERT OR IGNORE INTO ${table} (level_id, player_id, created_at) VALUES (?, ?, ?)`).bind(id, playerId, Date.now()).run();
  else await env.DB.prepare(`DELETE FROM ${table} WHERE level_id = ? AND player_id = ?`).bind(id, playerId).run();
  return getCustomLevel(env, playerId, id);
}

/** El nivel destacado (el último que eligió el administrador), si lo hay y se puede ver. */
export async function featuredCustomLevel(env: Env, playerId: string) {
  const row = await env.DB.prepare(
    `SELECT * FROM (${CUSTOM_LEVEL_SELECT}) WHERE featured_at IS NOT NULL AND reports < ${REPORTS_TO_HIDE} ORDER BY featured_at DESC LIMIT 1`,
  )
    .bind(playerId)
    .first<CustomLevelRow>();
  return { level: row ? customLevelResponse(row, playerId) : null };
}

export async function getCustomLevel(env: Env, playerId: string, id: string) {
  const row = await env.DB.prepare(`${CUSTOM_LEVEL_SELECT} WHERE l.id = ?2`).bind(playerId, id).first<CustomLevelRow>();
  if (!row) throw new HttpError(404, 'levelNotFound');
  if (row.reports >= REPORTS_TO_HIDE && row.author_id !== playerId) throw new HttpError(404, 'levelHidden');
  return customLevelResponse(row, playerId);
}

/** Denuncia un nivel ajeno. Cada jugador cuenta una vez por nivel. */
export async function reportCustomLevel(env: Env, playerId: string, id: string, reason: unknown) {
  if (typeof reason !== 'string' || !REPORT_REASONS.includes(reason)) throw new HttpError(400, 'invalidReason');
  const level = await env.DB.prepare('SELECT author_id FROM custom_levels WHERE id = ?').bind(id).first<{ author_id: string }>();
  if (!level) throw new HttpError(404, 'levelNotFound');
  if (level.author_id === playerId) throw new HttpError(403, 'cantReportOwn');
  await env.DB.prepare('INSERT OR IGNORE INTO custom_level_reports (level_id, player_id, reason, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, playerId, reason, Date.now())
    .run();
  return { ok: true };
}

/** Publica un nivel. Hay que mandar también cómo lo superó el autor (`log`). */
export async function createCustomLevel(env: Env, playerId: string, input: { name?: unknown; rows?: unknown; log?: unknown }) {
  await requireName(env, playerId);
  const name = cleanText(input.name, CUSTOM_LIMITS.minName, CUSTOM_LIMITS.maxName, 'levelNameLength');
  if (isOffensive(name)) throw new HttpError(400, 'nameOffensive');
  let checked;
  try {
    checked = checkCustomLevel(input.rows);
  } catch (err) {
    // El motivo, traducible: board_size, board_unsolvable…
    throw err instanceof BoardError ? new HttpError(400, `board_${err.code}`, err.params) : new HttpError(400, 'board_invalid');
  }
  const moves = movesToFinish(checked.board, input.log);
  if (moves === null) throw new HttpError(400, 'beatItFirst');

  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM custom_levels WHERE author_id = ?').bind(playerId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_CUSTOM_LEVELS_PER_PLAYER) {
    throw new HttpError(429, 'maxLevels', { n: MAX_CUSTOM_LEVELS_PER_PLAYER });
  }
  const rows = encodeRows(input.rows as string[]);
  const duplicate = await env.DB.prepare('SELECT 1 FROM custom_levels WHERE rows = ?').bind(rows).first();
  if (duplicate) throw new HttpError(409, 'duplicateLevel');

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
    env.DB.prepare('INSERT INTO custom_level_runs (level_id, player_id, best_moves, finished_at, best_at) VALUES (?1, ?2, ?3, ?4, ?4)').bind(id, playerId, moves, now),
  ]);
  forgetLevelLists();
  return getCustomLevel(env, playerId, id);
}

/** Apunta que el jugador ha superado el nivel (se queda con su mejor marca). */
export async function finishCustomLevel(env: Env, playerId: string, id: string, log: unknown) {
  const level = await env.DB.prepare('SELECT rows FROM custom_levels WHERE id = ?').bind(id).first<{ rows: string }>();
  if (!level) throw new HttpError(404, 'levelNotFound');
  const moves = movesToFinish(parseBoard(decodeRows(level.rows)), log);
  if (moves === null) throw new HttpError(400, 'logIncomplete');
  await env.DB.prepare(
    `INSERT INTO custom_level_runs (level_id, player_id, best_moves, finished_at, best_at) VALUES (?1, ?2, ?3, ?4, ?4)
     ON CONFLICT (level_id, player_id) DO UPDATE SET
       best_at = CASE WHEN ?3 < best_moves THEN ?4 ELSE best_at END,
       best_moves = MIN(best_moves, ?3),
       finished_at = ?4`,
  )
    .bind(id, playerId, moves, Date.now())
    .run();
  return getCustomLevel(env, playerId, id);
}

/** Jugadores que se ven en el ranking de un nivel. */
const LEVEL_RANKING_SIZE = 20;

interface LevelRankingRow {
  player_id: string;
  name: string | null;
  hat: string | null;
  best_moves: number;
  pos: number;
}

/**
 * Ranking de un nivel, al estilo golf: menos movimientos y, a igualdad, quien
 * consiguió antes su marca. Los mejores y, si no está entre ellos, tu puesto.
 */
export async function customLevelRanking(env: Env, playerId: string, id: string) {
  const level = await getCustomLevel(env, playerId, id); // Comprueba que existe y se puede ver.
  const ranked = `
    SELECT r.player_id, p.name, p.hat, r.best_moves,
           RANK() OVER (ORDER BY r.best_moves, r.best_at) AS pos
    FROM custom_level_runs r JOIN players p ON p.id = r.player_id
    WHERE r.level_id = ?1`;
  const [{ results: top }, mine, total] = await Promise.all([
    env.DB.prepare(`${ranked} ORDER BY pos, p.name LIMIT ?2`).bind(id, LEVEL_RANKING_SIZE).all<LevelRankingRow>(),
    env.DB.prepare(`SELECT * FROM (${ranked}) WHERE player_id = ?2`).bind(id, playerId).first<LevelRankingRow>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM custom_level_runs WHERE level_id = ?').bind(id).first<{ n: number }>(),
  ]);
  const entry = (r: LevelRankingRow) => ({
    id: r.player_id,
    name: r.name,
    hat: isHatId(r.hat) ? r.hat : null,
    position: r.pos,
    moves: r.best_moves,
    overPar: Math.max(0, r.best_moves - level.optimal),
    isMe: r.player_id === playerId,
    isAuthor: r.player_id === level.authorId,
  });
  return {
    optimal: level.optimal,
    total: total?.n ?? 0,
    top: top.map(entry),
    me: mine ? entry(mine) : null,
  };
}

/** Valora un nivel de 1 a 5. Solo si lo has superado y no es tuyo. */
export async function rateCustomLevel(env: Env, playerId: string, id: string, stars: unknown) {
  if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, 'ratingRange');
  const row = await env.DB.prepare(
    `SELECT l.author_id, r.best_moves FROM custom_levels l
     LEFT JOIN custom_level_runs r ON r.level_id = l.id AND r.player_id = ?1
     WHERE l.id = ?2`,
  )
    .bind(playerId, id)
    .first<{ author_id: string; best_moves: number | null }>();
  if (!row) throw new HttpError(404, 'levelNotFound');
  if (row.author_id === playerId) throw new HttpError(403, 'cantRateOwn');
  if (row.best_moves === null) throw new HttpError(403, 'beatToRate');
  await env.DB.prepare('UPDATE custom_level_runs SET rating = ? WHERE level_id = ? AND player_id = ?').bind(stars, id, playerId).run();
  return getCustomLevel(env, playerId, id);
}

export async function deleteCustomLevel(env: Env, playerId: string, id: string) {
  // D1 cuenta también las partidas que se borran en cascada: basta con que cambie algo.
  forgetLevelLists();
  const result = await env.DB.prepare('DELETE FROM custom_levels WHERE id = ? AND author_id = ?').bind(id, playerId).run();
  if (!result.meta.changes) throw new HttpError(404, 'noSuchOwnLevel');
  return { ok: true };
}
