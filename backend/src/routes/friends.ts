// Amigos directos: se añaden con tu enlace de amigo (al momento) o por nombre
// (con una solicitud que el otro acepta). Para todo lo demás, ser amigos es lo
// mismo que compartir liga (ver areFriends y CIRCLE).

import { dailyLevel, dayKey } from '../../../common/logic/daily/daily';
import { nameKey } from '../../../common/logic/players/names';
import { isHatId } from '../../../common/art/hats';
import { type Env, HttpError } from '../http';
import { requireName } from './players';

/** Amigos directos como mucho por jugador. */
export const MAX_FRIENDS = 100;
/** Solicitudes enviadas sin contestar como mucho. */
const MAX_PENDING = 20;

/**
 * Tu círculo: quienes comparten alguna liga contigo y tus amigos directos (sin
 * ti). Es una subconsulta con tu id en ?1, para los rankings y la lista de amigos.
 */
export const CIRCLE = `
  SELECT b.player_id FROM league_members a JOIN league_members b ON b.league_id = a.league_id WHERE a.player_id = ?1 AND b.player_id <> ?1
  UNION SELECT player_b FROM friendships WHERE player_a = ?1
  UNION SELECT player_a FROM friendships WHERE player_b = ?1`;

/** El par ordenado con el que se guarda una amistad. */
function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** ¿Son amigos (directos o de alguna liga)? */
export async function areFriends(env: Env, a: string, b: string): Promise<boolean> {
  const [x, y] = pair(a, b);
  return !!(await env.DB.prepare(
    `SELECT 1 FROM friendships WHERE player_a = ?1 AND player_b = ?2
     UNION ALL
     SELECT 1 FROM league_members m JOIN league_members n ON n.league_id = m.league_id AND n.player_id = ?2 WHERE m.player_id = ?1
     LIMIT 1`,
  )
    .bind(x, y)
    .first());
}

async function directFriends(env: Env, a: string, b: string): Promise<boolean> {
  const [x, y] = pair(a, b);
  return !!(await env.DB.prepare('SELECT 1 FROM friendships WHERE player_a = ? AND player_b = ?').bind(x, y).first());
}

async function friendCount(env: Env, playerId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM friendships WHERE player_a = ?1 OR player_b = ?1').bind(playerId).first<{ n: number }>();
  return row?.n ?? 0;
}

/** Hace amigos a los dos (y borra las solicitudes que hubiera entre ellos). */
async function befriend(env: Env, a: string, b: string): Promise<void> {
  if ((await friendCount(env, a)) >= MAX_FRIENDS || (await friendCount(env, b)) >= MAX_FRIENDS) throw new HttpError(409, 'tooManyFriends', { n: MAX_FRIENDS });
  const [x, y] = pair(a, b);
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO friendships (player_a, player_b, created_at) VALUES (?, ?, ?)').bind(x, y, Date.now()),
    env.DB.prepare('DELETE FROM friend_requests WHERE (from_id = ?1 AND to_id = ?2) OR (from_id = ?2 AND to_id = ?1)').bind(a, b),
  ]);
}

interface PlayerRow {
  id: string;
  name: string | null;
  hat: string | null;
}

const publicPlayer = (p: PlayerRow) => ({ id: p.id, name: p.name, hat: isHatId(p.hat) ? p.hat : null });

/** Tu pantalla de amigos: tus amigos directos con su reto de hoy, y las solicitudes. */
export async function friendsOverview(env: Env, playerId: string) {
  const today = dayKey(new Date());
  const [friends, incoming, outgoing] = await env.DB.batch([
    env.DB.prepare(
      `SELECT p.id, p.name, p.hat, r.finished_at, r.started_at, r.over_par, r.score
       FROM (SELECT player_b AS id FROM friendships WHERE player_a = ?1 UNION SELECT player_a FROM friendships WHERE player_b = ?1) f
       JOIN players p ON p.id = f.id
       LEFT JOIN daily_runs r ON r.player_id = p.id AND r.day = ?2
       ORDER BY p.name COLLATE NOCASE`,
    ).bind(playerId, today),
    env.DB.prepare('SELECT p.id, p.name, p.hat FROM friend_requests q JOIN players p ON p.id = q.from_id WHERE q.to_id = ? ORDER BY q.created_at DESC').bind(playerId),
    env.DB.prepare('SELECT p.id, p.name, p.hat FROM friend_requests q JOIN players p ON p.id = q.to_id WHERE q.from_id = ? ORDER BY q.created_at DESC').bind(playerId),
  ]);
  type FriendRow = PlayerRow & { finished_at: number | null; started_at: number | null; over_par: number | null; score: number | null };
  const optimal = dailyLevel(today).solution.length;
  return {
    /** Para tu enlace de amigo. */
    me: playerId,
    day: today,
    friends: (friends.results as FriendRow[]).map((f) => ({
      ...publicPlayer(f),
      today: f.finished_at !== null ? { status: 'finished' as const, moves: f.over_par !== null ? optimal + f.over_par : null } : { status: f.started_at !== null ? ('playing' as const) : ('none' as const), moves: null },
    })),
    incoming: (incoming.results as PlayerRow[]).map(publicPlayer),
    outgoing: (outgoing.results as PlayerRow[]).map(publicPlayer),
  };
}

