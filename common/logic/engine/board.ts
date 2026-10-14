// Tipos del tablero y parser de tableros escritos como texto.
// Lógica pura: este módulo no debe importar Phaser.

export interface Pos {
  readonly x: number;
  readonly y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTION_DELTA: Readonly<Record<Direction, Pos>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * Tipos de casilla. Los elementos especiales (todo salvo muro y hielo) se
 * activan al entrar en ellos deslizando:
 *   snow    nieve blanda: el pingüino se para encima.
 *   arrow-* corriente: gira hacia donde apunta y sigue deslizando.
 *   portal  teletransporte: sale por su pareja y sigue en la misma dirección.
 *   hole    agujero: cae al agua y vuelve a la salida (conserva las piezas).
 */
export type Cell = 'wall' | 'ice' | 'snow' | 'hole' | 'portal' | `arrow-${Direction}`;

export interface Piece {
  /** Número de la pieza, empezando en 1. Se recogen en orden ascendente. */
  readonly order: number;
  readonly pos: Pos;
}

/** Parte estática de un nivel: no cambia durante la partida. */
export interface Board {
  readonly width: number;
  readonly height: number;
  /** cells[y][x]. Las casillas de piezas y del jugador son 'ice'. */
  readonly cells: readonly (readonly Cell[])[];
  /** Ordenadas por `order`: pieces[i].order === i + 1. */
  readonly pieces: readonly Piece[];
  readonly start: Pos;
  /** Parejas de teletransportes: entrar por uno te saca por el otro. */
  readonly portals: readonly (readonly [Pos, Pos])[];
}

/** Parte dinámica de una partida. */
export interface GameState {
  readonly player: Pos;
  /** Cuántas piezas se han recogido. La siguiente que toca es pieces[collected]. */
  readonly collected: number;
}

export function initialState(board: Board): GameState {
  return { player: board.start, collected: 0 };
}

/** Las casillas fuera del tablero cuentan como muro. */
export function isWall(board: Board, pos: Pos): boolean {
  if (pos.x < 0 || pos.y < 0 || pos.x >= board.width || pos.y >= board.height) return true;
  return board.cells[pos.y][pos.x] === 'wall';
}

/** Casilla en `pos` (las de fuera del tablero son muro). */
export function cellAt(board: Board, pos: Pos): Cell {
  if (pos.x < 0 || pos.y < 0 || pos.x >= board.width || pos.y >= board.height) return 'wall';
  return board.cells[pos.y][pos.x];
}

/** Salida del teletransporte que hay en `pos`. */
export function portalExit(board: Board, pos: Pos): Pos {
  for (const [a, b] of board.portals) {
    if (samePos(a, pos)) return b;
    if (samePos(b, pos)) return a;
  }
  throw new Error(`No hay teletransporte en (${pos.x}, ${pos.y})`);
}

/** Pieza que toca recoger, o undefined si ya se han recogido todas. */
export function nextPiece(board: Board, state: GameState): Piece | undefined {
  return board.pieces[state.collected];
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

/** Por qué un tablero no es válido. Cada lado (juego y servidor) lo traduce al idioma del jugador. */
export type BoardProblem =
  | 'empty'
  | 'rowWidth'
  | 'manyPlayers'
  | 'duplicatePiece'
  | 'unknownChar'
  | 'noPlayer'
  | 'noPieces'
  | 'missingPiece'
  | 'portalPair'
  | 'invalid'
  | 'size'
  | 'loops'
  | 'unsolvable'
  | 'tooEasy';

/** Error de un tablero mal formado o que no se puede publicar, con su código y sus datos. */
export class BoardError extends Error {
  constructor(
    readonly code: BoardProblem,
    readonly params: Record<string, string | number> = {},
  ) {
    super(code);
  }
}

/**
 * Convierte un tablero escrito como array de strings:
 *   #  muro
 *   .  hielo
 *   1-9  pieza numerada (sobre hielo)
 *   @  posición inicial del jugador (sobre hielo)
 *   *  nieve blanda
 *   ^ v < >  flecha (corriente) hacia arriba, abajo, izquierda o derecha
 *   a-e  teletransporte: cada letra, exactamente dos veces (una pareja)
 *   O  agujero en el hielo
 *
 * Lanza un BoardError si el tablero no es rectangular, contiene caracteres
 * desconocidos, no tiene exactamente un '@', las piezas no son 1..n sin
 * huecos ni repeticiones, o algún teletransporte no tiene pareja.
 */
export function parseBoard(rows: readonly string[]): Board {
  if (rows.length === 0) throw new BoardError('empty');
  const width = rows[0].length;
  if (width === 0) throw new BoardError('empty');

  const cells: Cell[][] = [];
  const pieceMap = new Map<number, Pos>();
  const portalMap = new Map<string, Pos[]>();
  let start: Pos | undefined;

  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new BoardError('rowWidth', { row: y + 1, length: row.length, width });
    }
    const line: Cell[] = [];
    [...row].forEach((ch, x) => {
      const special = SPECIAL_CHARS[ch];
      if (special) {
        line.push(special);
        if (special === 'portal') portalMap.set(ch, [...(portalMap.get(ch) ?? []), { x, y }]);
        return;
      }
      line.push('ice');
      if (ch === '.') return;
      if (ch === '@') {
        if (start) throw new BoardError('manyPlayers');
        start = { x, y };
      } else if (ch >= '1' && ch <= '9') {
        const order = Number(ch);
        if (pieceMap.has(order)) throw new BoardError('duplicatePiece', { piece: order });
        pieceMap.set(order, { x, y });
      } else {
        throw new BoardError('unknownChar', { char: ch, x, y });
      }
    });
    cells.push(line);
  });

  if (!start) throw new BoardError('noPlayer');
  if (pieceMap.size === 0) throw new BoardError('noPieces');

  const pieces: Piece[] = [];
  for (let order = 1; order <= pieceMap.size; order++) {
    const pos = pieceMap.get(order);
    if (!pos) throw new BoardError('missingPiece', { piece: order, count: pieceMap.size });
    pieces.push({ order, pos });
  }

  const portals: (readonly [Pos, Pos])[] = [];
  for (const [, ends] of [...portalMap].sort(([a], [b]) => a.localeCompare(b))) {
    if (ends.length !== 2) throw new BoardError('portalPair', { count: ends.length });
    portals.push([ends[0], ends[1]]);
  }

  return { width, height: rows.length, cells, pieces, start, portals };
}

/** Caracteres de las casillas que no son hielo normal. */
const SPECIAL_CHARS: Readonly<Record<string, Cell>> = {
  '#': 'wall',
  '*': 'snow',
  O: 'hole',
  '^': 'arrow-up',
  v: 'arrow-down',
  '<': 'arrow-left',
  '>': 'arrow-right',
  a: 'portal',
  b: 'portal',
  c: 'portal',
  d: 'portal',
  e: 'portal',
};

/** Letras de las parejas de teletransportes, en orden. */
export const PORTAL_CHARS = ['a', 'b', 'c', 'd', 'e'] as const;

/** Tablero de ejemplo (óptimo: 11 movimientos). */
export const EXAMPLE_BOARD: readonly string[] = [
  '#########',
  '#@..#...#',
  '#.....2.#',
  '#..1....#',
  '#.#...#.#',
  '#....3..#',
  '#4......#',
  '#########',
];
