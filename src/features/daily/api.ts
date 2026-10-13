// Llamadas al servidor del reto diario y de las estadísticas.

import { api } from '../../shared/api';
import type { DailyResult } from './storage';

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
