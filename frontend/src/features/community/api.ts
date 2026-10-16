// Llamadas al servidor de los niveles de la comunidad.

import { api } from '../../shared/api';
import type { HatId } from '../../../../common/art/hats';
import type { ElementId } from '../../../../common/logic/engine/elements';
import type { GolfRanking } from '../ranking/golf-ranking';

export interface CustomLevel {
  id: string;
  name: string;
  rows: string[];
  optimal: number;
  elements: ElementId[];
  createdAt: number;
  /** null si el autor no ha elegido nombre (se muestra «Anónimo»). */
  author: string | null;
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
  /** Oculto por denuncias: solo lo ve su autor. */
  hidden: boolean;
  /** Ya lo has denunciado. */
  reported: boolean;
  /** «Me gusta» que tiene, y si le has dado el tuyo. */
  likes: number;
  liked: boolean;
  /** Lo has guardado para luego (solo lo sabes tú). */
  saved: boolean;
}

export type ReportReason = 'name' | 'broken' | 'other';

export type CustomLevelSort = 'top' | 'new' | 'mine' | 'liked' | 'saved';

export function listCustomLevels(sort: CustomLevelSort, offset = 0): Promise<{ levels: CustomLevel[]; more: boolean }> {
  return api('GET', `/levels?sort=${sort}&offset=${offset}`);
}

/** Me gusta (o quitarlo). Devuelve el nivel actualizado. */
export function likeCustomLevel(id: string, on: boolean): Promise<CustomLevel> {
  return api('PUT', `/levels/${encodeURIComponent(id)}/like`, { on });
}

/** Guardar para luego (o quitarlo de guardados). */
export function saveCustomLevel(id: string, on: boolean): Promise<CustomLevel> {
  return api('PUT', `/levels/${encodeURIComponent(id)}/save`, { on });
}

/** El nivel destacado por el administrador, o null. */
export function getFeaturedLevel(): Promise<{ level: CustomLevel | null }> {
  return api('GET', '/levels/featured');
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

export async function reportCustomLevel(id: string, reason: ReportReason): Promise<void> {
  await api('POST', `/levels/${encodeURIComponent(id)}/report`, { reason });
}

export type LevelRanking = GolfRanking;

export function getLevelRanking(id: string): Promise<LevelRanking> {
  return api('GET', `/levels/${encodeURIComponent(id)}/ranking`);
}
