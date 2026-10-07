import {
  DIRECTION_DELTA,
  isWall,
  samePos,
  type Board,
  type Direction,
  type GameState,
  type Pos,
} from './board.ts';

/**
 * Aplica un movimiento en la dirección `dir` y devuelve el nuevo estado,
 * o `null` si el personaje no se desplaza (ese movimiento no cuenta).
 */
export function applyMove(board: Board, state: GameState, dir: Direction): GameState | null {
  const delta = DIRECTION_DELTA[dir];
  let pos: Pos = state.player;
  let collected = state.collected;

  // Al recoger la última pieza el nivel termina, así que se deja de deslizar.
  while (collected < board.pieces.length) {
    const next: Pos = { x: pos.x + delta.x, y: pos.y + delta.y };
    if (isWall(board, next)) break;

    // -1 si no hay pieza; < collected si ya se recogió (ahora es hielo).
    const pieceIndex = board.pieces.findIndex((p) => samePos(p.pos, next));
    if (pieceIndex > collected) break; // Pieza pendiente que aún no toca: hace de muro.

    pos = next;
    if (pieceIndex === collected) collected++; // La que toca: se recoge y se sigue.
  }

  return samePos(pos, state.player) ? null : { player: pos, collected };
}

/** Devuelve true si ya se han recogido todas las piezas del tablero. */
export function isComplete(board: Board, state: GameState): boolean {
  return state.collected === board.pieces.length;
}
