// Utilidades HTTP comunes: entorno, sesión autenticada, errores con código y validación de la entrada.

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SESSION_RATE_LIMITER: RateLimit;
  JOIN_RATE_LIMITER: RateLimit;
  /** Peticiones por jugador y minuto a toda la API (contra abusos y scripts). */
  API_RATE_LIMITER: RateLimit;
  /** ID de cliente OAuth de Google (público). Sin él, el login con Google está desactivado. */
  GOOGLE_CLIENT_ID?: string;
  /** Solo para pruebas en local: de dónde descargar las claves de firma. */
  GOOGLE_CERTS_URL?: string;
}

export interface Session {
  readonly playerId: string;
  readonly tokenHash: string;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
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
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES) throw new HttpError(413, 'Petición demasiado grande');
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'Petición demasiado grande');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'Cuerpo no válido');
  }
}

export function cleanText(value: unknown, min: number, max: number, what: string): string {
  // Sin caracteres de control y con espacios normalizados.
  const text = typeof value === 'string' ? value.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim() : '';
  if (text.length < min || text.length > max) throw new HttpError(400, `${what} debe tener entre ${min} y ${max} caracteres`);
  return text;
}
