// Llamadas al servidor del reto diario y de las estadísticas.

import { api } from '../../shared/api';
import type { HatId } from '../../../../common/art/hats';
import type { DailyResult } from './storage';
import { t } from '../../i18n/i18n';

export interface ServerRun {
  /** Instantes en ms, con el reloj del servidor. */
  startedAt: number;
  finishedAt: number | null;
  moves: number | null;
  retries: number | null;
  hints: number | null;
  timeMs: number | null;
  score: number | null;
  /** Golpes por encima del óptimo; null si no ha terminado o es de antes del golf. */
  overPar: number | null;
  /** Registro ya enviado (solo si terminó): para seguir mejorando desde aquí. */
  log: string | null;
}

export async function getDaily(day: string): Promise<ServerRun | null> {
  return (await api<{ run: ServerRun | null }>('GET', `/daily/${day}`)).run;
}

/** Empieza el reto (el cronómetro del servidor arranca aquí). */
export async function startDaily(day: string): Promise<ServerRun> {
  const { run } = await api<{ run: ServerRun | null }>('POST', `/daily/${day}/start`);
  if (!run) throw new Error(t('daily.startFailed'));
  return run;
}

/** Envía el registro de la partida; el servidor lo verifica y guarda el mejor intento. */
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
  /** Retos contados por movimientos (los de antes solo tenían puntos). */
  counted: number;
  /** Retos hechos en el óptimo. */
  perfect: number;
  /** Media de movimientos por encima del óptimo (null si aún no hay ninguno). */
  averageOver: number | null;
  /** Días que quedó 1.º en alguna liga (con al menos 2 que terminaron). */
  wins: number;
  /** Últimos 30 días, del más antiguo a hoy; over null = no jugó o es de antes de contar movimientos. */
  history: { day: string; played: boolean; over: number | null; won: boolean }[];
}

export function getStats(): Promise<PlayerStats> {
  return api<PlayerStats>('GET', '/stats');
}

export interface GhostRun {
  name: string | null;
  hat: HatId | null;
  /** Movimientos del mejor intento (ver encodeRun). */
  path: string;
  hints: number;
  timeMs: number | null;
  /** null en retos de antes del golf. */
  overPar: number | null;
  score: number | null;
}

/** Tu mejor intento (null si no jugaste ese día) y el de un amigo de tus ligas. */
export function getGhost(day: string, friendId: string): Promise<{ me: GhostRun | null; friend: GhostRun }> {
  return api('GET', `/daily/${day}/ghost/${friendId}`);
}
