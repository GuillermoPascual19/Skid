import { DIRECTION_DELTA, cellAt, crackIndex, doorOpen, portalExit, samePos, type Board, type Cell, type Direction, type GameState, type Pos } from './board.ts';

/** Un paso del recorrido de un deslizamiento (para animarlo). */
export interface Step {
  /** Casilla en la que acaba este paso (en un empujón, donde se queda el pingüino). */
  readonly pos: Pos;
  /**
   * slide: avanza una casilla. teleport: sale por la pareja del teletransporte
   * en el que acaba de entrar. fall: cae al agua y reaparece en la salida.
   * push: choca con un bloque y lo empuja (el pingüino se queda donde está).
   */
  readonly kind: 'slide' | 'teleport' | 'fall' | 'push';
  /** Dirección en la que se mueve tras este paso. */
  readonly dir: Direction;
  /** Recoge en este paso la pieza que tocaba. */
  readonly collects: boolean;
  /** Rompe en este paso el hielo frágil de la casilla. */
  readonly breaks: boolean;
  /** Pasa en este paso por un interruptor: las puertas cambian. */
  readonly toggles: boolean;
  /** En un empujón, de dónde a dónde se desliza el bloque. */
  readonly push: { readonly from: Pos; readonly to: Pos } | null;
}

export interface MoveTrace {
  readonly state: GameState;
  readonly steps: readonly Step[];
  /**
   * El recorrido entraba en un bucle sin fin (corrientes o espejos que se
   * mandan unos a otros): el pingüino se para donde lo detecta. El generador
   * descarta esos tableros.
   */
  readonly looped: boolean;
}

const QUIET = { collects: false, breaks: false, toggles: false, push: null } as const;

/** Dirección tras rebotar en un espejo: / manda la derecha arriba; \ la manda abajo. */
const MIRROR_TURN: Record<'mirror-slash' | 'mirror-backslash', Record<Direction, Direction>> = {
  'mirror-slash': { right: 'up', up: 'right', left: 'down', down: 'left' },
  'mirror-backslash': { right: 'down', down: 'right', left: 'up', up: 'left' },
};

/**
 * Hasta dónde se desliza el bloque que está en `from` si lo empujan hacia
 * `delta`: solo avanza por hielo normal, sin piezas pendientes, sin otros
 * bloques y sin pisar la salida. null si no se puede mover.
 */
function blockSlide(board: Board, blocks: readonly Pos[], collected: number, from: Pos, delta: Pos): Pos | null {
  let at = from;
  for (;;) {
    const next = { x: at.x + delta.x, y: at.y + delta.y };
    if (cellAt(board, next) !== 'ice' || samePos(next, board.start)) break;
    if (board.pieces.some((p, i) => i >= collected && samePos(p.pos, next))) break;
    if (blocks.some((b) => samePos(b, next))) break;
    at = next;
  }
  return samePos(at, from) ? null : at;
}

/** ¿Se puede entrar en `cell` moviéndose hacia `dir`? */
function enterable(cell: Cell, dir: Direction, flipped: boolean): boolean {
  if (cell === 'wall') return false;
  if (cell.startsWith('oneway-')) return cell === `oneway-${dir}`;
  if (cell === 'door-closed' || cell === 'door-open') return doorOpen(cell, flipped);
  return true;
}

interface SlideResult {
  readonly state: GameState;
  readonly moved: boolean;
  readonly looped: boolean;
}

/**
 * Desliza al jugador hacia `dir` hasta que algo lo pare. Si recibe `steps`,
 * apunta en él el recorrido. Es el núcleo de applyMove y traceMove: así el
 * juego, el solver y la animación siguen exactamente la misma regla.
 */
