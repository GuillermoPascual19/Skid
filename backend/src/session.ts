// Sesiones anónimas por token (caducan tras un año sin usarse), login con Google (varias
// sesiones por jugador), cerrar sesión en todos los dispositivos y borrar la cuenta.

import { dayKey } from '../../common/logic/daily/daily';
import { isSealed, seal } from './seal';
import { GOOGLE_CERTS_URL, googleKeyProvider, InvalidTokenError, verifyGoogleIdToken } from './google';
import { type Env, HttpError, type Session } from './http';
import { verifyTurnstile } from './turnstile';
import { forgetAll } from './memo';

/** Cuentas nuevas por IP y día (alto a propósito: en una universidad muchos comparten IP). */
const MAX_SESSIONS_PER_IP_PER_DAY = 20;

/** Una sesión que lleva un año sin usarse caduca: un token olvidado o robado no sirve para siempre. */
const SESSION_MAX_IDLE_MS = 365 * 86_400_000;
/** El último uso se apunta como mucho una vez al día (para no escribir en cada petición). */
const SESSION_TOUCH_MS = 86_400_000;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * La sesión va en una cookie HttpOnly: el código de la página no puede leerla, así
 * que un script inyectado no puede robarla. SameSite=Strict: no viaja en peticiones
 * desde otras webs. En producción lleva el prefijo __Host- (solo HTTPS, sin dominio).
 */
function cookieName(url: URL): string {
  return url.protocol === 'https:' ? '__Host-skid' : 'skid';
}

/** Cabecera Set-Cookie con la sesión, o para borrarla (token null). */
export function sessionCookie(url: URL, token: string | null): string {
  const parts = [`${cookieName(url)}=${token ?? ''}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${token ? SESSION_MAX_IDLE_MS / 1000 : 0}`];
  if (url.protocol === 'https:') parts.push('Secure');
  return parts.join('; ');
}

function cookieToken(req: Request, url: URL): string | null {
  const name = cookieName(url);
  for (const part of (req.headers.get('Cookie') ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name && value.length) return value.join('=') || null;
  }
  return null;
}

export async function createSession(req: Request, env: Env, turnstile: unknown): Promise<{ token: string }> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'desconocida';
  // Solo se guarda el hash, y con el día dentro: no sirve para seguir a una IP de un día a otro
  // (y la tabla se vacía a diario).
  const day = dayKey(new Date());
  const ipHash = await sha256(`skid-ip:${day}:${ip}`);

  // Ráfagas: el limitador de Cloudflare, en memoria (no gasta base de datos).
  const { success } = await env.SESSION_RATE_LIMITER.limit({ key: ipHash });
  if (!success) throw new HttpError(429, 'tooManyNewAccounts');
  // Que sea una persona y no un script (antes de gastar nada en la base de datos).
  await verifyTurnstile(env, turnstile, ip);

  // Total diario, en D1. Los días anteriores se borran sobre la marcha.
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
    throw new HttpError(429, 'tooManyAccountsToday');
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO players (id, token_hash) VALUES (?, ?)').bind(id, tokenHash),
    env.DB.prepare('INSERT INTO sessions (token_hash, player_id, last_used_at) VALUES (?, ?, ?)').bind(tokenHash, id, Date.now()),
  ]);
  return { token };
}

export async function authenticate(req: Request, url: URL, env: Env): Promise<Session> {
  // La cookie; o, de los juegos de antes, la cabecera con el token que guardaban en el navegador
  // (la respuesta les pone la cookie y el juego lo borra de allí).
  const fromCookie = cookieToken(req, url);
  const token = fromCookie ?? req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, 'noSession');
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare('SELECT player_id, last_used_at FROM sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ player_id: string; last_used_at: number | null }>();
  if (!row) throw new HttpError(401, 'invalidSession');
  const now = Date.now();
  const lastUsed = row.last_used_at ?? 0;
  if (now - lastUsed > SESSION_MAX_IDLE_MS) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    throw new HttpError(401, 'sessionExpired');
  }
  const touch = now - lastUsed > SESSION_TOUCH_MS;
  if (touch) {
    await env.DB.prepare('UPDATE sessions SET last_used_at = ? WHERE token_hash = ?').bind(now, tokenHash).run();
  }
  // Al usarla tras un día, la cookie se renueva: caduca a la vez que la sesión.
  return { playerId: row.player_id, tokenHash, token, renew: !fromCookie || touch };
}

let googleKeys: ReturnType<typeof googleKeyProvider> | null = null;

/**
 * De dónde se descargan las claves de Google. GOOGLE_CERTS_URL es solo para
 * pruebas en local: se ignora si no apunta a esta máquina, para que una
 * configuración equivocada no permita firmar tokens con otras claves.
 */
