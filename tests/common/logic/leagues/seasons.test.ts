import { describe, expect, it } from 'vitest';
import { HAT_IDS } from '../../../../common/art/hats';
import { ACHIEVEMENTS } from '../../../../common/logic/achievements/achievements';
import {
  FIRST_SEASON,
  SEASON_HATS,
  finishedSeasons,
  isSeason,
  seasonHat,
  seasonOf,
  seasonPodium,
  seasonRange,
  shiftSeason,
  type SeasonTotal,
} from '../../../../common/logic/leagues/seasons';

const total = (playerId: string, points: number, wins = 0, days = 1): SeasonTotal => ({ playerId, points, wins, days });

describe('fechas de las temporadas', () => {
  it('una temporada es un mes natural', () => {
    expect(seasonOf('2026-10-14')).toBe('2026-10');
    expect(seasonRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(seasonRange('2028-02').to).toBe('2028-02-29');
  });

  it('se mueve por meses cruzando de año', () => {
    expect(shiftSeason('2026-12', 1)).toBe('2027-01');
    expect(shiftSeason('2027-01', -1)).toBe('2026-12');
    expect(shiftSeason('2026-10', -14)).toBe('2025-08');
  });

  it('valida el formato', () => {
    expect(isSeason('2026-10')).toBe(true);
    expect(isSeason('2026-13')).toBe(false);
    expect(isSeason('2026-1')).toBe(false);
  });

  it('las terminadas van desde la creación (o FIRST_SEASON) hasta el mes pasado', () => {
    expect(finishedSeasons('2026-01', '2026-11-03')).toEqual([FIRST_SEASON, '2026-10']);
    expect(finishedSeasons('2026-10', '2026-10-31')).toEqual([]);
    expect(finishedSeasons('2026-10', '2027-01-01')).toEqual(['2026-10', '2026-11', '2026-12']);
  });
});

describe('gorros de temporada', () => {
  it('hay uno distinto por mes y no coincide con los de los logros', () => {
    expect(new Set(SEASON_HATS).size).toBe(12);
    const achievementHats = new Set(ACHIEVEMENTS.map((a) => a.hat));
    expect(SEASON_HATS.some((h) => achievementHats.has(h))).toBe(false);
    expect(SEASON_HATS.every((h) => HAT_IDS.includes(h))).toBe(true);
  });

  it('cada temporada da el de su mes', () => {
    expect(seasonHat('2026-10')).toBe('pumpkin');
    expect(seasonHat('2027-01')).toBe('scarf');
    expect(seasonHat('2026-12')).toBe('star');
  });
});

describe('seasonPodium', () => {
  it('ordena por puntos y se queda con los 3 primeros', () => {
    const podium = seasonPodium([total('a', 500), total('b', 900), total('c', 700), total('d', 100)]);
    expect(podium).toEqual([
      { playerId: 'b', position: 1, points: 900 },
      { playerId: 'c', position: 2, points: 700 },
      { playerId: 'a', position: 3, points: 500 },
    ]);
  });

  it('con los mismos puntos desempatan los días ganados', () => {
    expect(seasonPodium([total('a', 800, 1), total('b', 800, 3)])[0].playerId).toBe('b');
  });

  it('un empate completo comparte puesto (dos campeones)', () => {
    const podium = seasonPodium([total('a', 800, 2), total('b', 800, 2), total('c', 300)]);
    expect(podium.map((p) => p.position)).toEqual([1, 1, 3]);
  });

  it('un empate fuera del podio no se cuela', () => {
    const podium = seasonPodium([total('a', 900), total('b', 800), total('c', 700), total('d', 600), total('e', 600)]);
    expect(podium.map((p) => p.playerId)).toEqual(['a', 'b', 'c']);
  });

  it('no hay campeón si jugó menos de 2', () => {
    expect(seasonPodium([total('a', 900), total('b', 0, 0, 0)])).toEqual([]);
    expect(seasonPodium([])).toEqual([]);
  });

  it('quien no jugó no entra en el podio', () => {
    const podium = seasonPodium([total('a', 900), total('b', 400), total('c', 0, 0, 0)]);
    expect(podium.map((p) => p.playerId)).toEqual(['a', 'b']);
  });
});
