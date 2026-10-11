import { describe, expect, it } from 'vitest';
import { parseBoard } from '../src/core/board';
import { checkCustomLevel, decodeRows, encodeRows, movesToFinish } from '../src/core/community';
import { encodeRun } from '../src/core/daily';

const LEVEL = ['@...', '....', '..*.', '...1', '2...'];

describe('checkCustomLevel', () => {
  it('acepta un nivel con solución y dice qué elementos usa', () => {
    const checked = checkCustomLevel(LEVEL);
    expect(checked.solution.length).toBeGreaterThanOrEqual(2);
    expect(checked.elements).toEqual(['snow']);
  });

  it('rechaza tamaños fuera de los límites', () => {
    expect(() => checkCustomLevel(['@1.', '...', '...'])).toThrow(/entre 4×4/);
    expect(() => checkCustomLevel(Array(13).fill('@'.padEnd(5, '.')))).toThrow(/entre/);
  });

  it('rechaza lo que no es una lista de filas', () => {
    expect(() => checkCustomLevel('@...')).toThrow(/no válido/);
    expect(() => checkCustomLevel([1, 2, 3, 4])).toThrow(/no válido/);
  });

  it('rechaza tableros sin solución, de un movimiento o con bucles', () => {
    expect(() => checkCustomLevel(['@#..', '##..', '....', '...1'])).toThrow(/no tiene solución/);
    expect(() => checkCustomLevel(['@..1', '....', '....', '....'])).toThrow(/un movimiento/);
    expect(() => checkCustomLevel(['>..v.', '.....', '^..<.', '@....', '.1...'])).toThrow(/bucle/);
  });

  it('los errores del tablero llegan tal cual (sin pingüino, teletransporte sin pareja)', () => {
    expect(() => checkCustomLevel(['....', '....', '....', '...1'])).toThrow(/jugador/);
    expect(() => checkCustomLevel(['@a..', '....', '....', '...1'])).toThrow(/pareja/);
  });
});

describe('movesToFinish', () => {
  const board = parseBoard(LEVEL);
  const solution = checkCustomLevel(LEVEL).solution;

  it('cuenta los movimientos de un registro que termina el nivel', () => {
    expect(movesToFinish(board, encodeRun(solution))).toBe(solution.length);
  });

  it('null si no termina, si trae reintentos o pistas, o si no es un registro', () => {
    expect(movesToFinish(board, encodeRun(solution.slice(0, -1)))).toBeNull();
    expect(movesToFinish(board, `X${encodeRun(solution)}`)).toBeNull();
    expect(movesToFinish(board, `H${encodeRun(solution)}`)).toBeNull();
    expect(movesToFinish(board, 'ZZZ')).toBeNull();
    expect(movesToFinish(board, 42)).toBeNull();
    expect(movesToFinish(board, '')).toBeNull();
  });
});

it('las filas se guardan unidas por /', () => {
  expect(decodeRows(encodeRows(LEVEL))).toEqual(LEVEL);
});
