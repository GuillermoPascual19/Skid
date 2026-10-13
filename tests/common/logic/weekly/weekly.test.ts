import { describe, expect, it } from 'vitest';
import { weekKey, weeklyLevel } from '../../../../common/logic/weekly/weekly';
import { dailyLevel } from '../../../../common/logic/daily/daily';
import { countDeadEnds } from '../../../../common/logic/engine/solver';

describe('reto semanal', () => {
  it('la semana empieza el lunes', () => {
    expect(weekKey('2026-10-12')).toBe('2026-10-12'); // Lunes.
    expect(weekKey('2026-10-18')).toBe('2026-10-12'); // Domingo.
    expect(weekKey('2026-10-19')).toBe('2026-10-19');
  });

  it('el mismo tablero toda la semana, distinto la siguiente', () => {
    expect(weeklyLevel('2026-10-12').rows).toEqual(weeklyLevel('2026-10-12').rows);
    expect(weeklyLevel('2026-10-12').rows).not.toEqual(weeklyLevel('2026-10-19').rows);
  });

  it('es más difícil que el reto diario y no tiene callejones', () => {
    const weekly = weeklyLevel('2026-10-12');
    expect(weekly.solution.length).toBeGreaterThan(dailyLevel('2026-10-12').solution.length);
    expect(countDeadEnds(weekly.board)).toBe(0);
  });
});
