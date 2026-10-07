// Generador de niveles: crea tableros aleatorios (deterministas por semilla)
// y se queda con uno resoluble cuyo óptimo encaja con la dificultad del nivel.

import { parseBoard, type Board, type Direction } from './board.ts';
import { createRng, type Rng } from './rng.ts';
import { countDeadEnds, solve } from './solver.ts';

export interface Difficulty {
  /** Tamaño total del tablero, incluido el borde de muros. */
  readonly width: number;
  readonly height: number;
  readonly pieces: number;
  /** Proporción de casillas interiores que son muro. */
  readonly wallDensity: number;
  /** Franja en la que debe caer el óptimo del tablero. */
  readonly minMoves: number;
  readonly maxMoves: number;
}

export interface GeneratedLevel {
  readonly level: number;
  readonly rows: string[];
  readonly board: Board;
  readonly solution: Direction[];
}

const MAX_ATTEMPTS = 400;

export interface GenerateOptions {
  /**
   * Descarta tableros con callejones sin salida (posiciones desde las que ya no
   * se puede terminar). Así nunca te quedas atascado: equivocarte solo cuesta
   * movimientos. Por defecto, sí.
   */
  readonly rejectDeadEnds?: boolean;
}

/** Parámetros de dificultad para un nivel (1, 2, 3...). Crecen con el nivel hasta un tope. */
export function difficultyFor(level: number): Difficulty {
  const l = Math.max(1, Math.floor(level));
  return {
    width: Math.min(7 + Math.floor((l - 1) / 2), 12),
    height: Math.min(7 + Math.floor((l - 1) / 3), 10),
    pieces: Math.min(2 + Math.floor((l - 1) / 2), 9),
    wallDensity: Math.min(0.08 + 0.01 * (l - 1), 0.18),
    minMoves: Math.min(3 + l, 24),
    maxMoves: Math.min(6 + l + Math.floor(l / 3), 32),
  };
}

/**
 * Genera el nivel `level` a partir de `seed`. Misma semilla y nivel => mismo tablero.
 *
 * Prueba tableros aleatorios hasta encontrar uno resoluble (y sin callejones sin
 * salida) con el óptimo dentro de [minMoves, maxMoves]. Si no lo encuentra en
 * MAX_ATTEMPTS intentos, devuelve el válido que más se acerque a la franja, para
 * que siempre haya nivel.
 */
export function generateLevel(level: number, seed: number, options: GenerateOptions = {}): GeneratedLevel {
  const rejectDeadEnds = options.rejectDeadEnds ?? true;
  const difficulty = difficultyFor(level);
  const rng = createRng(mixSeed(seed, level));

  let best: GeneratedLevel | null = null;
  let bestDistance = Infinity;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rows = randomRows(rng, difficulty);
    if (!rows) continue;
    const board = parseBoard(rows);
    const solution = solve(board);
    if (!solution) continue;

    const distance = distanceToRange(solution.length, difficulty.minMoves, difficulty.maxMoves);
    // Solo se analiza si podría servir: es lo más caro de cada intento.
    if (distance >= bestDistance) continue;
    if (rejectDeadEnds && countDeadEnds(board) > 0) continue;
    if (distance === 0) return { level, rows, board, solution };
    best = { level, rows, board, solution };
    bestDistance = distance;
  }

  if (!best) throw new Error(`No se pudo generar el nivel ${level} con la semilla ${seed}`);
  return best;
}

function distanceToRange(value: number, min: number, max: number): number {
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

/**
 * Tablero aleatorio: borde de muros, muros interiores sueltos, jugador y piezas
 * en hielo. Devuelve null si no queda hielo suficiente para colocarlos.
 */
function randomRows(rng: Rng, d: Difficulty): string[] | null {
  const grid: string[][] = [];
  for (let y = 0; y < d.height; y++) {
    const row: string[] = [];
    for (let x = 0; x < d.width; x++) {
      const border = x === 0 || y === 0 || x === d.width - 1 || y === d.height - 1;
      row.push(border || rng.next() < d.wallDensity ? '#' : '.');
    }
    grid.push(row);
  }

  const ice: { x: number; y: number }[] = [];
  grid.forEach((row, y) => row.forEach((ch, x) => ch === '.' && ice.push({ x, y })));
  if (ice.length < d.pieces + 1) return null;
  const [start, ...pieces] = rng.shuffle(ice).slice(0, d.pieces + 1);

  grid[start.y][start.x] = '@';
  pieces.forEach((p, i) => (grid[p.y][p.x] = String(i + 1)));
  return grid.map((row) => row.join(''));
}

/** Combina la semilla de la partida con el nivel, para que cada nivel tenga su propia secuencia. */
function mixSeed(seed: number, level: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(level, 0xc2b2ae35)) >>> 0;
}
