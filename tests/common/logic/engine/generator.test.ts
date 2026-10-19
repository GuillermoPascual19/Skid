import { describe, expect, it } from 'vitest';
import { initialState } from '../../../../common/logic/engine/board';
import { difficultyFor, generateLevel } from '../../../../common/logic/engine/generator';
import { applyMove, isComplete } from '../../../../common/logic/engine/move';
import { countDeadEnds, solve } from '../../../../common/logic/engine/solver';

describe('difficultyFor', () => {
  it('nunca baja al subir de nivel', () => {
    for (let level = 1; level < 40; level++) {
      const a = difficultyFor(level);
      const b = difficultyFor(level + 1);
      expect(b.width).toBeGreaterThanOrEqual(a.width);
      expect(b.height).toBeGreaterThanOrEqual(a.height);
      expect(b.pieces).toBeGreaterThanOrEqual(a.pieces);
      expect(b.minMoves).toBeGreaterThanOrEqual(a.minMoves);
      expect(b.pieces).toBeLessThanOrEqual(9); // Las piezas son un solo dígito.
    }
  });
});

describe('generateLevel', () => {
  it('es determinista por semilla y nivel', () => {
    expect(generateLevel(5, 123).rows).toEqual(generateLevel(5, 123).rows);
    expect(generateLevel(5, 123).rows).not.toEqual(generateLevel(5, 124).rows);
    expect(generateLevel(5, 123).rows).not.toEqual(generateLevel(6, 123).rows);
  });

  it('genera niveles resolubles con su solución óptima', () => {
    for (const level of [1, 4, 8, 12, 20]) {
      for (const seed of [1, 2, 3]) {
        const { board, solution } = generateLevel(level, seed);
        const d = difficultyFor(level);
        expect(board.width).toBe(d.width);
        expect(board.height).toBe(d.height);
        expect(board.pieces).toHaveLength(d.pieces);

        // La solución guardada es válida...
        let state = initialState(board);
        for (const dir of solution) {
          const next = applyMove(board, state, dir);
          expect(next).not.toBeNull();
          state = next!;
        }
        expect(isComplete(board, state)).toBe(true);
        // ...es la óptima...
        expect(solve(board)).toHaveLength(solution.length);
        // ...y no hay forma de quedarse atascado.
        expect(countDeadEnds(board)).toBe(0);
      }
    }
  });

  it('el óptimo crece con el nivel', () => {
    const avg = (level: number) => [1, 2, 3, 4, 5].reduce((sum, seed) => sum + generateLevel(level, seed).solution.length, 0) / 5;
    expect(avg(10)).toBeGreaterThan(avg(1));
    expect(avg(20)).toBeGreaterThan(avg(10));
  });
});
