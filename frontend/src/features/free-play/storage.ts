// Progreso del modo libre guardado en el navegador: nivel, hitos celebrados y
// elementos del tablero ya presentados.

import { read, write } from '../../shared/storage';

const PROGRESS_KEY = 'skid.progress.v1';
const MILESTONES_KEY = 'skid.milestones.v1';
const ELEMENTS_SEEN_KEY = 'skid.elementsSeen.v1';
const HINTS_KEY = 'skid.freeHints.v1';

export interface Progress {
  readonly seed: number;
  readonly level: number;
}

/**
 * Semilla y nivel con los que empezar el modo niveles:
 * `?seed=123` en la URL (desde el nivel 1), si no el progreso guardado, si no uno nuevo.
 */
export function startingProgress(): Progress {
  const param = new URLSearchParams(window.location.search).get('seed');
  if (param !== null && /^\d+$/.test(param)) return { seed: Number(param) >>> 0, level: 1 };
  const saved = read<Progress>(PROGRESS_KEY);
  if (saved && Number.isInteger(saved.seed) && Number.isInteger(saved.level) && saved.level >= 1) return saved;
  return { seed: Math.floor(Math.random() * 2 ** 32), level: 1 };
}

export function saveProgress(progress: Progress): void {
  write(PROGRESS_KEY, progress);
}

/** Niveles del modo libre que se celebran al superarlos. */
export const MILESTONES: readonly number[] = [25, 50, 75, 100];

/** Marca un hito como celebrado. Devuelve false si ya se había celebrado antes. */
export function claimMilestone(level: number): boolean {
  const seen = read<number[]>(MILESTONES_KEY) ?? [];
  if (seen.includes(level)) return false;
  write(MILESTONES_KEY, [...seen, level]);
  return true;
}

/** Marca como presentado un elemento del tablero. Devuelve false si ya se había presentado. */
export function claimElementIntro(id: string): boolean {
  const seen = read<string[]>(ELEMENTS_SEEN_KEY) ?? [];
  if (seen.includes(id)) return false;
  write(ELEMENTS_SEEN_KEY, [...seen, id]);
  return true;
}

/** Pistas usadas en el nivel `level` (las de otro nivel no cuentan: se recargan al pasar de nivel). */
export function hintsUsed(level: number): number {
  const saved = read<{ level: number; used: number }>(HINTS_KEY);
  return saved?.level === level ? saved.used : 0;
}

export function saveHintsUsed(level: number, used: number): void {
  write(HINTS_KEY, { level, used });
}
