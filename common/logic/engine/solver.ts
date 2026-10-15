import { initialState, type Board, type Direction, type GameState } from './board.ts';
import { applyMove, isComplete, traceMove } from './move.ts';

const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

interface Node {
  readonly state: GameState;
  /** Índice del nodo del que se llegó a este (-1 en el inicial). */
  readonly parent: number;
  /** Movimiento que llevó hasta aquí (null en el inicial). */
  readonly dir: Direction | null;
}

/**
 * Calcula una solución óptima del tablero desde `from` (por defecto, el estado
 * inicial): la secuencia más corta de direcciones que recoge todas las piezas
 * en orden. Devuelve `null` si desde ahí no hay solución.
 */
export function solve(board: Board, from: GameState = initialState(board)): Direction[] | null {
  const start = from;
  const nodes: Node[] = [{ state: start, parent: -1, dir: null }];
  const seen = new Set<string>([stateKey(start)]);

  // `nodes` hace de cola: se recorre por índice en vez de usar shift().
  for (let i = 0; i < nodes.length; i++) {
    const { state } = nodes[i];
    if (isComplete(board, state)) return pathTo(nodes, i);

    for (const dir of DIRECTIONS) {
      const next = applyMove(board, state, dir);
      if (!next) continue; // No se desplaza: no es un movimiento.
      const key = stateKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({ state: next, parent: i, dir });
    }
  }
  return null;
}

/**
 * Cuenta los callejones sin salida: estados alcanzables desde el inicio desde
 * los que ya no se puede terminar el nivel (sin volver a empezar).
 */
export function countDeadEnds(board: Board): number {
  const start = initialState(board);
  const index = new Map<string, number>([[stateKey(start), 0]]);
  const states: GameState[] = [start];
  const predecessors: number[][] = [[]];

  for (let i = 0; i < states.length; i++) {
    if (isComplete(board, states[i])) continue;
    for (const dir of DIRECTIONS) {
      const next = applyMove(board, states[i], dir);
      if (!next) continue;
      const key = stateKey(next);
      let j = index.get(key);
      if (j === undefined) {
        j = states.length;
        index.set(key, j);
        states.push(next);
        predecessors.push([]);
      }
      predecessors[j].push(i);
    }
  }

  // Hacia atrás desde los estados finales: todo lo que llega a ellos tiene salida.
  const canFinish = new Uint8Array(states.length);
  const queue: number[] = [];
  states.forEach((state, i) => {
    if (isComplete(board, state)) {
      canFinish[i] = 1;
      queue.push(i);
    }
  });
  for (let q = 0; q < queue.length; q++) {
    for (const p of predecessors[queue[q]]) {
      if (!canFinish[p]) {
        canFinish[p] = 1;
        queue.push(p);
      }
    }
  }
  return states.length - canFinish.reduce((sum, v) => sum + v, 0);
}

/**
 * Si desde algún estado alcanzable hay un movimiento que entra en un bucle sin
 * fin (solo pasa con corrientes o espejos que se mandan unos a otros).
 */
export function hasLoops(board: Board): boolean {
  if (!board.cells.some((row) => row.some((c) => c.startsWith('arrow-') || c.startsWith('mirror-')))) return false;
  const start = initialState(board);
  const seen = new Set<string>([stateKey(start)]);
  const queue: GameState[] = [start];
  for (let i = 0; i < queue.length; i++) {
    if (isComplete(board, queue[i])) continue;
    for (const dir of DIRECTIONS) {
      const trace = traceMove(board, queue[i], dir);
      if (!trace) continue;
      if (trace.looped) return true;
      const key = stateKey(trace.state);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(trace.state);
    }
  }
  return false;
}

/**
 * Dos estados son el mismo si el jugador está en la misma casilla, lleva las
 * mismas piezas, está roto el mismo hielo, las puertas están igual y los
 * bloques ocupan las mismas casillas (da igual cuál es cuál).
 */
function stateKey(state: GameState): string {
  const blocks = state.blocks.length ? `|${state.blocks.map((b) => `${b.x}.${b.y}`).sort().join(';')}` : '';
  return `${state.player.x},${state.player.y},${state.collected},${state.broken},${state.flipped ? 1 : 0}${blocks}`;
}

/** Reconstruye las direcciones siguiendo los padres desde el nodo final hasta el inicial. */
function pathTo(nodes: readonly Node[], index: number): Direction[] {
  const dirs: Direction[] = [];
  for (let node = nodes[index]; node.dir !== null; node = nodes[node.parent]) {
    dirs.push(node.dir);
  }
  return dirs.reverse();
}
