// Utilidades HTTP comunes: entorno, sesión autenticada, errores con código y validación de la entrada.

import type { ErrorKey } from '../../common/i18n/errors/es';
import type { MessageParams } from '../../common/i18n/format';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SESSION_RATE_LIMITER: RateLimit;
  JOIN_RATE_LIMITER: RateLimit;
  /** Peticiones por jugador y minuto a toda la API (contra abusos y scripts). */
  API_RATE_LIMITER: RateLimit;
  ERROR_RATE_LIMITER: RateLimit;
  /** ID de cliente OAuth de Google (público). Sin él, el login con Google está desactivado. */
  GOOGLE_CLIENT_ID?: string;
  /** Solo para pruebas en local: de dónde descargar las claves de firma. */
  GOOGLE_CERTS_URL?: string;
  /** Claves VAPID de las notificaciones (la pública en wrangler.jsonc, la privada como secreto). Sin ellas, no hay notificaciones. */
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  /** Token de Cloudflare Web Analytics (público: va en la página). Vacío, sin analíticas. */
  CF_ANALYTICS_TOKEN?: string;
  /** Clave (32 bytes, base64url) con la que se cifra el email en la base de datos (secreto). Sin ella no se guarda. */
  EMAIL_KEY?: string;
  /** Cuentas de Google con acceso al panel de administración: sus «sub», separados por comas (secreto). */
  ADMIN_GOOGLE_SUBS?: string;
  /** Turnstile (backend/src/turnstile.ts): la clave pública del widget y la secreta. Sin las dos, no se comprueba. */
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  /** Deja una tarea corriendo después de responder (ctx.waitUntil de la petición). */
  waitUntil?(task: Promise<unknown>): void;
}

export interface Session {
  readonly playerId: string;
  readonly tokenHash: string;
  /** El token tal cual (para volver a poner la cookie). */
  readonly token: string;
  /** Hay que (re)poner la cookie: llegó por la cabecera antigua o se acaba de usar tras un día. */
  readonly renew: boolean;
}

/**
 * Error con su código HTTP y la clave de su mensaje (common/i18n/errors): el
 * mensaje se traduce al idioma del jugador al responder (ver index.ts).
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly key: ErrorKey,
    readonly params: MessageParams = {},
  ) {
    super(key);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      // Que el navegador no interprete la respuesta como otra cosa ni se pueda incrustar.
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    },
  });
}

/** Tamaño máximo del cuerpo de una petición: lo más grande que se manda es un registro de partida. */
const MAX_BODY_BYTES = 32 * 1024;

export async function body<T>(req: Request): Promise<T> {
  // Se corta antes de leerlo entero: un cuerpo enorme gastaría memoria y CPU del Worker.
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) throw new HttpError(413, 'requestTooLarge');
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'requestTooLarge');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'invalidBody');
  }
}

/** Texto sin caracteres de control y con espacios normalizados; si no mide entre min y max, lanza `lengthError` (con min y max). */
export function cleanText(value: unknown, min: number, max: number, lengthError: ErrorKey): string {
  const text = typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim() : '';
  if (text.length < min || text.length > max) throw new HttpError(400, lengthError, { min, max });
  return text;
}
