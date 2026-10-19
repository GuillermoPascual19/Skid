import { locale, t, te } from '../i18n/i18n';
import { forgetAll } from './cache';
import { humanCheck } from './turnstile';
// Conexión con el servidor (backend/, en Cloudflare): sesión y login con Google.
// Las llamadas de cada apartado están en su carpeta (features/*/api.ts).
// La API está en /api del mismo dominio. Con VITE_API_BASE= vacía (p. ej. en .env.local),
// `onlineEnabled` es false y el juego funciona sin ranking (el reto diario solo
// se controla en este navegador).
//
// Cada jugador es anónimo: la primera vez el servidor crea su sesión y la guarda
// en una cookie HttpOnly, que el código de la página no puede leer (así un script
// inyectado no puede robarla). El juego no ve nunca el token.

const API = import.meta.env.VITE_API_BASE ?? '/api';

export const onlineEnabled = API !== '';

/** Donde los juegos de antes guardaban el token. Se manda una vez para pasarlo a la cookie y se borra. */
const LEGACY_TOKEN_KEY = 'skid.token.v1';

function readLegacyToken(): string | null {
  try {
    return localStorage.getItem(LEGACY_TOKEN_KEY);
  } catch {
    return null;
  }
}

function dropLegacyToken(): void {
  legacyToken = null;
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    // Sin almacenamiento: no había nada que borrar.
  }
}

let legacyToken = readLegacyToken();

/** Sube cada vez que cambia la sesión: una respuesta 401 de antes del cambio no crea otra cuenta. */
let generation = 0;
let creating: Promise<void> | null = null;

async function request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const legacy = legacyToken;
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(legacy ? { Authorization: `Bearer ${legacy}` } : {}),
        // El servidor contesta los errores en el idioma del jugador.
        'X-Skid-Lang': locale(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(t('common.offline'));
  }
  // El servidor ya ha puesto la cookie con ese token (o no lo reconoce): fuera del navegador.
  if (legacy && legacy === legacyToken) dropLegacyToken();
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && res.status !== 401) throw new Error(data.error ?? t('common.httpError', { status: res.status }));
  return { status: res.status, data };
}

/** Sesión nueva (jugador anónimo nuevo), con la comprobación de que es una persona. Las llamadas a la vez comparten una. */
function newSession(): Promise<void> {
  creating ??= (async () => {
    const siteKey = (await config().catch(() => null))?.turnstileSiteKey ?? null;
    const turnstile = siteKey ? await humanCheck(siteKey) : undefined;
    await request('POST', '/session', { turnstile });
    forgetAll();
    generation++;
  })().finally(() => (creating = null));
  return creating;
}

/** Ha cambiado el jugador de este dispositivo (otra cuenta, sesión cerrada, cuenta borrada). */
function sessionChanged(): void {
  forgetAll();
  generation++;
}

/**
 * Llamada a la API con la sesión. Las lecturas (GET) que salen a la vez (por
 * ejemplo, todas las de la portada al abrirla) se agrupan solas en una sola
 * petición a /batch: menos viajes al servidor y menos peticiones gastadas.
 */
export function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (method === 'GET' && body === undefined) return batchedGet<T>(path);
  return direct<T>(method, path, body);
}

async function direct<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (creating) await creating;
  const sent = generation;
  const first = await request<T>(method, path, body);
  if (first.status !== 401) return first.data;
  // Sin sesión (primera visita, o el servidor no la reconoce): se crea una, salvo
  // que otra llamada lo haya hecho mientras tanto.
  if (sent === generation) await newSession();
  else if (creating) await creating;
  const second = await request<T>(method, path, body);
  if (second.status === 401) throw new Error(te('invalidSession'));
  return second.data;
}

// ------------------------------------------------------- Lecturas agrupadas

/** Lecturas como mucho por lote (el servidor admite 12). */
const MAX_BATCH = 12;

interface Waiter {
  resolve(data: unknown): void;
  reject(err: Error): void;
}

/** Lecturas pendientes de este momento, por ruta (dos iguales comparten respuesta). */
let pending = new Map<string, Waiter[]>();

