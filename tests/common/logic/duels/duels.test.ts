import { describe, expect, it } from 'vitest';
import { duelLevel, duelVerdict, duelWinner, isDuelDifficulty } from '../../../../common/logic/duels/duels';
import { countDeadEnds } from '../../../../common/logic/engine/solver';

describe('duelos', () => {
  it('cada dificultad da tableros más largos que la anterior, sin callejones', () => {
    const moves = (['easy', 'medium', 'hard'] as const).map((d) => {
      const level = duelLevel(d, 12345);
      expect(countDeadEnds(level.board)).toBe(0);
      return level.solution.length;
    });
    expect(moves[0]).toBeLessThan(moves[2]);
  });

  it('la misma semilla da el mismo tablero', () => {
    expect(duelLevel('medium', 42).rows).toEqual(duelLevel('medium', 42).rows);
  });

  it('valida la dificultad', () => {
    expect(isDuelDifficulty('hard')).toBe(true);
    expect(isDuelDifficulty('imposible')).toBe(false);
    expect(isDuelDifficulty('constructor')).toBe(false);
  });

  it('gana quien hace menos movimientos y, a igualdad, quien tarda menos', () => {
    expect(duelWinner({ moves: 12, timeMs: 90_000 }, { moves: 13, timeMs: 10_000 })).toBe('a');
    expect(duelWinner({ moves: 12, timeMs: 90_000 }, { moves: 12, timeMs: 60_000 })).toBe('b');
    expect(duelWinner({ moves: 12, timeMs: 60_000 }, { moves: 12, timeMs: 60_000 })).toBe('draw');
  });

  it('quien no lo termina pierde; si ninguno, empate', () => {
    expect(duelWinner(null, { moves: 30, timeMs: 1 })).toBe('b');
    expect(duelWinner({ moves: 30, timeMs: 1 }, null)).toBe('a');
    expect(duelWinner(null, null)).toBe('draw');
  });

  it('dice qué decidió el duelo', () => {
    expect(duelVerdict({ moves: 12, timeMs: 90_000 }, { moves: 13, timeMs: 10_000 })).toEqual({ winner: 'a', by: 'moves' });
    expect(duelVerdict({ moves: 12, timeMs: 90_000 }, { moves: 12, timeMs: 60_000 })).toEqual({ winner: 'b', by: 'time' });
    expect(duelVerdict(null, { moves: 30, timeMs: 1 })).toEqual({ winner: 'b', by: 'noShow' });
    expect(duelVerdict({ moves: 12, timeMs: 1 }, { moves: 12, timeMs: 1 })).toEqual({ winner: 'draw', by: null });
  });
});
