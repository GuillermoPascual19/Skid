// Temporadas de las ligas: cada mes natural es una temporada. Al acabar, quien
// más puntos sumó en su liga es el campeón y se lleva el gorro de ese mes, que
// solo se consigue así.

import type { HatId } from '../../art/hats.ts';
import { monthRange, type DayRange } from '../daily/daily.ts';

/** Primera temporada que cuenta ("YYYY-MM"): las anteriores no tienen campeón. */
export const FIRST_SEASON = '2026-09';

/** Puestos que se guardan de cada temporada. */
export const PODIUM_SIZE = 3;

/** Primer mes del ranking global con podio: los de antes no tienen premio. */
export const FIRST_GLOBAL_SEASON = '2026-10';

/** Gorros del podio mensual del ranking global: 1.º, 2.º y 3.º. */
export const GLOBAL_HATS: readonly HatId[] = ['worldgold', 'worldsilver', 'worldbronze'];

/** Gorro del puesto `position` (1 a 3) del ranking global de un mes. */
export function globalHat(position: number): HatId {
  return GLOBAL_HATS[position - 1];
}

/** Gorro de cada mes, de enero a diciembre. */
export const SEASON_HATS: readonly HatId[] = [
  'scarf',
  'hearts',
  'clover',
  'umbrella',
  'flowers',
  'visor',
  'straw',
  'goggles',
  'mortarboard',
  'pumpkin',
  'leaves',
  'star',
];

/** Temporada ("YYYY-MM") del día "YYYY-MM-DD". */
export function seasonOf(day: string): string {
  return day.slice(0, 7);
}

export function isSeason(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Días de la temporada, ambos incluidos. */
export function seasonRange(season: string): DayRange {
  return monthRange(`${season}-01`);
}

/** La temporada `months` meses después (o antes, si es negativo). */
export function shiftSeason(season: string, months: number): string {
  const [y, m] = season.split('-').map(Number);
  const index = y * 12 + (m - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function seasonHat(season: string): HatId {
  return SEASON_HATS[Number(season.slice(5, 7)) - 1];
}

/**
 * Temporadas ya terminadas desde `since` (incluida) hasta la anterior a la de
 * `today`, sin contar las de antes de FIRST_SEASON.
 */
export function finishedSeasons(since: string, today: string): string[] {
  const seasons: string[] = [];
  const last = shiftSeason(seasonOf(today), -1);
  for (let s = since < FIRST_SEASON ? FIRST_SEASON : since; s <= last; s = shiftSeason(s, 1)) seasons.push(s);
  return seasons;
}

export interface SeasonTotal {
  readonly playerId: string;
  /** Suma de puntos de los retos del mes. */
  readonly points: number;
  /** Días que quedó 1.º. */
  readonly wins: number;
  /** Retos terminados en el mes. */
  readonly days: number;
}

export interface SeasonPlace {
  readonly playerId: string;
  readonly position: number;
  readonly points: number;
}

/**
 * Podio de una temporada: más puntos y, a igualdad, más días ganados. Un empate
 * comparte puesto (dos campeones si empatan en cabeza). Solo cuenta quien jugó
 * algún reto, y hace falta que jugaran al menos 2; si no, no hay campeón.
 */
export function seasonPodium(totals: readonly SeasonTotal[]): SeasonPlace[] {
  const played = totals.filter((t) => t.days > 0).sort((a, b) => b.points - a.points || b.wins - a.wins);
  if (played.length < 2) return [];
  const positions: number[] = [];
  played.forEach((t, i) => {
    const prev = played[i - 1];
    positions.push(prev && prev.points === t.points && prev.wins === t.wins ? positions[i - 1] : i + 1);
  });
  return played
    .map((t, i) => ({ playerId: t.playerId, position: positions[i], points: t.points }))
    .filter((p) => p.position <= PODIUM_SIZE);
}
