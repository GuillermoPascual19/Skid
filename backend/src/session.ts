// Sesiones anónimas por token y login con Google (varias sesiones por jugador).

import { dayKey } from '../../common/logic/daily/daily';
import { GOOGLE_CERTS_URL, googleKeyProvider, InvalidTokenError, verifyGoogleIdToken } from './google';
import { type Env, HttpError, type Session } from './http';

/** Cuentas nuevas por IP y día (alto a propósito: en una universidad muchos comparten IP). */
const MAX_SESSIONS_PER_IP_PER_DAY = 20;

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function createSession(req: Request, env: Env): Promise<{ token: string }> {
  const ip = req.headers.get('CF-Connecting-IP') ?? 'desconocida';
  // Solo se guarda el hash, y con el día dentro: no sirve para seguir a una IP de un día a otro
  // (y la tabla se vacía a diario).
  const day = dayKey(new Date());
  const ipHash = await sha256(`skid-ip:${day}:${ip}`);

  // Ráfagas: el limitador de Cloudflare, en memoria (no gasta base de datos).
  const { success } = await env.SESSION_RATE_LIMITER.limit({ key: ipHash });
  if (!success) throw new HttpError(429, 'Demasiadas cuentas nuevas seguidas. Espera un minuto.');

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
    throw new HttpError(429, 'Se han creado demasiadas cuentas desde esta conexión hoy. Prueba mañana.');
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO players (id, token_hash) VALUES (?, ?)').bind(id, tokenHash),
    env.DB.prepare('INSERT INTO sessions (token_hash, player_id) VALUES (?, ?)').bind(tokenHash, id),
  ]);
  return { token };
}

export async function authenticate(req: Request, env: Env): Promise<Session> {
  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, 'Sin sesión');
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare('SELECT player_id FROM sessions WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ player_id: string }>();
  if (!row) throw new HttpError(401, 'Sesión no válida');
  return { playerId: row.player_id, tokenHash };
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
  if (!env.GOOGLE_CLIENT_ID) throw new HttpError(503, 'El login con Google no está configurado');
  if (typeof credential !== 'string' || credential.length > 4096) throw new HttpError(400, 'Credencial no válida');

  googleKeys ??= googleKeyProvider(certsUrl(env));
  let claims;
  try {
    claims = await verifyGoogleIdToken(credential, env.GOOGLE_CLIENT_ID, googleKeys);
  } catch (err) {
    // 400 y no 401: un 401 haría que el cliente tirase su sesión.
    if (err instanceof InvalidTokenError) throw new HttpError(400, `No se pudo verificar la cuenta de Google: ${err.message}`);
    throw err;
  }
  const email = claims.email_verified === false ? null : (claims.email ?? null);

  const linked = await env.DB.prepare('SELECT id, name FROM players WHERE google_sub = ?')
    .bind(claims.sub)
    .first<{ id: string; name: string | null }>();

  if (linked?.id === session.playerId) {
    await env.DB.prepare('UPDATE players SET email = ? WHERE id = ?').bind(email, linked.id).run();
    return { token: null, switched: false, name: linked.name, email };
  }

  if (linked) return switchDevice(env, session, linked.id, linked.name, email);

  const current = await env.DB.prepare('SELECT name, google_sub FROM players WHERE id = ?')
    .bind(session.playerId)
    .first<{ name: string | null; google_sub: string | null }>();
  if (current?.google_sub) {
    // El jugador de este dispositivo es de otra cuenta de Google: jugador nuevo.
    const id = crypto.randomUUID();
    const token = randomToken();
    const tokenHash = await sha256(token);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO players (id, token_hash, google_sub, email) VALUES (?, ?, ?, ?)').bind(id, tokenHash, claims.sub, email),
      env.DB.prepare('INSERT INTO sessions (token_hash, player_id) VALUES (?, ?)').bind(tokenHash, id),
      env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash),
    ]);
    return { token, switched: true, name: null, email };
  }

  // Primera vez con esta cuenta: se vincula al jugador actual.
  await env.DB.prepare('UPDATE players SET google_sub = ?, email = ? WHERE id = ? AND google_sub IS NULL')
    .bind(claims.sub, email, session.playerId)
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
): Promise<GoogleLoginResult> {
  const token = randomToken();
  const tokenHash = await sha256(token);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, player_id) VALUES (?, ?)').bind(tokenHash, playerId),
    env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash),
    env.DB.prepare('UPDATE players SET email = ? WHERE id = ?').bind(email, playerId),
  ]);
  return { token, switched: true, name, email };
}
