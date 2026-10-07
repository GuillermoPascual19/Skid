// Cliente de la API del ranking (worker/index.ts, en Cloudflare). La API está
// en /api del mismo dominio. Con VITE_API_BASE= vacía (p. ej. en .env.local),
// `onlineEnabled` es false y el juego funciona sin ranking (el reto diario solo
// se controla en este navegador).
//
// Cada jugador es anónimo: la primera vez el servidor le da un token, que se
// guarda en el navegador y lo identifica a partir de entonces.

import type { DailyResult } from './storage';

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

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const first = await request<T>(method, path, body, await session());
  if (first.status !== 401) return first.data;
  // El servidor no reconoce el token (p. ej. base de datos nueva): sesión nueva.
  memoryToken = null;
  writeToken(null);
  const second = await request<T>(method, path, body, await session());
  if (second.status === 401) throw new Error('Sesión no válida');
  return second.data;
}

// ------------------------------------------------------------------ Perfil

export async function getName(): Promise<string | null> {
  return (await api<{ name: string | null }>('GET', '/me')).name;
}

export async function setName(name: string): Promise<void> {
  await api('PUT', '/me', { name });
}

// ------------------------------------------------------------ Reto diario

export interface ServerRun {
  /** Instantes en ms, con el reloj del servidor. */
  startedAt: number;
  finishedAt: number | null;
  moves: number | null;
  retries: number | null;
  hints: number | null;
  timeMs: number | null;
  score: number | null;
}

export async function getDaily(day: string): Promise<ServerRun | null> {
  return (await api<{ run: ServerRun | null }>('GET', `/daily/${day}`)).run;
}

/** Empieza el reto (el cronómetro del servidor arranca aquí). */
export async function startDaily(day: string): Promise<ServerRun> {
  const { run } = await api<{ run: ServerRun | null }>('POST', `/daily/${day}/start`);
  if (!run) throw new Error('No se pudo empezar el reto');
  return run;
}

/** Envía el registro de la partida; el servidor lo verifica y calcula la puntuación. */
export async function finishDaily(day: string, log: string): Promise<DailyResult> {
  return api<DailyResult>('POST', `/daily/${day}/finish`, { log });
}

export interface DailyWin {
  leagueId: string;
  leagueName: string;
  /** Cuántos terminaron el reto en esa liga. */
  players: number;
  score: number | null;
}

/** Ligas en las que quedaste 1.º en el reto de `day`. */
export function dailyWins(day: string): Promise<DailyWin[]> {
  return api<DailyWin[]>('GET', `/daily/${day}/wins`);
}

// ------------------------------------------------------------------ Ligas

export interface League {
  id: string;
  name: string;
  code: string;
  members?: number;
}

export function myLeagues(): Promise<League[]> {
  return api<League[]>('GET', '/leagues');
}

export function createLeague(name: string): Promise<League> {
  return api<League>('POST', '/leagues', { name });
}

export function joinLeague(code: string): Promise<League> {
  return api<League>('POST', '/leagues/join', { code });
}

export interface RankingRow {
  name: string;
  isMe: boolean;
  status: 'finished' | 'playing' | 'pending';
  score: number | null;
  moves: number | null;
  retries: number | null;
  hints: number | null;
  timeMs: number | null;
}

export interface StandingRow {
  name: string;
  isMe: boolean;
  /** Suma de puntos del periodo. */
  points: number;
  /** Retos terminados en el periodo. */
  days: number;
  /** Días que quedó 1.º (con al menos 2 que terminaron). */
  wins: number;
  best: number | null;
}

/** Clasificación de una liga entre dos días (ambos incluidos). */
export function leagueStandings(leagueId: string, from: string, to: string): Promise<StandingRow[]> {
  return api<StandingRow[]>('GET', `/leagues/${encodeURIComponent(leagueId)}/standings?from=${from}&to=${to}`);
}

export function leagueRanking(leagueId: string, day: string): Promise<RankingRow[]> {
  return api<RankingRow[]>('GET', `/leagues/${encodeURIComponent(leagueId)}/ranking?day=${day}`);
}
