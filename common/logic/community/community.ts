// Niveles de la comunidad: los crean los jugadores con el editor y los puede
// jugar cualquiera. El juego y el servidor usan estas mismas comprobaciones.

import { BoardError, parseBoard, type Board, type Direction } from '../engine/board.ts';
import { decodeRun, replayRun } from '../daily/daily.ts';
import { elementsIn, type ElementId } from '../engine/elements.ts';
import { hasLoops, solve } from '../engine/solver.ts';

export const CUSTOM_LIMITS = {
  minSize: 4,
  maxWidth: 12,
  maxHeight: 12,
  maxPieces: 9,
  minName: 3,
  maxName: 30,
} as const;

export interface CheckedLevel {
  readonly board: Board;
  readonly solution: Direction[];
  /** Elementos especiales que aparecen en el tablero. */
  readonly elements: ElementId[];
}

/** Las filas viajan y se guardan unidas por '/'. */
export function encodeRows(rows: readonly string[]): string {
  return rows.join('/');
}

export function decodeRows(text: string): string[] {
  return text.split('/');
}

/**
 * Comprueba que un nivel se puede publicar: tamaño dentro de los límites,
 * tablero bien formado, con solución y sin bucles de corrientes. Lanza un
 * BoardError con el motivo si no.
 */
export function checkCustomLevel(rows: unknown): CheckedLevel {
  if (!Array.isArray(rows) || !rows.every((r) => typeof r === 'string')) throw new BoardError('invalid');
  const { minSize, maxWidth, maxHeight } = CUSTOM_LIMITS;
  if (rows.length < minSize || rows.length > maxHeight || rows[0].length < minSize || rows[0].length > maxWidth) {
    throw new BoardError('size', { min: minSize, maxWidth, maxHeight });
  }
  const board = parseBoard(rows);
  if (hasLoops(board)) throw new BoardError('loops');
  const solution = solve(board);
  if (!solution) throw new BoardError('unsolvable');
  if (solution.length < 2) throw new BoardError('tooEasy');

  return { board, solution, elements: [...elementsIn(board)] };
}

/**
 * Comprueba un registro de movimientos (solo direcciones, sin reintentos ni
 * pistas) y devuelve cuántos movimientos usó para terminar, o null si no termina.
 */
export function movesToFinish(board: Board, log: unknown): number | null {
  if (typeof log !== 'string' || log.length === 0 || log.length > 2000 || /[XH]/.test(log)) return null;
  try {
    const replay = replayRun(board, decodeRun(log));
    return replay.completed ? replay.moves : null;
  } catch {
    return null;
  }
}
