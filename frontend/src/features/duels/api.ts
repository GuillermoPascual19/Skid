// Llamadas al servidor de los duelos.

import { api } from '../../shared/api';
import type { HatId } from '../../../../common/art/hats';
import type { DuelDifficulty } from '../../../../common/logic/duels/duels';
import type { GhostRun } from '../daily/api';

export interface Friend {
  id: string;
  name: string;
  hat: HatId | null;
}

/** Un jugador del duelo. Las marcas del rival son null hasta que el duelo termina. */
export interface DuelSide {
  id: string;
  /** null si no ha elegido nombre (se muestra «Anónimo»). */
  name: string | null;
  hat: HatId | null;
  /** Está en la sala ahora mismo. */
  present: boolean;
  started: boolean;
  /** Ha terminado el tablero. */
  finished: boolean;
  /** Ha terminado su intento (ya no juega más). */
  handedIn: boolean;
  moves: number | null;
  timeMs: number | null;
  overPar: number | null;
  attempts: number | null;
}

export interface Duel {
  id: string;
  difficulty: DuelDifficulty;
  optimal: number;
  rows: string[];
  createdAt: number;
  expiresAt: number;
  /** Cuándo empieza (o empezó) la partida, con el reloj del servidor; null si aún no han coincidido en la sala. */
  startsAt: number | null;
  /** Hora del servidor al responder (para cuadrar la cuenta atrás con el reloj de este dispositivo). */
  serverNow: number;
  role: 'challenger' | 'opponent';
  /**
   * open: nadie ha aceptado el enlace · waiting: aún no habéis coincidido en la sala ·
   * playing: empezado (o en la cuenta atrás) · finished: terminasteis los dos o se acabó el tiempo · declined.
   */
  status: 'open' | 'waiting' | 'playing' | 'finished' | 'declined';
  me: DuelSide;
  /** null si es un duelo abierto que nadie ha aceptado. */
  rival: DuelSide | null;
  outcome: 'win' | 'lose' | 'draw' | null;
  /** Qué decidió el duelo: menos movimientos, el tiempo (a igualdad) o que uno no terminó. */
  decidedBy: 'moves' | 'time' | 'noShow' | null;
}

/** Lo que ve quien abre el enlace de un duelo abierto (el tablero, al aceptarlo). */
export interface DuelInvite {
  id: string;
  difficulty: DuelDifficulty;
  expiresAt: number;
  challenger: { name: string | null; hat: HatId | null };
}

export function listFriends(): Promise<Friend[]> {
  return api('GET', '/friends');
}

export function listDuels(): Promise<Duel[]> {
  return api('GET', '/duels');
}

/** Reta a un amigo de tus ligas, o crea un duelo abierto para compartir por enlace (`opponentId` null). */
export function createDuel(difficulty: DuelDifficulty, opponentId: string | null): Promise<Duel> {
  return api('POST', '/duels', { difficulty, opponentId });
}

export function getDuel(id: string): Promise<{ duel: Duel | null; invite: DuelInvite | null }> {
  return api('GET', `/duels/${encodeURIComponent(id)}`);
}

export function acceptDuel(id: string): Promise<Duel> {
  return api('POST', `/duels/${encodeURIComponent(id)}/accept`);
}

export function declineDuel(id: string): Promise<Duel> {
  return api('POST', `/duels/${encodeURIComponent(id)}/decline`);
}

/** Sigues en la sala; cuando estáis los dos, el servidor fija la hora de empezar. */
export function duelHere(id: string): Promise<Duel> {
  return api('POST', `/duels/${encodeURIComponent(id)}/here`);
}

export function finishDuel(id: string, log: string): Promise<{ duel: Duel; attemptMoves: number; improved: boolean }> {
  return api('POST', `/duels/${encodeURIComponent(id)}/finish`, { log });
}

export function getDuelGhost(id: string): Promise<{ me: GhostRun | null; friend: GhostRun }> {
  return api('GET', `/duels/${encodeURIComponent(id)}/ghost`);
}
