// Llamadas al servidor de la contrarreloj.

import { api } from '../../shared/api';
import type { HatId } from '../../../../common/art/hats';

export interface TimeAttackRun {
  id: string;
  week: string;
  /** Cuándo empieza el reloj (tras la cuenta atrás) y cuándo acaba, con el reloj del servidor. */
  startedAt: number;
  deadline: number;
  /** Hora del servidor al responder (para cuadrar el reloj con el de este dispositivo). */
  serverNow: number;
  score: number;
  boards: number;
  perfect: number;
  skipped: number;
}

export interface TimeAttackBoard {
  index: number;
  rows: string[];
  optimal: number;
}

export interface TimeAttackStart {
  run: TimeAttackRun;
  board: TimeAttackBoard;
}

export interface TimeAttackSummary {
  week: string;
  /** Tu mejor partida de la semana, o null. */
  best: { score: number; boards: number; perfect: number } | null;
  /** Tu puesto entre tus amigos (null si aún no has puntuado) y cuántos han jugado. */
  position: number | null;
  total: number;
}

export interface TimeAttackRankRow {
  id: string;
  name: string | null;
  hat: HatId | null;
  position: number;
  score: number;
  boards: number;
  perfect: number;
  isMe: boolean;
}

export function getTimeAttack(week: string): Promise<TimeAttackSummary> {
  return api('GET', `/timeattack/${week}`);
}

export function timeAttackRanking(week: string): Promise<TimeAttackRankRow[]> {
  return api('GET', `/timeattack/${week}/ranking`);
}

export function startTimeAttack(week: string): Promise<TimeAttackStart> {
  return api('POST', `/timeattack/${week}/start`);
}

/** Envía el tablero en curso superado; devuelve los puntos y el siguiente tablero. */
export function finishBoard(runId: string, log: string): Promise<{ run: TimeAttackRun; points: number; perfect: boolean; board: TimeAttackBoard }> {
  return api('POST', `/timeattack/runs/${encodeURIComponent(runId)}/board`, { log });
}

/** Salta el tablero en curso (cuesta unos segundos). */
export function skipBoard(runId: string): Promise<{ run: TimeAttackRun; board: TimeAttackBoard }> {
  return api('POST', `/timeattack/runs/${encodeURIComponent(runId)}/skip`);
}

/** La partida terminada, tu mejor marca de la semana y tu puesto. */
export function timeAttackResult(runId: string): Promise<TimeAttackSummary & { run: TimeAttackRun }> {
  return api('GET', `/timeattack/runs/${encodeURIComponent(runId)}`);
}
