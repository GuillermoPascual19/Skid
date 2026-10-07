import { describe, expect, it } from 'vitest';
import { streaks } from '../src/core/stats';

describe('streaks', () => {
  const today = '2026-10-08';

  it('sin partidas, todo a cero', () => {
    expect(streaks([], today)).toEqual({ current: 0, best: 0, playedToday: false });
  });

  it('cuenta los días seguidos hasta hoy', () => {
    expect(streaks(['2026-10-06', '2026-10-07', '2026-10-08'], today)).toEqual({ current: 3, best: 3, playedToday: true });
  });

  it('si el último fue ayer, la racha sigue viva (aún se puede jugar hoy)', () => {
    expect(streaks(['2026-10-06', '2026-10-07'], today)).toEqual({ current: 2, best: 2, playedToday: false });
  });

  it('si el último fue anteayer, la racha se ha perdido pero queda la mejor', () => {
    expect(streaks(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-06'], today)).toEqual({
      current: 0,
      best: 3,
      playedToday: false,
    });
  });

  it('un hueco corta la racha; el orden y los repetidos dan igual', () => {
    expect(streaks(['2026-10-08', '2026-10-05', '2026-10-07', '2026-10-07', '2026-10-04'], today)).toEqual({
      current: 2,
      best: 2,
      playedToday: true,
    });
  });

  it('cruza meses y años', () => {
    expect(streaks(['2026-12-30', '2026-12-31', '2027-01-01'], '2027-01-01')).toMatchObject({ current: 3, best: 3 });
    expect(streaks(['2026-09-30', '2026-10-01'], '2026-10-01')).toMatchObject({ current: 2 });
  });
});
