// Conexión con el servidor (worker/, en Cloudflare): sesión, token y login con
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
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Sin conexión con el servidor');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && res.status !== 401) throw new Error(data.error ?? `Error ${res.status}`);
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

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const first = await request<T>(method, path, body, await session());
  if (first.status !== 401) return first.data;
  // El servidor no reconoce el token (p. ej. base de datos nueva): sesión nueva.
  memoryToken = null;
  writeToken(null);
  const second = await request<T>(method, path, body, await session());
  if (second.status === 401) throw new Error('Sesión no válida');
  return second.data;
}

// ---------------------------------------------------------- Login con Google

let configPromise: Promise<{ googleClientId: string | null }> | null = null;

/** ID de cliente de Google para el botón de login (null si no está configurado). */
export async function googleClientId(): Promise<string | null> {
  configPromise ??= request<{ googleClientId: string | null }>('GET', '/config')
    .then(({ data }) => data)
    .catch((err) => {
      configPromise = null;
      throw err;
    });
  return (await configPromise).googleClientId;
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

/** Cierra la sesión de este dispositivo. La próxima llamada crea un jugador anónimo nuevo. */
export async function logout(): Promise<void> {
  try {
    await api('POST', '/auth/logout');
  } finally {
    memoryToken = null;
    writeToken(null);
  }
}
