// Llamadas al servidor del reto semanal.

import { api } from '../../shared/api';
import type { GolfRanking } from '../ranking/golf-ranking';

export interface WeeklyRun {
  startedAt: number;
  /** Movimientos de tu mejor intento, o null si aún no lo has terminado. */
  bestMoves: number | null;
  overPar: number | null;
  bestAt: number | null;
  attempts: number;
}

export interface WeeklyInfo {
  /** Lunes de la semana ("YYYY-MM-DD"). */
  week: string;
  /** El tablero lo da el servidor (lo genera una vez por semana). */
  rows: string[];
  optimal: number;
  run: WeeklyRun | null;
  /** Tu puesto entre tus amigos (null si no lo has terminado) y cuántos lo han terminado. */
  position: number | null;
  total: number;
}

export interface WeeklyFinish {
  run: WeeklyRun;
  attemptMoves: number;
  attemptOverPar: number;
  /** Este intento es tu nueva mejor marca. */
  improved: boolean;
  position: number | null;
  total: number;
}

export function getWeekly(week: string): Promise<WeeklyInfo> {
  return api('GET', `/weekly/${week}`);
}

export function startWeekly(week: string): Promise<WeeklyInfo> {
  return api('POST', `/weekly/${week}/start`);
}

/** Envía un intento terminado (solo sus movimientos). */
export function finishWeekly(week: string, log: string): Promise<WeeklyFinish> {
  return api('POST', `/weekly/${week}/finish`, { log });
}

export function getWeeklyRanking(week: string): Promise<GolfRanking> {
  return api('GET', `/weekly/${week}/ranking`);
}