function slide(board: Board, state: GameState, dir: Direction, steps: Step[] | null): SlideResult {
  let delta = DIRECTION_DELTA[dir];
  let pos: Pos = state.player;
  let { collected, broken, flipped, blocks } = state;
  let moved = false;
  const result = (looped: boolean): SlideResult => ({ state: { player: pos, collected, broken, flipped, blocks }, moved, looped });
  // Cada casilla con cada dirección, cada número de piezas, cada número de
  // casillas de hielo frágil rotas y cada estado de las puertas, una vez como
  // mucho: pasar de ahí solo puede ser un bucle.
  let budget = board.width * board.height * 4 * (board.pieces.length + 1) * (board.cracks.length + 1) * 2;

  // Al recoger la última pieza el nivel termina, así que se deja de deslizar.
  while (collected < board.pieces.length) {
    if (--budget < 0) return result(true);
    const next: Pos = { x: pos.x + delta.x, y: pos.y + delta.y };
    const cell = cellAt(board, next);
    if (!enterable(cell, dir, flipped)) break;

    // -1 si no hay pieza; < collected si ya se recogió (ahora es hielo).
    const pieceIndex = board.pieces.findIndex((p) => samePos(p.pos, next));
    if (pieceIndex > collected) break; // Pieza pendiente que aún no toca: hace de muro.

    // Bloque: se desliza si puede y el pingüino se queda donde chocó; si no, es un muro.
    const blockIndex = blocks.findIndex((b) => samePos(b, next));
    if (blockIndex >= 0) {
      const to = blockSlide(board, blocks, collected, next, delta);
      if (to) {
        blocks = blocks.map((b, i) => (i === blockIndex ? to : b));
        moved = true;
        steps?.push({ ...QUIET, pos, kind: 'push', dir, push: { from: next, to } });
      }
      break;
    }

    pos = next;
    moved = true;
    const collects = pieceIndex === collected;
    if (collects) collected++; // La que toca: se recoge y se sigue.
    if (cell.startsWith('arrow-')) dir = cell.slice('arrow-'.length) as Direction;
    if (cell === 'mirror-slash' || cell === 'mirror-backslash') dir = MIRROR_TURN[cell][dir];
    delta = DIRECTION_DELTA[dir];
    // Hielo frágil: la primera vez se rompe y se sigue; roto, es un agujero.
    const crack = cell === 'crack' ? crackIndex(board, pos) : -1;
    const breaks = crack >= 0 && (broken & (1 << crack)) === 0;
    if (breaks) broken |= 1 << crack;
    const toggles = cell === 'switch';
    if (toggles) flipped = !flipped;
    steps?.push({ ...QUIET, pos, kind: 'slide', dir, collects, breaks, toggles });

    if (cell === 'snow') break;
    if (cell === 'hole' || (cell === 'crack' && !breaks)) {
      pos = board.start;
      steps?.push({ ...QUIET, pos, kind: 'fall', dir });
      break;
    }
    if (cell === 'portal') {
      pos = portalExit(board, pos);
      steps?.push({ ...QUIET, pos, kind: 'teleport', dir });
    }
    // Lo demás (hielo, corrientes, espejos, pasos, interruptores, puertas abiertas): se sigue.
  }

  return result(false);
}

/**
 * Aplica un movimiento en la dirección `dir` y devuelve el nuevo estado,
 * o `null` si no cambia nada (ni se desplaza el pingüino ni empuja un bloque):
 * ese movimiento no cuenta.
 */
export function applyMove(board: Board, state: GameState, dir: Direction): GameState | null {
  const r = slide(board, state, dir, null);
  return r.moved ? r.state : null;
}

/** Como applyMove, pero con el recorrido paso a paso (para animarlo). */
export function traceMove(board: Board, state: GameState, dir: Direction): MoveTrace | null {
  const steps: Step[] = [];
  const r = slide(board, state, dir, steps);
  return r.moved ? { state: r.state, steps, looped: r.looped } : null;
}

/** Devuelve true si ya se han recogido todas las piezas del tablero. */
export function isComplete(board: Board, state: GameState): boolean {
  return state.collected === board.pieces.length;
}
