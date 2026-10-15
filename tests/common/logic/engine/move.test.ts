import { describe, expect, it } from 'vitest';
import { EXAMPLE_BOARD, initialState, parseBoard, type GameState } from '../../../../common/logic/engine/board';
import { dailyLevel } from '../../../../common/logic/daily/daily';
import { applyMove, isComplete } from '../../../../common/logic/engine/move';
import { countDeadEnds, solve } from '../../../../common/logic/engine/solver';

describe('applyMove', () => {
  it('se desliza hasta el muro', () => {
    const board = parseBoard(['#@....#', '#.....1']);
    expect(applyMove(board, initialState(board), 'right')?.player).toEqual({ x: 5, y: 0 });
  });

  it('se para antes de una pieza que no toca', () => {
    const board = parseBoard(['@..2.1']);
    expect(applyMove(board, initialState(board), 'right')).toEqual({ player: { x: 2, y: 0 }, collected: 0, broken: 0 });
  });

  it('recoge la que toca y sigue, también la siguiente en la misma línea', () => {
    const board = parseBoard(['@.1.2..#3']);
    expect(applyMove(board, initialState(board), 'right')).toEqual({ player: { x: 6, y: 0 }, collected: 2, broken: 0 });
  });

  it('devuelve null si no se desplaza y no muta el estado', () => {
    const board = parseBoard(['#@.1']);
    const state = initialState(board);
    expect(applyMove(board, state, 'left')).toBeNull();
    applyMove(board, state, 'right');
    expect(state).toEqual({ player: { x: 1, y: 0 }, collected: 0, broken: 0 });
  });

  it('isComplete al recoger la última', () => {
    const board = parseBoard(['@.1']);
    expect(isComplete(board, applyMove(board, initialState(board), 'right')!)).toBe(true);
  });
});

describe('solve', () => {
  it('encuentra el óptimo del tablero de ejemplo', () => {
    expect(solve(parseBoard(EXAMPLE_BOARD))).toHaveLength(11);
  });

  it('devuelve null si no hay solución', () => {
    expect(solve(parseBoard(['@#1']))).toBeNull();
  });
});

describe('countDeadEnds', () => {
  it('coincide con el solver: cuenta justo las posiciones alcanzables sin solución', () => {
    // El reto del 2026-10-07 se generó antes de descartar callejones.
    const { board } = dailyLevel('2026-10-07');
    const seen = new Map<string, GameState>();
    const queue: GameState[] = [initialState(board)];
    for (let i = 0; i < queue.length; i++) {
      const state = queue[i];
      const key = `${state.player.x},${state.player.y},${state.collected}`;
      if (seen.has(key)) continue;
      seen.set(key, state);
      if (isComplete(board, state)) continue;
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        const next = applyMove(board, state, dir);
        if (next) queue.push(next);
      }
    }
    const withoutExit = [...seen.values()].filter((s) => solve(board, s) === null).length;
    expect(withoutExit).toBeGreaterThan(0);
    expect(countDeadEnds(board)).toBe(withoutExit);
  });

  it('cero si siempre se puede terminar', () => {
    expect(countDeadEnds(parseBoard(['@.1']))).toBe(0);
  });

  it('solve puede partir de cualquier estado', () => {
    const board = parseBoard(['#####', '#@.1#', '#.###', '#.###', '#####']);
    expect(solve(board, { player: { x: 1, y: 3 }, collected: 0, broken: 0 })).toEqual(['up', 'right']);
  });
});
