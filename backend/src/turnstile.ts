// Turnstile de Cloudflare: antes de crear una cuenta, el navegador demuestra que
// lo usa una persona (casi siempre sin que se note). Así un script no puede crear
// cuentas en masa. Sin TURNSTILE_SECRET (en local y en los tests) no se comprueba.

import { type Env, HttpError } from './http';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Clave pública del widget para el juego, o null si la comprobación está desactivada. */
export function turnstileSiteKey(env: Env): string | null {
  return env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY ? env.TURNSTILE_SITE_KEY : null;
}

/** Comprueba la respuesta del widget. Si el servicio de Cloudflare falla, se deja pasar: mejor eso que no dejar jugar a nadie. */
export async function verifyTurnstile(env: Env, response: unknown, ip: string): Promise<void> {
  if (!turnstileSiteKey(env)) return;
  if (typeof response !== 'string' || response.length === 0 || response.length > 2048) throw new HttpError(403, 'humanCheckFailed');
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET!);
  form.append('response', response);
  form.append('remoteip', ip);
  let outcome: { success?: boolean; 'error-codes'?: string[] };
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`siteverify ${res.status}`);
    outcome = await res.json();
  } catch (err) {
    console.error(JSON.stringify({ event: 'turnstileUnavailable', error: String(err) }));
    return;
  }
  if (!outcome.success) {
    console.log(JSON.stringify({ event: 'turnstileRejected', codes: outcome['error-codes'] ?? [] }));
    throw new HttpError(403, 'humanCheckFailed');
  }
}
