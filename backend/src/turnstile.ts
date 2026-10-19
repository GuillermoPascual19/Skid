// Turnstile de Cloudflare: antes de crear una cuenta, el navegador demuestra que
// lo usa una persona (casi siempre sin que se note). Así un script no puede crear
// cuentas en masa. Sin TURNSTILE_SECRET (en local y en los tests) no se comprueba.

import { type Env, HttpError } from './http';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Clave pública del widget para el juego, o null si la comprobación está desactivada. */
export function turnstileSiteKey(env: Env): string | null {
  return env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY ? env.TURNSTILE_SITE_KEY : null;
}

/** La acción que pone el juego al pedir la comprobación (frontend/src/shared/turnstile.ts). */
const ACTION = 'session';

/**
 * Comprueba la respuesta del widget: que Cloudflare la dé por buena y que sea de este
 * dominio y para crear una sesión (no de otra web con la misma clave, si se configurase
 * mal el widget). En local no se miran dominio ni acción: las claves de prueba no los traen.
 * Si el servicio de Cloudflare falla, se deja pasar: mejor eso que no dejar jugar a nadie.
 */
export async function verifyTurnstile(env: Env, response: unknown, ip: string, host: string): Promise<void> {
  if (!turnstileSiteKey(env)) return;
  if (typeof response !== 'string' || response.length === 0 || response.length > 2048) throw new HttpError(403, 'humanCheckFailed');
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET!);
  form.append('response', response);
  form.append('remoteip', ip);
  let outcome: { success?: boolean; hostname?: string; action?: string; 'error-codes'?: string[] };
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`siteverify ${res.status}`);
    outcome = await res.json();
  } catch (err) {
    console.error(JSON.stringify({ event: 'turnstileUnavailable', error: String(err) }));
    return;
  }
  const local = host === 'localhost' || host === '127.0.0.1';
  const ours = local || (outcome.hostname === host && outcome.action === ACTION);
  if (!outcome.success || !ours) {
    console.log(JSON.stringify({ event: 'turnstileRejected', codes: outcome['error-codes'] ?? [], hostname: outcome.hostname, action: outcome.action }));
    throw new HttpError(403, 'humanCheckFailed');
  }
}
