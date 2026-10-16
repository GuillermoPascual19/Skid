// Suscripciones a las notificaciones: darse de alta (o cambiar qué avisos se
// quieren), darse de baja y mandarse una de prueba. Y el recordatorio de racha
// que lanza la tarea programada cada tarde.

import { dayKey, shiftDay } from '../../../common/logic/daily/daily';
import { isLocale } from '../../../common/i18n/locales';
import { type Env, HttpError } from '../http';
import { isPushEndpoint, notify, pushEnabled } from '../push';

/** Dispositivos con notificaciones por jugador (el más antiguo sale al pasar del límite). */
const MAX_SUBSCRIPTIONS = 10;

/** La clave pública VAPID (null si las notificaciones no están configuradas en el servidor). */
export function pushKey(env: Env) {
  return { publicKey: pushEnabled(env) ? env.VAPID_PUBLIC_KEY! : null };
}

const isKey = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && /^[\w-]+$/.test(v);

interface SubscriptionInput {
  subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  lang?: unknown;
  prefs?: { duels?: unknown; reactions?: unknown; streak?: unknown; friends?: unknown };
}

/** Guarda (o actualiza) la suscripción de este dispositivo y qué avisos quiere. */
export async function saveSubscription(env: Env, playerId: string, input: SubscriptionInput) {
  if (!pushEnabled(env)) throw new HttpError(503, 'pushDisabled');
  const endpoint = input.subscription?.endpoint;
  const p256dh = input.subscription?.keys?.p256dh;
  const auth = input.subscription?.keys?.auth;
  if (!isPushEndpoint(endpoint) || !isKey(p256dh, 120) || !isKey(auth, 40)) throw new HttpError(400, 'invalidSubscription');
  const lang = isLocale(input.lang) ? input.lang : 'es';
  const pref = (v: unknown) => (v === false ? 0 : 1);
  const prefs = { duels: pref(input.prefs?.duels), reactions: pref(input.prefs?.reactions), streak: pref(input.prefs?.streak), friends: pref(input.prefs?.friends) };
  await env.DB.batch([
    // Si el dispositivo era de otro jugador (otra cuenta en el mismo navegador), pasa a este.
    env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, player_id, p256dh, auth, lang, duels, reactions, streak, friends, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET player_id = excluded.player_id, p256dh = excluded.p256dh, auth = excluded.auth,
         lang = excluded.lang, duels = excluded.duels, reactions = excluded.reactions, streak = excluded.streak, friends = excluded.friends`,
    ).bind(endpoint, playerId, p256dh, auth, lang, prefs.duels, prefs.reactions, prefs.streak, prefs.friends, Date.now()),
    env.DB.prepare(
      `DELETE FROM push_subscriptions WHERE player_id = ?1 AND endpoint NOT IN
         (SELECT endpoint FROM push_subscriptions WHERE player_id = ?1 ORDER BY created_at DESC LIMIT ${MAX_SUBSCRIPTIONS})`,
    ).bind(playerId),
  ]);
  return { ok: true, prefs };
}

/** Quita la suscripción de este dispositivo. */
export async function deleteSubscription(env: Env, playerId: string, endpoint: unknown) {
  if (typeof endpoint !== 'string') throw new HttpError(400, 'invalidSubscription');
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND player_id = ?').bind(endpoint, playerId).run();
  return { ok: true };
}

/** Una notificación de prueba a tus dispositivos (como mucho una por minuto). */
export async function testPush(env: Env, playerId: string) {
  if (!pushEnabled(env)) throw new HttpError(503, 'pushDisabled');
  await notify(env, playerId, 'test', {}, { url: '/', throttle: { tag: 'test', ms: 60_000 } });
  return { ok: true };
}

/**
 * Recordatorio de racha (tarea programada de cada tarde): a quien jugó ayer y
 * aún no ha jugado hoy, en los dispositivos con ese aviso activado.
 */
export async function streakReminders(env: Env): Promise<number> {
  if (!pushEnabled(env)) return 0;
  const today = dayKey(new Date());
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT s.player_id FROM push_subscriptions s
     JOIN daily_runs y ON y.player_id = s.player_id AND y.day = ?1 AND y.finished_at IS NOT NULL
     WHERE s.streak = 1
       AND NOT EXISTS (SELECT 1 FROM daily_runs t WHERE t.player_id = s.player_id AND t.day = ?2 AND t.finished_at IS NOT NULL)`,
  )
    .bind(shiftDay(today, -1), today)
    .all<{ player_id: string }>();
  // Por tandas, para no abrir cientos de conexiones a la vez.
  for (let i = 0; i < results.length; i += 20) {
    await Promise.all(results.slice(i, i + 20).map((r) => notify(env, r.player_id, 'streak', {}, { url: '/', throttle: { tag: `streak:${today}`, ms: 86_400_000 } })));
  }
  return results.length;
}
