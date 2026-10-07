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

export type Cell = 'wall' | 'ice';

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

/** Pieza que toca recoger, o undefined si ya se han recogido todas. */
export function nextPiece(board: Board, state: GameState): Piece | undefined {
  return board.pieces[state.collected];
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Convierte un tablero escrito como array de strings:
 *   #  muro
 *   .  hielo
 *   1-9  pieza numerada (sobre hielo)
 *   @  posición inicial del jugador (sobre hielo)
 *
 * Lanza un Error si el tablero no es rectangular, contiene caracteres
 * desconocidos, no tiene exactamente un '@', o las piezas no son 1..n sin
 * huecos ni repeticiones.
 */
export function parseBoard(rows: readonly string[]): Board {
  if (rows.length === 0) throw new Error('El tablero está vacío');
  const width = rows[0].length;
  if (width === 0) throw new Error('El tablero está vacío');

  const cells: Cell[][] = [];
  const pieceMap = new Map<number, Pos>();
  let start: Pos | undefined;

  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Fila ${y} mide ${row.length}, se esperaba ${width}`);
    }
    const line: Cell[] = [];
    [...row].forEach((ch, x) => {
      if (ch === '#') {
        line.push('wall');
        return;
      }
      line.push('ice');
      if (ch === '.') return;
      if (ch === '@') {
        if (start) throw new Error('El tablero tiene más de un jugador (@)');
        start = { x, y };
      } else if (ch >= '1' && ch <= '9') {
        const order = Number(ch);
        if (pieceMap.has(order)) throw new Error(`Pieza ${order} repetida`);
        pieceMap.set(order, { x, y });
      } else {
        throw new Error(`Carácter desconocido '${ch}' en (${x}, ${y})`);
      }
    });
    cells.push(line);
  });

  if (!start) throw new Error('El tablero no tiene jugador (@)');
  if (pieceMap.size === 0) throw new Error('El tablero no tiene piezas');

  const pieces: Piece[] = [];
  for (let order = 1; order <= pieceMap.size; order++) {
    const pos = pieceMap.get(order);
    if (!pos) throw new Error(`Falta la pieza ${order}: deben ir de 1 a ${pieceMap.size}`);
    pieces.push({ order, pos });
  }

  return { width, height: rows.length, cells, pieces, start };
}

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
