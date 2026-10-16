import { locale, t, te } from '../i18n/i18n';
import { forgetAll } from './cache';
// Conexión con el servidor (backend/, en Cloudflare): sesión, token y login con
// Google. Las llamadas de cada apartado están en su carpeta (features/*/api.ts).
// La API está en /api del mismo dominio. Con VITE_API_BASE= vacía (p. ej. en .env.local),
// `onlineEnabled` es false y el juego funciona sin ranking (el reto diario solo
// se controla en este navegador).
//
// Cada jugador es anónimo: la primera vez el servidor le da un token, que se
// guarda en el navegador y lo identifica a partir de entonces.

const API = import.meta.env.VITE_API_BASE ?? '/api';
const TOKEN_KEY = 'skid.token.v1';

export const onlineEnabled = API !== '';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  forgetAll();
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Sin almacenamiento: la sesión dura lo que la pestaña.
  }
}

let memoryToken: string | null = readToken();
let creating: Promise<string> | null = null;

async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; data: T }> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // El servidor contesta los errores en el idioma del jugador.
        'X-Skid-Lang': locale(),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(t('common.offline'));
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && res.status !== 401) throw new Error(data.error ?? t('common.httpError', { status: res.status }));
  return { status: res.status, data };
}

/** Token de la sesión; la crea la primera vez. */
function session(): Promise<string> {
  if (memoryToken) return Promise.resolve(memoryToken);
  creating ??= request<{ token: string }>('POST', '/session')
    .then(({ data }) => {
      memoryToken = data.token;
      writeToken(data.token);
      return data.token;
    })
    .finally(() => (creating = null));
  return creating;
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
  const first = await request<T>(method, path, body, await session());
  if (first.status !== 401) return first.data;
  // El servidor no reconoce el token (p. ej. base de datos nueva): sesión nueva.
  memoryToken = null;
  writeToken(null);
  const second = await request<T>(method, path, body, await session());
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
  const result = await api<GoogleLogin & { token: string | null }>('POST', '/auth/google', { credential });
  if (result.token) {
    memoryToken = result.token;
    writeToken(result.token);
  }
  return { switched: result.switched, name: result.name, email: result.email };
}

/** Cierra la sesión en todos los dispositivos (solo con cuenta de Google). */
export async function logoutEverywhere(): Promise<void> {
  await api('POST', '/auth/logout-all');
  memoryToken = null;
  writeToken(null);
}

/** Borra la cuenta en el servidor y olvida la sesión de este navegador. */
export async function deleteAccount(): Promise<void> {
  await api('DELETE', '/me', { confirm: 'BORRAR' });
  memoryToken = null;
  writeToken(null);
}

/** Cierra la sesión de este dispositivo. La próxima llamada crea un jugador anónimo nuevo. */
export async function logout(): Promise<void> {
  try {
    await api('POST', '/auth/logout');
  } finally {
    memoryToken = null;
    writeToken(null);
  }
}
