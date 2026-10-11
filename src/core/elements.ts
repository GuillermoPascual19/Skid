// Elementos especiales del tablero. Aparecen en el modo libre a partir de su
// nivel de desbloqueo (y desde entonces se pueden usar en el editor). El reto
// diario usa un nivel más bajo, así que sus tableros no cambian.

import { initialState, type Board, type Cell, type Direction } from './board.ts';
import { traceMove } from './move.ts';

export type ElementId = 'snow' | 'arrow' | 'portal' | 'hole';

export interface ElementDef {
  readonly id: ElementId;
  /** Nivel del modo libre a partir del cual aparece. */
  readonly level: number;
  readonly name: string;
  readonly description: string;
}

/** En orden de desbloqueo. */
export const ELEMENTS: readonly ElementDef[] = [
  { id: 'snow', level: 15, name: 'Nieve blanda', description: 'El pingüino se frena y se para encima.' },
  { id: 'arrow', level: 30, name: 'Corrientes', description: 'Al pasar por encima, el pingüino gira hacia donde apunta la flecha y sigue deslizando.' },
  { id: 'portal', level: 45, name: 'Teletransportes', description: 'Entras por uno, sales por su pareja y sigues deslizando en la misma dirección.' },
  { id: 'hole', level: 60, name: 'Agujeros', description: 'Si caes al agua vuelves a la salida, pero conservas las piezas que llevas.' },
];

/** Elementos que pueden salir en el nivel `level`. */
export function unlockedElements(level: number): ElementId[] {
  return ELEMENTS.filter((e) => level >= e.level).map((e) => e.id);
}

/** Elemento al que pertenece una casilla (null si es hielo o muro). */
export function elementOf(cell: Cell): ElementId | null {
  if (cell === 'snow' || cell === 'portal' || cell === 'hole') return cell;
  if (cell.startsWith('arrow-')) return 'arrow';
  return null;
}

/** Elementos por los que pasa (y que le afectan) el recorrido de una solución. */
export function elementsUsed(board: Board, solution: readonly Direction[]): Set<ElementId> {
  const used = new Set<ElementId>();
  let state = initialState(board);
  for (const dir of solution) {
    const trace = traceMove(board, state, dir);
    if (!trace) break;
    for (const step of trace.steps) {
      if (step.kind !== 'slide') continue;
      const element = elementOf(board.cells[step.pos.y][step.pos.x]);
      if (element) used.add(element);
    }
    state = trace.state;
  }
  return used;
}