function batchedGet<T>(path: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // Lo que se pida en este mismo bloque de código va en el lote, que sale en cuanto
    // termina (sin esperar a que se pinte la pantalla).
    if (pending.size === 0) queueMicrotask(flush);
    const waiters = pending.get(path) ?? [];
    waiters.push({ resolve: resolve as (data: unknown) => void, reject });
    pending.set(path, waiters);
  });
}

function flush(): void {
  const batch = pending;
  pending = new Map();
  const paths = [...batch.keys()];
  for (let i = 0; i < paths.length; i += MAX_BATCH) void send(paths.slice(i, i + MAX_BATCH), batch);
}

async function send(paths: string[], batch: Map<string, Waiter[]>): Promise<void> {
  const settle = (path: string, fn: (w: Waiter) => void) => batch.get(path)!.forEach(fn);
  // Una sola: tal cual, sin lote.
  if (paths.length === 1) {
    const [path] = paths;
    await direct('GET', path).then(
      (data) => settle(path, (w) => w.resolve(data)),
      (err: Error) => settle(path, (w) => w.reject(err)),
    );
    return;
  }
  let results: Record<string, { status: number; data: { error?: string } }>;
  try {
    const query = paths.map((p) => `p=${encodeURIComponent(p)}`).join('&');
    ({ results } = await direct<{ results: typeof results }>('GET', `/batch?${query}`));
  } catch (err) {
    // Sin conexión: todas fallan igual. Otro fallo del lote: cada una por su cuenta.
    if ((err as Error).message === t('common.offline')) return paths.forEach((p) => settle(p, (w) => w.reject(err as Error)));
    await Promise.all(paths.map((p) => direct('GET', p).then((data) => settle(p, (w) => w.resolve(data)), (e: Error) => settle(p, (w) => w.reject(e)))));
    return;
  }
  for (const path of paths) {
    const result = results[path];
    if (result && result.status < 400) settle(path, (w) => w.resolve(result.data));
    else settle(path, (w) => w.reject(new Error(result?.data.error ?? t('common.httpError', { status: result?.status ?? 0 }))));
  }
}

// ---------------------------------------------------------- Login con Google

interface PublicConfig {
  googleClientId: string | null;
  /** Token (público) de Cloudflare Web Analytics; null si no se usan analíticas. */
  analyticsToken: string | null;
  /** Clave pública de Turnstile; null si no se comprueba al crear cuentas. */
  turnstileSiteKey?: string | null;
}

let configPromise: Promise<PublicConfig> | null = null;

function config(): Promise<PublicConfig> {
  configPromise ??= request<PublicConfig>('GET', '/config')
    .then(({ data }) => data)
    .catch((err) => {
      configPromise = null;
      throw err;
    });
  return configPromise;
}

/** ID de cliente de Google para el botón de login (null si no está configurado). */
export async function googleClientId(): Promise<string | null> {
  return (await config()).googleClientId;
}

/** Token de las analíticas (null si no están activadas). */
export async function analyticsToken(): Promise<string | null> {
  return (await config()).analyticsToken ?? null;
}

export interface GoogleLogin {
  /** true si este dispositivo ha pasado a ser otro jugador (el de esa cuenta). */
  switched: boolean;
  name: string | null;
  email: string | null;
}

/** Entra con el token que da el botón de Google. Puede cambiar el jugador de este dispositivo. */
export async function loginWithGoogle(credential: string): Promise<GoogleLogin> {
  // Si este dispositivo pasa a ser otro jugador, el servidor cambia la cookie.
  const result = await api<GoogleLogin>('POST', '/auth/google', { credential });
  if (result.switched) sessionChanged();
  return { switched: result.switched, name: result.name, email: result.email };
}

/** Cierra la sesión en todos los dispositivos (solo con cuenta de Google). */
export async function logoutEverywhere(): Promise<void> {
  await api('POST', '/auth/logout-all');
  sessionChanged();
}

/** Borra la cuenta en el servidor y olvida la sesión de este navegador. */
export async function deleteAccount(): Promise<void> {
  await api('DELETE', '/me', { confirm: 'BORRAR' });
  sessionChanged();
}

/** Cierra la sesión de este dispositivo. La próxima llamada crea un jugador anónimo nuevo. */
export async function logout(): Promise<void> {
  try {
    await api('POST', '/auth/logout');
  } finally {
    sessionChanged();
  }
}
