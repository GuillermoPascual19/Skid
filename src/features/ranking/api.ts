// Llamadas al servidor de las ligas y el ranking.

import { api } from '../../shared/api';
import type { HatId } from '../../art/hats';

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
