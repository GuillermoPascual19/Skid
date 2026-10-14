// Llamadas al servidor de las ligas y el ranking.

import { api } from '../../shared/api';
import type { HatId } from '../../../../common/art/hats';
import type { ReactionId } from '../../../../common/logic/leagues/reactions';

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

/** Nombre y miembros de la liga de un código, para confirmar antes de unirse. */
export function leagueInvite(code: string): Promise<{ name: string; members: number; alreadyMember: boolean }> {
  return api('GET', `/leagues/invite/${encodeURIComponent(code.trim())}`);
}

export async function leaveLeague(id: string): Promise<void> {
  await api('POST', `/leagues/${encodeURIComponent(id)}/leave`);
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
  /** Golpes por encima del óptimo; null en retos de antes del golf (solo puntos). */
  overPar: number | null;
  /** Reacciones que recibió ese día de los miembros de la liga, las más repetidas primero. */
  reactions: { id: ReactionId; n: number }[];
  /** La que le pusiste tú (null si ninguna). */
  myReaction: ReactionId | null;
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

export interface SeasonPlace {
  id: string;
  name: string | null;
  hat: HatId | null;
  /** 1 es el campeón (puede haber varios si empataron). */
  position: number;
  points: number;
  isMe: boolean;
}

export interface LeagueSeason {
  /** Temporada en curso ("YYYY-MM"). */
  season: string;
  /** Último día de la temporada en curso. */
  ends: string;
  /** Gorro que gana el campeón este mes. */
  hat: HatId;
  /** La temporada pasada, o null si la liga no la jugó. */
  previous: { season: string; hat: HatId; podium: SeasonPlace[] } | null;
}

export function leagueSeason(leagueId: string): Promise<LeagueSeason> {
  return api<LeagueSeason>('GET', `/leagues/${encodeURIComponent(leagueId)}/season`);
}

/** Clasificación de una liga entre dos días (ambos incluidos). */
export function leagueStandings(leagueId: string, from: string, to: string): Promise<StandingRow[]> {
  return api<StandingRow[]>('GET', `/leagues/${encodeURIComponent(leagueId)}/standings?from=${from}&to=${to}`);
}

export function leagueRanking(leagueId: string, day: string): Promise<RankingRow[]> {
  return api<RankingRow[]>('GET', `/leagues/${encodeURIComponent(leagueId)}/ranking?day=${day}`);
}

/** Pone, cambia o quita (null) tu reacción al reto de `day` de un amigo. */
export async function react(day: string, playerId: string, reaction: ReactionId | null): Promise<void> {
  await api('PUT', `/daily/${day}/reactions/${encodeURIComponent(playerId)}`, { reaction });
}

export interface ReceivedReaction {
  name: string | null;
  hat: HatId | null;
  reaction: ReactionId;
  /** Día del reto al que reaccionaron. */
  day: string;
  /** Cuándo (ms). */
  at: number;
}

/** Reacciones recibidas después de `since` (ms), las más nuevas primero (como mucho 20). */
export function newReactions(since: number): Promise<ReceivedReaction[]> {
  return api<ReceivedReaction[]>('GET', `/reactions?since=${since}`);
}