/** Solicitud por nombre exacto (sin tildes ni mayúsculas). Si él ya te la había mandado, sois amigos al momento. */
export async function requestFriend(env: Env, playerId: string, name: unknown) {
  await requireName(env, playerId);
  if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'playerNotFound');
  const target = await env.DB.prepare('SELECT id, name FROM players WHERE name_key = ?').bind(nameKey(name.trim())).first<{ id: string; name: string }>();
  if (!target) throw new HttpError(404, 'playerNotFound');
  if (target.id === playerId) throw new HttpError(400, 'cantFriendYourself');
  if (await directFriends(env, playerId, target.id)) throw new HttpError(409, 'alreadyFriends');

  const theirs = await env.DB.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').bind(target.id, playerId).first();
  if (theirs) {
    await befriend(env, playerId, target.id);
    return { status: 'friends' as const, name: target.name };
  }
  const pending = await env.DB.prepare('SELECT COUNT(*) AS n FROM friend_requests WHERE from_id = ?').bind(playerId).first<{ n: number }>();
  if ((pending?.n ?? 0) >= MAX_PENDING) throw new HttpError(429, 'tooManyRequests');
  await env.DB.prepare('INSERT OR IGNORE INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)').bind(playerId, target.id, Date.now()).run();
  return { status: 'sent' as const, name: target.name };
}

export async function acceptFriend(env: Env, playerId: string, fromId: string) {
  const request = await env.DB.prepare('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').bind(fromId, playerId).first();
  if (!request) throw new HttpError(404, 'requestNotFound');
  await befriend(env, playerId, fromId);
  return { ok: true };
}

/** Rechaza una solicitud recibida o cancela una enviada. */
export async function dropRequest(env: Env, playerId: string, otherId: string) {
  await env.DB.prepare('DELETE FROM friend_requests WHERE (from_id = ?1 AND to_id = ?2) OR (from_id = ?2 AND to_id = ?1)').bind(playerId, otherId).run();
  return { ok: true };
}

export async function removeFriend(env: Env, playerId: string, otherId: string) {
  const [x, y] = pair(playerId, otherId);
  await env.DB.prepare('DELETE FROM friendships WHERE player_a = ? AND player_b = ?').bind(x, y).run();
  return { ok: true };
}

/** Quién hay detrás de un enlace de amigo (para confirmar antes de añadirlo). */
export async function friendLink(env: Env, playerId: string, targetId: string) {
  const target = await env.DB.prepare('SELECT id, name, hat FROM players WHERE id = ? AND name IS NOT NULL').bind(targetId).first<PlayerRow>();
  if (!target) throw new HttpError(404, 'playerNotFound');
  return { ...publicPlayer(target), isMe: target.id === playerId, already: target.id !== playerId && (await directFriends(env, playerId, target.id)) };
}

/** Con el enlace de amigo no hace falta solicitud: quien lo comparte ya ha dado su permiso. */
export async function addByLink(env: Env, playerId: string, targetId: string) {
  await requireName(env, playerId);
  const target = await env.DB.prepare('SELECT id, name FROM players WHERE id = ? AND name IS NOT NULL').bind(targetId).first<{ id: string; name: string }>();
  if (!target) throw new HttpError(404, 'playerNotFound');
  if (target.id === playerId) throw new HttpError(400, 'cantFriendYourself');
  await befriend(env, playerId, target.id);
  return { name: target.name };
}
