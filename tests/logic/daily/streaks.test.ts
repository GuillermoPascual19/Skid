import { describe, expect, it } from 'vitest';
import { shiftDay } from '../../../src/logic/daily/daily';
import { streaks } from '../../../src/logic/daily/streaks';

describe('streaks', () => {
  const today = '2026-10-08';

  it('sin partidas, todo a cero', () => {
    expect(streaks([], today)).toEqual({ current: 0, best: 0, playedToday: false, freezes: 0, frozenDays: [], lastFreezeEarned: null });
  });

  it('cuenta los días seguidos hasta hoy', () => {
    expect(streaks(['2026-10-06', '2026-10-07', '2026-10-08'], today)).toMatchObject({ current: 3, best: 3, playedToday: true, freezes: 0 });
  });

  it('si el último fue ayer, la racha sigue viva (aún se puede jugar hoy)', () => {
    expect(streaks(['2026-10-06', '2026-10-07'], today)).toMatchObject({ current: 2, best: 2, playedToday: false });
  });

  it('si el último fue anteayer, la racha se ha perdido pero queda la mejor', () => {
    expect(streaks(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-06'], today)).toMatchObject({
      current: 0,
      best: 3,
      playedToday: false,
    });
  });

  it('un hueco corta la racha; el orden y los repetidos dan igual', () => {
    expect(streaks(['2026-10-08', '2026-10-05', '2026-10-07', '2026-10-07', '2026-10-04'], today)).toMatchObject({
      current: 2,
      best: 2,
      playedToday: true,
    });
  });

  it('cruza meses y años', () => {
    expect(streaks(['2026-12-30', '2026-12-31', '2027-01-01'], '2027-01-01')).toMatchObject({ current: 3, best: 3 });
    expect(streaks(['2026-09-30', '2026-10-01'], '2026-10-01')).toMatchObject({ current: 2 });
  });

  describe('protectores', () => {
    /** `n` días seguidos terminando en `last`. */
    const run = (last: string, n: number) => Array.from({ length: n }, (_, i) => shiftDay(last, i - n + 1));

    it('se gana uno cada 7 días seguidos, como mucho 2', () => {
      expect(streaks(run(today, 6), today).freezes).toBe(0);
      expect(streaks(run(today, 7), today)).toMatchObject({ freezes: 1, lastFreezeEarned: today });
      expect(streaks(run(today, 14), today).freezes).toBe(2);
      expect(streaks(run(today, 21), today)).toMatchObject({ freezes: 2, lastFreezeEarned: shiftDay(today, -7) });
    });

    it('un día sin jugar gasta uno y la racha sigue (sin sumar ese día)', () => {
      const days = [...run('2026-10-06', 7), '2026-10-08'];
      expect(streaks(days, today)).toMatchObject({ current: 8, best: 8, freezes: 0, frozenDays: ['2026-10-07'] });
    });

    it('ayer sin jugar: hoy la racha sigue viva gracias al protector', () => {
      expect(streaks(run('2026-10-06', 7), today)).toMatchObject({ current: 7, freezes: 0, frozenDays: ['2026-10-07'], playedToday: false });
    });

    it('si el hueco es mayor que los protectores, se rompe y se pierden', () => {
      const days = [...run('2026-10-01', 7), '2026-10-04', '2026-10-05'];
      expect(streaks(days, '2026-10-05')).toMatchObject({ current: 2, best: 7, freezes: 0, frozenDays: [] });
      expect(streaks(run('2026-10-01', 14), today)).toMatchObject({ current: 0, freezes: 0 }); // 2 protectores, 6 días sin jugar.
    });

    it('con dos protectores se cubren dos días seguidos', () => {
      const days = [...run('2026-10-05', 14), '2026-10-08'];
      expect(streaks(days, today)).toMatchObject({ current: 15, freezes: 0, frozenDays: ['2026-10-06', '2026-10-07'] });
    });
  });
});
