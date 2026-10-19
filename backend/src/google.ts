// Verificación de los ID tokens de "Iniciar sesión con Google" (JWT firmados
// con RS256). Solo usa WebCrypto: funciona igual en el Worker y en los tests.

export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
/** Margen para relojes un poco desincronizados. */
const CLOCK_SKEW_S = 60;

export interface GoogleClaims {
  /** Identificador estable de la cuenta de Google. */
  readonly sub: string;
  readonly email?: string;
  readonly email_verified?: boolean;
  readonly name?: string;
  readonly given_name?: string;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

/** Devuelve las claves públicas con las que firma Google (o las de un test). */
export type KeyProvider = () => Promise<Jwk[]>;

export class InvalidTokenError extends Error {}

function base64UrlDecode(part: string): Uint8Array<ArrayBuffer> {
  const base64 = part
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(part.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson<T>(part: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(part))) as T;
  } catch {
    throw new InvalidTokenError('Token mal formado');
  }
}

/**
 * Comprueba firma, emisor, destinatario (`aud` = el ID de cliente de la app) y
 * caducidad. Devuelve los datos de la cuenta o lanza InvalidTokenError.
 */
export async function verifyGoogleIdToken(token: string, clientId: string, keys: KeyProvider, nowS: number = Date.now() / 1000): Promise<GoogleClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new InvalidTokenError('Token mal formado');
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = decodeJson<{ alg?: string; kid?: string }>(headerPart);
  if (header.alg !== 'RS256' || !header.kid) throw new InvalidTokenError('Algoritmo no admitido');

  const jwk = (await keys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new InvalidTokenError('Clave de firma desconocida');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
    'verify',
  ]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlDecode(signaturePart), new TextEncoder().encode(`${headerPart}.${payloadPart}`));
  if (!valid) throw new InvalidTokenError('Firma no válida');

  const claims = decodeJson<GoogleClaims & { iss?: string; aud?: string; exp?: number; iat?: number }>(payloadPart);
  if (!claims.iss || !GOOGLE_ISSUERS.includes(claims.iss)) throw new InvalidTokenError('Emisor no válido');
  if (claims.aud !== clientId) throw new InvalidTokenError('El token es de otra aplicación');
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < nowS) throw new InvalidTokenError('Token caducado');
  if (typeof claims.iat === 'number' && claims.iat - CLOCK_SKEW_S > nowS) throw new InvalidTokenError('Token del futuro');
  if (typeof claims.sub !== 'string' || !claims.sub) throw new InvalidTokenError('Token sin cuenta');
  return claims;
}

/** Claves de Google, descargadas como mucho una vez cada hora por instancia del Worker. */
export function googleKeyProvider(url: string = GOOGLE_CERTS_URL): KeyProvider {
  let cache: { keys: Jwk[]; until: number } | null = null;
  return async () => {
    if (cache && cache.until > Date.now()) return cache.keys;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`No se pudieron descargar las claves de Google (${res.status})`);
    const { keys } = (await res.json()) as { keys: Jwk[] };
    cache = { keys, until: Date.now() + 60 * 60 * 1000 };
    return keys;
  };
}
