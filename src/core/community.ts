// Niveles de la comunidad: los crean los jugadores con el editor y los puede
// jugar cualquiera. El juego y el servidor usan estas mismas comprobaciones.

import { parseBoard, type Board, type Direction } from './board.ts';
import { decodeRun, replayRun } from './daily.ts';
import { elementOf, type ElementId } from './elements.ts';
import { hasLoops, solve } from './solver.ts';

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
 * Error con el motivo si no.
 */
export function checkCustomLevel(rows: unknown): CheckedLevel {
  if (!Array.isArray(rows) || !rows.every((r) => typeof r === 'string')) throw new Error('Tablero no válido');
  const { minSize, maxWidth, maxHeight } = CUSTOM_LIMITS;
  if (rows.length < minSize || rows.length > maxHeight || rows[0].length < minSize || rows[0].length > maxWidth) {
    throw new Error(`El tablero debe medir entre ${minSize}×${minSize} y ${maxWidth}×${maxHeight}`);
  }
  const board = parseBoard(rows);
  if (hasLoops(board)) throw new Error('Hay corrientes que forman un bucle sin fin');
  const solution = solve(board);
  if (!solution) throw new Error('El nivel no tiene solución');
  if (solution.length < 2) throw new Error('Demasiado fácil: se resuelve en un movimiento');

  const elements = new Set<ElementId>();
  for (const row of board.cells) {
    for (const cell of row) {
      const element = elementOf(cell);
      if (element) elements.add(element);
    }
  }
  return { board, solution, elements: [...elements] };
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
