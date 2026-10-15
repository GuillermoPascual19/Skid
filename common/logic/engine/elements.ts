// Elementos especiales del tablero. Aparecen en el modo libre a partir de su
// nivel de desbloqueo (y desde entonces se pueden usar en el editor). El reto
// diario usa un nivel más bajo, así que sus tableros no cambian.

import { initialState, type Board, type Cell, type Direction } from './board.ts';
import { traceMove } from './move.ts';

export type ElementId = 'snow' | 'arrow' | 'portal' | 'hole' | 'crack' | 'mirror' | 'oneway' | 'switch' | 'block';

/** El nombre y la descripción de cada elemento están en los diccionarios del juego (elements.<id>). */
export interface ElementDef {
  readonly id: ElementId;
  /** Nivel del modo libre a partir del cual aparece. */
  readonly level: number;
}

/** En orden de desbloqueo. */
export const ELEMENTS: readonly ElementDef[] = [
  { id: 'snow', level: 15 },
  { id: 'arrow', level: 30 },
  { id: 'portal', level: 45 },
  { id: 'hole', level: 60 },
  { id: 'crack', level: 75 },
  { id: 'mirror', level: 90 },
  { id: 'oneway', level: 105 },
  { id: 'switch', level: 120 },
  { id: 'block', level: 135 },
];

/** Elementos que pueden salir en el nivel `level`. */
export function unlockedElements(level: number): ElementId[] {
  return ELEMENTS.filter((e) => level >= e.level).map((e) => e.id);
}

/** Elemento al que pertenece una casilla (null si es hielo o muro). Los bloques no son casillas: ver elementsIn. */
export function elementOf(cell: Cell): ElementId | null {
  if (cell === 'snow' || cell === 'portal' || cell === 'hole' || cell === 'crack' || cell === 'switch') return cell;
  if (cell === 'door-open' || cell === 'door-closed') return 'switch';
  if (cell.startsWith('arrow-')) return 'arrow';
  if (cell.startsWith('mirror-')) return 'mirror';
  if (cell.startsWith('oneway-')) return 'oneway';
  return null;
}

/** Elementos que aparecen en el tablero (con los bloques). */
export function elementsIn(board: Board): Set<ElementId> {
  const found = new Set<ElementId>();
  for (const row of board.cells) {
    for (const cell of row) {
      const element = elementOf(cell);
      if (element) found.add(element);
    }
  }
  if (board.blocks.length > 0) found.add('block');
  return found;
}

/** Elementos por los que pasa (y que le afectan) el recorrido de una solución. */
export function elementsUsed(board: Board, solution: readonly Direction[]): Set<ElementId> {
  const used = new Set<ElementId>();
  let state = initialState(board);
  for (const dir of solution) {
    const trace = traceMove(board, state, dir);
    if (!trace) break;
    for (const step of trace.steps) {
      if (step.kind === 'push') used.add('block');
      if (step.kind !== 'slide') continue;
      const element = elementOf(board.cells[step.pos.y][step.pos.x]);
      if (element) used.add(element);
    }
    state = trace.state;
  }
  return used;
}
