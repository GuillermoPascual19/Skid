import {
  DIRECTION_DELTA,
  cellAt,
  crackIndex,
  portalExit,
  samePos,
  type Board,
  type Direction,
  type GameState,
  type Pos,
} from './board.ts';

/** Un paso del recorrido de un deslizamiento (para animarlo). */
export interface Step {
  /** Casilla en la que acaba este paso. */
  readonly pos: Pos;
  /**
   * slide: avanza una casilla. teleport: sale por la pareja del teletransporte
   * en el que acaba de entrar. fall: cae al agua y reaparece en la salida.
   */
  readonly kind: 'slide' | 'teleport' | 'fall';
  /** Dirección en la que se mueve tras este paso. */
  readonly dir: Direction;
  /** Recoge en este paso la pieza que tocaba. */
  readonly collects: boolean;
  /** Rompe en este paso el hielo frágil de la casilla. */
  readonly breaks: boolean;
}

export interface MoveTrace {
  readonly state: GameState;
  readonly steps: readonly Step[];
  /**
   * El recorrido entraba en un bucle sin fin (corrientes que se mandan unas a
   * otras): el pingüino se para donde lo detecta. El generador descarta esos tableros.
   */
  readonly looped: boolean;
}

/**
 * Desliza al jugador hacia `dir` hasta que algo lo pare. Si recibe `steps`,
 * apunta en él el recorrido. Es el núcleo de applyMove y traceMove: así el
 * juego, el solver y la animación siguen exactamente la misma regla.
 */
function slide(board: Board, state: GameState, dir: Direction, steps: Step[] | null): { player: Pos; collected: number; broken: number; moved: boolean; looped: boolean } {
  let delta = DIRECTION_DELTA[dir];
  let pos: Pos = state.player;
  let collected = state.collected;
  let broken = state.broken;
  let moved = false;
  // Cada casilla con cada dirección, cada número de piezas y cada número de
  // casillas de hielo frágil rotas, una vez como mucho: pasar de ahí solo puede ser un bucle.
  let budget = board.width * board.height * 4 * (board.pieces.length + 1) * (board.cracks.length + 1);

  // Al recoger la última pieza el nivel termina, así que se deja de deslizar.
  while (collected < board.pieces.length) {
    if (--budget < 0) return { player: pos, collected, broken, moved, looped: true };
    const next: Pos = { x: pos.x + delta.x, y: pos.y + delta.y };
    const cell = cellAt(board, next);
    if (cell === 'wall') break;

    // -1 si no hay pieza; < collected si ya se recogió (ahora es hielo).
    const pieceIndex = board.pieces.findIndex((p) => samePos(p.pos, next));
    if (pieceIndex > collected) break; // Pieza pendiente que aún no toca: hace de muro.

    pos = next;
    moved = true;
    const collects = pieceIndex === collected;
    if (collects) collected++; // La que toca: se recoge y se sigue.
    if (cell.startsWith('arrow-')) {
      dir = cell.slice('arrow-'.length) as Direction;
      delta = DIRECTION_DELTA[dir];
    }
    // Hielo frágil: la primera vez se rompe y se sigue; roto, es un agujero.
    const crack = cell === 'crack' ? crackIndex(board, pos) : -1;
    const breaks = crack >= 0 && (broken & (1 << crack)) === 0;
    if (breaks) broken |= 1 << crack;
    steps?.push({ pos, kind: 'slide', dir, collects, breaks });

    if (cell === 'ice' || cell.startsWith('arrow-') || breaks) continue;
    if (cell === 'snow') break;
    if (cell === 'hole' || cell === 'crack') {
      pos = board.start;
      steps?.push({ pos, kind: 'fall', dir, collects: false, breaks: false });
      break;
    }
    // Teletransporte.
    pos = portalExit(board, pos);
    steps?.push({ pos, kind: 'teleport', dir, collects: false, breaks: false });
  }

  return { player: pos, collected, broken, moved, looped: false };
}

/**
 * Aplica un movimiento en la dirección `dir` y devuelve el nuevo estado,
 * o `null` si el personaje no se desplaza (ese movimiento no cuenta).
 */
export function applyMove(board: Board, state: GameState, dir: Direction): GameState | null {
  const r = slide(board, state, dir, null);
  return r.moved ? { player: r.player, collected: r.collected, broken: r.broken } : null;
}

/** Como applyMove, pero con el recorrido paso a paso (para animarlo). */
export function traceMove(board: Board, state: GameState, dir: Direction): MoveTrace | null {
  const steps: Step[] = [];
  const r = slide(board, state, dir, steps);
  return r.moved ? { state: { player: r.player, collected: r.collected, broken: r.broken }, steps, looped: r.looped } : null;
}

/** Devuelve true si ya se han recogido todas las piezas del tablero. */
export function isComplete(board: Board, state: GameState): boolean {
  return state.collected === board.pieces.length;
}
