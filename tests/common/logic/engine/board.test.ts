import { describe, expect, it } from 'vitest';
import { EXAMPLE_BOARD, isWall, parseBoard } from '../../../../common/logic/engine/board';

describe('parseBoard', () => {
  it('lee dimensiones, muros, jugador y piezas', () => {
    const board = parseBoard([
      '#####',
      '#@.2#',
      '#1..#',
      '#####',
    ]);

    expect(board.width).toBe(5);
    expect(board.height).toBe(4);
    expect(board.start).toEqual({ x: 1, y: 1 });
    expect(board.pieces).toEqual([
      { order: 1, pos: { x: 1, y: 2 } },
      { order: 2, pos: { x: 3, y: 1 } },
    ]);
    expect(board.cells[0][0]).toBe('wall');
    expect(board.cells[1][1]).toBe('ice'); // bajo el jugador hay hielo
    expect(board.cells[1][3]).toBe('ice'); // bajo una pieza hay hielo
  });

  it('acepta el tablero de ejemplo', () => {
    const board = parseBoard(EXAMPLE_BOARD);
    expect(board.pieces.map((p) => p.order)).toEqual([1, 2, 3, 4]);
  });

  it('trata como muro lo que está fuera del tablero', () => {
    const board = parseBoard(['@1']);
    expect(isWall(board, { x: -1, y: 0 })).toBe(true);
    expect(isWall(board, { x: 2, y: 0 })).toBe(true);
    expect(isWall(board, { x: 1, y: 0 })).toBe(false);
  });

  it.each([
    ['filas de distinta longitud', ['#@1#', '#..']],
    ['sin jugador', ['#1.#']],
    ['dos jugadores', ['@1@']],
    ['sin piezas', ['#@.#']],
    ['pieza repetida', ['@11']],
    ['hueco en la numeración', ['@13']],
    ['carácter desconocido', ['@1x']],
  ])('rechaza tableros con %s', (_, rows) => {
    expect(() => parseBoard(rows)).toThrow();
  });
});
