// Cliente de la API del ranking (worker/index.ts, en Cloudflare). La API está
// en /api del mismo dominio. Con VITE_API_BASE= vacía (p. ej. en .env.local),
// `onlineEnabled` es false y el juego funciona sin ranking (el reto diario solo
// se controla en este navegador).
//
// Cada jugador es anónimo: la primera vez el servidor le da un token, que se
// guarda en el navegador y lo identifica a partir de entonces.

import type { HatId } from '../art/hats';
import type { AchievementProgress } from '../core/achievements';
import type { ElementId } from '../core/elements';
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

export interface Me {
  name: string | null;
  /** Correo de la cuenta de Google vinculada, o null si no hay. */
  email: string | null;
  /** Gorro que lleva el pingüino. */
  hat: HatId | null;
}

export function getMe(): Promise<Me> {
  return api<Me>('GET', '/me');
}

export async function getName(): Promise<string | null> {
  return (await getMe()).name;
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

// ------------------------------------------------------------------ Logros

export interface Achievements {
  hat: HatId | null;
  items: AchievementProgress[];
}

export function getAchievements(): Promise<Achievements> {
  return api<Achievements>('GET', '/achievements');
}

/** Ponerse un gorro (o quitárselo con null). El servidor comprueba que esté desbloqueado. */
export async function setHat(hat: HatId | null): Promise<void> {
  await api('PUT', '/me/hat', { hat });
}

// ------------------------------------------------------------ Estadísticas

export interface PlayerStats {
  played: number;
  currentStreak: number;
  bestStreak: number;
  playedToday: boolean;
  /** Protectores de racha disponibles (se gana uno cada 7 días seguidos). */
  freezes: number;
  /** Días ("YYYY-MM-DD") jugados, ganados y salvados por un protector. */
  calendar: { played: string[]; won: string[]; frozen: string[] };
  bestScore: number | null;
  averageScore: number | null;
  /** Días que quedó 1.º en alguna liga (con al menos 2 que terminaron). */
  wins: number;
  /** Retos con 1000 puntos. */
  perfect: number;
  /** Últimos 30 días, del más antiguo a hoy; score null = no jugó. */
  history: { day: string; score: number | null; won: boolean }[];
}

export function getStats(): Promise<PlayerStats> {
  return api<PlayerStats>('GET', '/stats');
}

export interface PlayerProfile {
  name: string | null;
  hat: HatId | null;
  isMe: boolean;
  /** Ligas que tiene en común con quien lo mira. */
  sharedLeagues: string[];
  stats: PlayerStats;
  /** Logros desbloqueados. */
  achievements: AchievementProgress['id'][];
  /** Días que jugasteis los dos (null en tu propio perfil). */
  headToHead: { played: number; myWins: number; theirWins: number; ties: number } | null;
}

/** Perfil de un jugador de tus ligas (o el tuyo). */
export function getPlayer(id: string): Promise<PlayerProfile> {
  return api<PlayerProfile>('GET', `/players/${encodeURIComponent(id)}`);
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
  /** Para abrir su perfil. */
  id: string;
  name: string;
  hat: HatId | null;
  isMe: boolean;
  status: 'finished' | 'playing' | 'pending';
  score: number | null;
  moves: number | null;
  retries: number | null;
  hints: number | null;
  timeMs: number | null;
}

export interface StandingRow {
  id: string;
  name: string;
  hat: HatId | null;
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

// ------------------------------------------------- Niveles de la comunidad

export interface CustomLevel {
  id: string;
  name: string;
  rows: string[];
  optimal: number;
  elements: ElementId[];
  createdAt: number;
  author: string;
  authorId: string;
  authorHat: HatId | null;
  /** Es un nivel tuyo. */
  mine: boolean;
  /** Jugadores (sin contar al autor) que lo han superado. */
  plays: number;
  /** Media de las valoraciones (1-5), o null si nadie lo ha valorado. */
  rating: number | null;
  ratingCount: number;
  /** Tu mejor marca, o null si no lo has superado. */
  myBest: number | null;
  myRating: number | null;
}

export type CustomLevelSort = 'top' | 'new' | 'mine';

export function listCustomLevels(sort: CustomLevelSort, offset = 0): Promise<{ levels: CustomLevel[]; more: boolean }> {
  return api('GET', `/levels?sort=${sort}&offset=${offset}`);
}

export function getCustomLevel(id: string): Promise<CustomLevel> {
  return api('GET', `/levels/${encodeURIComponent(id)}`);
}

/** Publica un nivel. `log` es cómo lo superó el autor (lo exige el servidor). */
export function publishCustomLevel(name: string, rows: string[], log: string): Promise<CustomLevel> {
  return api('POST', '/levels', { name, rows, log });
}

export function finishCustomLevel(id: string, log: string): Promise<CustomLevel> {
  return api('POST', `/levels/${encodeURIComponent(id)}/finish`, { log });
}

export function rateCustomLevel(id: string, stars: number): Promise<CustomLevel> {
  return api('PUT', `/levels/${encodeURIComponent(id)}/rating`, { stars });
}

export async function deleteCustomLevel(id: string): Promise<void> {
  await api('DELETE', `/levels/${encodeURIComponent(id)}`);
}
