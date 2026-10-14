import { describe, expect, it } from 'vitest';
import { boardPoints, timeAttackBoard, timeAttackLevel } from '../../../../common/logic/timeattack/timeattack';

describe('contrarreloj', () => {
  it('cada tablero es un poco más difícil, hasta un tope', () => {
    expect(timeAttackLevel(0)).toBe(4);
    expect(timeAttackLevel(5)).toBe(9);
    expect(timeAttackLevel(100)).toBe(26);
  });

  it('los tableros de una semana son los mismos para todos y cambian con la semana', () => {
    expect(timeAttackBoard('2026-10-12', 3).rows).toEqual(timeAttackBoard('2026-10-12', 3).rows);
    expect(timeAttackBoard('2026-10-12', 3).rows).not.toEqual(timeAttackBoard('2026-10-19', 3).rows);
    expect(timeAttackBoard('2026-10-12', 0).rows).not.toEqual(timeAttackBoard('2026-10-12', 1).rows);
  });

  it('los puntos suben con cada tablero superado y hay bonus en el óptimo', () => {
    expect(boardPoints(0, 6, 6)).toEqual({ points: 150, perfect: true });
    expect(boardPoints(0, 8, 6)).toEqual({ points: 100, perfect: false });
    expect(boardPoints(5, 12, 12)).toEqual({ points: 250, perfect: true });
  });

  it('saltar tableros no sube lo que valen los siguientes: cuentan los superados', () => {
    // Quien ha superado 2 (y saltado 3) cobra lo mismo que quien ha superado 2 sin saltar.
    expect(boardPoints(2, 10, 10).points).toBe(190);
  });
});
