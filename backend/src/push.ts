// Notificaciones push: a quién y en qué idioma se avisa, sin repetir avisos y
// borrando las suscripciones caducadas. El cifrado y la firma están en webpush.ts.

import { formatMessage, type MessageParams } from '../../common/i18n/format';
import { isLocale } from '../../common/i18n/locales';
import { PUSH_TEXTS, type PushKind } from '../../common/i18n/push';
import type { Env } from './http';
import { encrypt, vapidAuthorization } from './webpush';

export { isPushEndpoint } from './webpush';

/** Qué preferencia de la suscripción decide si llega cada tipo de aviso. */
const PREF: Record<Exclude<PushKind, 'test'>, 'duels' | 'reactions' | 'streak' | 'friends'> = {
  friendRequest: 'friends',
  friendAccepted: 'friends',
  duelChallenge: 'duels',
  duelAccepted: 'duels',
  duelWaiting: 'duels',
  reaction: 'reactions',
  streak: 'streak',
};

interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: string;
}

/** Envía un aviso a una suscripción. Devuelve el código HTTP del servicio de notificaciones. */
async function send(env: Env, sub: SubscriptionRow, message: { title: string; body: string; url: string; tag: string }): Promise<number> {
  const body = await encrypt(sub.p256dh, sub.auth, new Uint8Array(new TextEncoder().encode(JSON.stringify(message))));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization({ publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! }, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(12 * 3600),
      Urgency: 'high',
    },
    body,
  });
  return res.status;
}

export function pushEnabled(env: Env): boolean {
  return !!env.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY;
}

export interface NotifyOptions {
  /** A dónde lleva al tocarla (dentro del juego). */
  url: string;
  /** Si se pone, no se repite el mismo aviso (por jugador y etiqueta) antes de `throttleMs`. */
  throttle?: { tag: string; ms: number };
}

/**
 * Avisa a un jugador en todos sus dispositivos que tengan ese tipo de aviso
 * activado, cada uno en su idioma. No falla nunca: un aviso perdido no debe
 * romper la acción que lo provoca.
 */
export async function notify(env: Env, playerId: string, kind: PushKind, params: MessageParams, opts: NotifyOptions): Promise<void> {
  if (!pushEnabled(env)) return;
  try {
    // La de prueba llega a todos sus dispositivos; las demás, solo donde está activado ese tipo.
    const pref = kind === 'test' ? '1' : PREF[kind];
    const { results: subs } = await env.DB.prepare(`SELECT endpoint, p256dh, auth, lang FROM push_subscriptions WHERE player_id = ? AND ${pref} = 1`)
      .bind(playerId)
      .all<SubscriptionRow>();
    if (subs.length === 0) return;
    if (opts.throttle) {
      const now = Date.now();
      // Solo pasa si no se avisó hace poco (y se apunta en la misma operación).
      const claimed = await env.DB.prepare(
        `INSERT INTO push_log (player_id, tag, sent_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (player_id, tag) DO UPDATE SET sent_at = excluded.sent_at WHERE push_log.sent_at < ?4`,
      )
        .bind(playerId, opts.throttle.tag, now, now - opts.throttle.ms)
        .run();
      if (!claimed.meta.changes) return;
    }
    await Promise.all(
      subs.map(async (sub) => {
        const texts = PUSH_TEXTS[isLocale(sub.lang) ? sub.lang : 'es'][kind];
        try {
          const status = await send(env, sub, {
            title: formatMessage(texts.title, params),
            body: formatMessage(texts.body, params),
            url: opts.url,
            tag: opts.throttle?.tag ?? kind,
          });
          // El navegador dio de baja la suscripción: se borra.
          if (status === 404 || status === 410) await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(sub.endpoint).run();
          else if (status >= 400) console.warn('push', status, new URL(sub.endpoint).hostname);
        } catch (err) {
          console.warn('push', err);
        }
      }),
    );
  } catch (err) {
    console.warn('push', err);
  }
}

/** Ejecuta un aviso en segundo plano: la respuesta al jugador no espera a que se envíe. */
export function background(env: Env, task: Promise<unknown>): void {
  if (env.waitUntil) env.waitUntil(task);
  else void task;
}
