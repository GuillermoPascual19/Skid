// Panel de administración: cifras, niveles (denunciados o cualquiera) y nombres
// de jugadores. Solo para las cuentas de Google del secreto ADMIN_GOOGLE_SUBS
// (sus identificadores «sub», separados por comas). Cada acción queda en los
// logs del Worker (event = adminAction).

import { dayKey } from '../../../common/logic/daily/daily';
import { decodeRows } from '../../../common/logic/community/community';
import { type Env, HttpError } from '../http';

/** Filas por página en los listados. */
const PAGE = 30;
/** Denuncias con las que un nivel se oculta (lo mismo que en routes/levels.ts). */
const REPORTS_TO_HIDE = 3;

/** ¿Es administrador? Su cuenta de Google tiene que estar en ADMIN_GOOGLE_SUBS. */
export async function isAdmin(env: Env, playerId: string): Promise<boolean> {
  const subs = (env.ADMIN_GOOGLE_SUBS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (subs.length === 0) return false;
  const row = await env.DB.prepare('SELECT google_sub FROM players WHERE id = ?').bind(playerId).first<{ google_sub: string | null }>();
  return !!row?.google_sub && subs.includes(row.google_sub);
}

async function requireAdmin(env: Env, playerId: string): Promise<void> {
  if (!(await isAdmin(env, playerId))) throw new HttpError(403, 'adminOnly');
}

function audit(playerId: string, action: string, target: string, detail: Record<string, unknown> = {}): void {
  console.log({ event: 'adminAction', action, target, by: playerId, ...detail });
}

/** Texto de búsqueda para LIKE, con % y _ escapados. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function searchText(value: string | null): string {
  return (value ?? '').trim().slice(0, 40);
}

/** Cifras rápidas del juego. */
export async function adminSummary(env: Env, playerId: string) {
  await requireAdmin(env, playerId);
  const today = dayKey(new Date());
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const rows = await env.DB.batch([
    env.DB.prepare(
      `SELECT COUNT(*) AS total, COUNT(name) AS named, COUNT(google_sub) AS google,
              SUM(created_at >= datetime('now', '-1 day')) AS newToday
       FROM players`,
    ),
    env.DB.prepare('SELECT COUNT(*) AS runs, COUNT(DISTINCT player_id) AS players FROM daily_runs WHERE day = ? AND finished_at IS NOT NULL').bind(today),
    env.DB.prepare(
      `SELECT COUNT(*) AS total,
              SUM(reports > 0) AS reported,
              SUM(reports >= ${REPORTS_TO_HIDE}) AS hidden
       FROM (SELECT l.id, (SELECT COUNT(*) FROM custom_level_reports r WHERE r.level_id = l.id) AS reports FROM custom_levels l)`,
    ),
    env.DB.prepare('SELECT COUNT(*) AS n FROM duels WHERE created_at >= ?').bind(weekAgo),
    env.DB.prepare('SELECT COUNT(DISTINCT player_id) AS n FROM push_subscriptions'),
  ]);
  const first = <T>(i: number) => rows[i].results[0] as T;
  const players = first<{ total: number; named: number; google: number; newToday: number | null }>(0);
  const daily = first<{ runs: number; players: number }>(1);
  const levels = first<{ total: number; reported: number | null; hidden: number | null }>(2);
  return {
    players: { total: players.total, named: players.named, google: players.google, newToday: players.newToday ?? 0 },
    daily: { day: today, finished: daily.runs },
    levels: { total: levels.total, reported: levels.reported ?? 0, hidden: levels.hidden ?? 0 },
    duelsLastWeek: first<{ n: number }>(3).n,
    pushPlayers: first<{ n: number }>(4).n,
  };
}

interface AdminLevelRow {
  id: string;
  name: string;
  rows: string;
  optimal: number;
  created_at: number;
  author_id: string;
  author: string | null;
  reports: number;
  reasons: string | null;
  plays: number;
}

/** Niveles: los denunciados (más denuncias primero) o todos (más nuevos primero), con búsqueda por nombre o autor. */
export async function adminLevels(env: Env, playerId: string, filter: string | null, query: string | null, offset: number) {
  await requireAdmin(env, playerId);
  const reported = filter === 'reported';
  const q = searchText(query);
  const { results } = await env.DB.prepare(
    `SELECT * FROM (
       SELECT l.id, l.name, l.rows, l.optimal, l.created_at, l.author_id, p.name AS author,
              (SELECT COUNT(*) FROM custom_level_reports r WHERE r.level_id = l.id) AS reports,
              (SELECT GROUP_CONCAT(reason) FROM custom_level_reports r WHERE r.level_id = l.id) AS reasons,
              (SELECT COUNT(*) FROM custom_level_runs r WHERE r.level_id = l.id AND r.player_id <> l.author_id) AS plays
       FROM custom_levels l LEFT JOIN players p ON p.id = l.author_id
       WHERE ?1 = '' OR l.name LIKE ?2 ESCAPE '\\' OR p.name LIKE ?2 ESCAPE '\\'
     )
     WHERE ?3 = 0 OR reports > 0
     ORDER BY ${reported ? 'reports DESC, created_at DESC' : 'created_at DESC'}
     LIMIT ?4 OFFSET ?5`,
  )
    .bind(q, likePattern(q), reported ? 1 : 0, PAGE + 1, Math.max(0, offset))
    .all<AdminLevelRow>();
  return {
    levels: results.slice(0, PAGE).map((l) => {
      const reasons: Record<string, number> = {};
      for (const reason of l.reasons?.split(',') ?? []) reasons[reason] = (reasons[reason] ?? 0) + 1;
      return {
        id: l.id,
        name: l.name,
        rows: decodeRows(l.rows),
        optimal: l.optimal,
        createdAt: l.created_at,
        authorId: l.author_id,
        author: l.author,
        reports: l.reports,
        reasons,
        hidden: l.reports >= REPORTS_TO_HIDE,
        plays: l.plays,
      };
    }),
    more: results.length > PAGE,
  };
}

export async function adminDeleteLevel(env: Env, playerId: string, levelId: string) {
  await requireAdmin(env, playerId);
  const level = await env.DB.prepare('SELECT name, author_id FROM custom_levels WHERE id = ?').bind(levelId).first<{ name: string; author_id: string }>();
  if (!level) throw new HttpError(404, 'levelNotFound');
  // Las partidas, valoraciones y denuncias se borran en cascada.
  await env.DB.prepare('DELETE FROM custom_levels WHERE id = ?').bind(levelId).run();
  audit(playerId, 'deleteLevel', levelId, { name: level.name, author: level.author_id });
  return { ok: true };
}

/** Quita las denuncias de un nivel: vuelve a verse si estaba oculto. */
export async function adminClearReports(env: Env, playerId: string, levelId: string) {
  await requireAdmin(env, playerId);
  const { meta } = await env.DB.prepare('DELETE FROM custom_level_reports WHERE level_id = ?').bind(levelId).run();
  audit(playerId, 'clearReports', levelId, { removed: meta.changes });
  return { ok: true };
}

interface AdminPlayerRow {
  id: string;
  name: string | null;
  created_at: string;
  google: number;
  levels: number;
  last_daily: string | null;
}

/** Jugadores con nombre: los que coinciden con la búsqueda o, sin ella, los más nuevos. */
export async function adminPlayers(env: Env, playerId: string, query: string | null) {
  await requireAdmin(env, playerId);
  const q = searchText(query);
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.name, p.created_at, p.google_sub IS NOT NULL AS google,
            (SELECT COUNT(*) FROM custom_levels l WHERE l.author_id = p.id) AS levels,
            (SELECT MAX(day) FROM daily_runs r WHERE r.player_id = p.id) AS last_daily
     FROM players p
     WHERE p.name IS NOT NULL AND (?1 = '' OR p.name LIKE ?2 ESCAPE '\\')
     ORDER BY ${q ? 'p.name' : 'p.created_at DESC'}
     LIMIT ?3`,
  )
    .bind(q, likePattern(q), PAGE)
    .all<AdminPlayerRow>();
  return {
    players: results.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.created_at,
      google: p.google === 1,
      levels: p.levels,
      lastDaily: p.last_daily,
    })),
  };
}

/** Le quita el nombre a un jugador: el juego le pedirá otro la próxima vez que lo necesite. */
export async function adminResetName(env: Env, playerId: string, targetId: string) {
  await requireAdmin(env, playerId);
  const player = await env.DB.prepare('SELECT name FROM players WHERE id = ?').bind(targetId).first<{ name: string | null }>();
  if (!player) throw new HttpError(404, 'playerNotFound');
  await env.DB.prepare('UPDATE players SET name = NULL, name_key = NULL WHERE id = ?').bind(targetId).run();
  audit(playerId, 'resetName', targetId, { name: player.name });
  return { ok: true };
}
