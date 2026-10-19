// Comprobación de que el juego funciona, para un servicio de avisos externo
// (README, «Avisos si se cae»): responde 200 si el Worker y la base de datos
// contestan y 503 si la base de datos falla. No hace falta sesión.

import { json } from '../http';

/** Lo único que necesita del entorno (así se prueba sin los tipos de Cloudflare). */
interface HealthEnv {
  readonly DB: Pick<D1Database, 'prepare'>;
}

/** Durante este tiempo se repite la última respuesta: llamarla sin parar no gasta base de datos. */
const CACHE_MS = 30_000;

let last: { at: number; ok: boolean; ms: number } | null = null;

export async function health(env: HealthEnv, now = Date.now()): Promise<Response> {
  if (!last || now - last.at > CACHE_MS) {
    const start = Date.now();
    let ok = false;
    try {
      ok = (await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>())?.ok === 1;
    } catch (err) {
      console.error(JSON.stringify({ event: 'healthDbFailed', error: String(err) }));
    }
    last = { at: now, ok, ms: Date.now() - start };
  }
  return json({ ok: last.ok, db: last.ok ? 'ok' : 'error', dbMs: last.ms, checkedAt: new Date(last.at).toISOString() }, last.ok ? 200 : 503);
}

/** Para los tests: olvida la última comprobación. */
export function resetHealth(): void {
  last = null;
}