function certsUrl(env: Env): string {
  const override = env.GOOGLE_CERTS_URL;
  if (override && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(override)) return override;
  return GOOGLE_CERTS_URL;
}

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
export async function googleLogin(env: Env, session: Session, credential: unknown): Promise<GoogleLoginResult> {
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(503, 'googleNotConfigured');
  if (typeof credential !== 'string' || credential.length > 4096) throw new HttpError(400, 'invalidCredential');

  googleKeys ??= googleKeyProvider(certsUrl(env));
  let claims;
  try {
    claims = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID, googleKeys);
  } catch (err) {
    // 400 y no 401: un 401 haría que el cliente tirase su sesión.
    if (err instanceof InvalidTokenError) throw new HttpError(400, 'googleUnverified');
    throw err;
  }
  const email = claims.email_verified === false ? null : (claims.email ?? null);
  // En la base de datos va cifrado; sin clave, no se guarda (nunca en claro).
  const storedEmail = email && env.EMAIL_KEY ? await seal(env.EMAIL_KEY, email) : null;

  const linked = await env.DB.prepare('SELECT id, name FROM players WHERE google_sub = ?')
    .bind(claims.sub)
    .first<{ id: string; name: string | null }>();

  if (linked?.id === session.playerId) {
    await env.DB.prepare('UPDATE players SET email = ? WHERE id = ?').bind(storedEmail, linked.id).run();
    return { token: null, switched: false, name: linked.name, email };
  }

  if (linked) return switchDevice(env, session, linked.id, linked.name, email, storedEmail);

  const current = await env.DB.prepare('SELECT name, google_sub FROM players WHERE id = ?')
    .bind(session.playerId)
    .first<{ name: string | null; google_sub: string | null }>();
  if (current?.google_sub) {
    // El jugador de este dispositivo es de otra cuenta de Google: jugador nuevo.
    const id = crypto.randomUUID();
    const token = randomToken();
    const tokenHash = await sha256(token);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO players (id, token_hash, google_sub, email) VALUES (?, ?, ?, ?)').bind(id, tokenHash, claims.sub, storedEmail),
      env.DB.prepare('INSERT INTO sessions (token_hash, player_id, last_used_at) VALUES (?, ?, ?)').bind(tokenHash, id, Date.now()),
      env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash),
    ]);
    return { token, switched: true, name: null, email };
  }

  // Primera vez con esta cuenta: se vincula al jugador actual.
  await env.DB.prepare('UPDATE players SET google_sub = ?, email = ? WHERE id = ? AND google_sub IS NULL')
    .bind(claims.sub, storedEmail, session.playerId)
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
  storedEmail: string | null,
): Promise<GoogleLoginResult> {
  const token = randomToken();
  const tokenHash = await sha256(token);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, player_id, last_used_at) VALUES (?, ?, ?)').bind(tokenHash, playerId, Date.now()),
    env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash),
    env.DB.prepare('UPDATE players SET email = ? WHERE id = ?').bind(storedEmail, playerId),
  ]);
  return { token, switched: true, name, email };
}

/**
 * Cierra la sesión en todos los dispositivos del jugador (también en este). Solo
 * con la cuenta vinculada a Google: sin ella no habría forma de volver a entrar.
 */
export async function logoutEverywhere(env: Env, session: Session): Promise<{ ok: true }> {
  const player = await env.DB.prepare('SELECT google_sub FROM players WHERE id = ?').bind(session.playerId).first<{ google_sub: string | null }>();
  if (!player?.google_sub) throw new HttpError(400, 'linkGoogleFirst');
  await env.DB.prepare('DELETE FROM sessions WHERE player_id = ?').bind(session.playerId).run();
  return { ok: true };
}

/**
 * Borra la cuenta y todo lo suyo: partidas, niveles, valoraciones, sesiones…
 * Las ligas que creó pasan al miembro más antiguo; las que se quedan vacías se borran.
 */
export async function deleteAccount(env: Env, session: Session): Promise<{ ok: true }> {
  const id = session.playerId;
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE leagues SET created_by = (
         SELECT m.player_id FROM league_members m WHERE m.league_id = leagues.id AND m.player_id <> ?1 ORDER BY m.joined_at LIMIT 1)
       WHERE created_by = ?1 AND EXISTS (SELECT 1 FROM league_members m WHERE m.league_id = leagues.id AND m.player_id <> ?1)`,
    ).bind(id),
    // Las que siguen siendo suyas no tienen a nadie más: se borran con él.
    env.DB.prepare('DELETE FROM players WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM leagues WHERE NOT EXISTS (SELECT 1 FROM league_members m WHERE m.league_id = leagues.id)'),
  ]);
  forgetAll(); // Sus puntos y sus niveles desaparecen de los rankings y las listas.
  return { ok: true };
}

/**
 * Cifra los emails que se guardaron en claro antes de cifrarlos (tarea programada
 * diaria, por tandas). Sin clave no hace nada.
 */
export async function sealLegacyEmails(env: Env): Promise<number> {
  if (!env.EMAIL_KEY) return 0;
  const { results } = await env.DB.prepare("SELECT id, email FROM players WHERE email IS NOT NULL AND email NOT LIKE 'enc1:%' LIMIT 500")
    .all<{ id: string; email: string }>();
  const pending = results.filter((r) => !isSealed(r.email));
  if (pending.length === 0) return 0;
  const key = env.EMAIL_KEY;
  const statements = await Promise.all(
    pending.map(async (r) => env.DB.prepare('UPDATE players SET email = ? WHERE id = ? AND email = ?').bind(await seal(key, r.email), r.id, r.email)),
  );
  await env.DB.batch(statements);
  return pending.length;
}
