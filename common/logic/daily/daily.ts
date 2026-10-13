// Reto diario: el mismo tablero para todos cada día, y el registro de la
// partida (movimientos, reintentos y pistas) que el servidor reproduce para verificarla.

import { initialState, type Board, type Direction, type GameState } from '../engine/board.ts';
import { generateLevel, type GeneratedLevel } from '../engine/generator.ts';
import { applyMove, isComplete } from '../engine/move.ts';
import { hashSeed } from '../engine/rng.ts';

/** El reto cambia a medianoche de esta zona horaria. */
export const DAILY_TIME_ZONE = 'Europe/Madrid';
/** Dificultad del reto, en la escala de niveles del modo libre. */
export const DAILY_LEVEL = 10;
/**
 * Desde este día los retos no tienen callejones sin salida. Los anteriores se
 * generan como entonces, para que las partidas ya jugadas se sigan verificando.
 */
export const NO_DEAD_ENDS_SINCE = '2026-10-08';

/** Día del reto ("YYYY-MM-DD") para un instante dado. */
export function dayKey(date: Date, timeZone: string = DAILY_TIME_ZONE): string {
  // El formato en-CA es YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Periodo de días, ambos incluidos ("YYYY-MM-DD"). */
export interface DayRange {
  readonly from: string;
  readonly to: string;
}

/** Suma (o resta) días a "YYYY-MM-DD". */
export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Semana (de lunes a domingo) que contiene `day`. */
export function weekRange(day: string): DayRange {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7; // Lunes = 0.
  const from = shiftDay(day, -weekday);
  return { from, to: shiftDay(from, 6) };
}

/** Mes natural que contiene `day`. */
export function monthRange(day: string): DayRange {
  const [y, m] = day.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const month = String(m).padStart(2, '0');
  return { from: `${y}-${month}-01`, to: `${y}-${month}-${String(last).padStart(2, '0')}` };
}

export function dailyLevel(day: string): GeneratedLevel {
  return generateLevel(DAILY_LEVEL, hashSeed(`skid-daily:${day}`), { rejectDeadEnds: day >= NO_DEAD_ENDS_SINCE });
}

/**
 * Duración de la animación de un deslizamiento: base + por casilla recorrida.
 * El juego la usa para animar y el servidor para saber cuánto tarda como
 * mínimo una partida real (ver minPlayTimeMs).
 */
export const SLIDE_BASE_MS = 80;
export const SLIDE_MS_PER_CELL = 42;

export function slideDurationMs(cells: number): number {
  return SLIDE_BASE_MS + cells * SLIDE_MS_PER_CELL;
}

/**
 * Lo que hace el jugador: un intento de movimiento, un reintento (volver al
 * inicio) o pedir una pista.
 */
export type RunEvent = Direction | 'restart' | 'hint';

const EVENT_CODE: Record<RunEvent, string> = { up: 'U', down: 'D', left: 'L', right: 'R', restart: 'X', hint: 'H' };
const CODE_EVENT = Object.fromEntries(Object.entries(EVENT_CODE).map(([e, c]) => [c, e])) as Record<string, RunEvent>;

/** Registro compacto: una letra por evento (U, D, L, R, X, H). */
export function encodeRun(events: readonly RunEvent[]): string {
  return events.map((e) => EVENT_CODE[e]).join('');
}

export function decodeRun(log: string): RunEvent[] {
  return [...log].map((c) => {
    const event = CODE_EVENT[c];
    if (!event) throw new Error(`Evento desconocido '${c}' en el registro`);
    return event;
  });
}

/** Un intento terminado: sus movimientos y las pistas pedidas hasta entonces. */
export interface Attempt {
  readonly moves: number;
  /** Pistas pedidas desde el principio (las de intentos anteriores también ayudan). */
  readonly hints: number;
  /** Golpes: movimientos + pistas. */
  readonly strokes: number;
}

export interface RunReplay {
  readonly state: GameState;
  /** Movimientos del intento en curso (o del último, si acaba de terminarlo). */
  readonly moves: number;
  /** Casillas recorridas en total, en todos los intentos (para el tiempo mínimo de las animaciones). */
  readonly cells: number;
  /** Movimientos que desplazaron al jugador, sumando todos los intentos. */
  readonly totalMoves: number;
  readonly retries: number;
  readonly hints: number;
  /** El último evento completó el nivel (el intento en curso está terminado). */
  readonly completed: boolean;
  /** El intento terminado con menos golpes (a igualdad, el primero), o null. */
  readonly best: Attempt | null;
  /** El último intento terminado, o null. */
  readonly last: Attempt | null;
}

/**
 * Reproduce un registro sobre el tablero. Los movimientos que no desplazan no
 * cuentan. Se puede volver a empezar en cualquier momento, también después de
 * completar el nivel (para mejorar el resultado); cualquier otro evento tras
 * completarlo lanza un Error.
 */
export function replayRun(board: Board, events: readonly RunEvent[]): RunReplay {
  let state = initialState(board);
  let moves = 0;
  let totalMoves = 0;
  let cells = 0;
  let retries = 0;
  let hints = 0;
  let completed = false;
  let best: Attempt | null = null;
  let last: Attempt | null = null;

  for (const event of events) {
    if (event === 'restart') {
      state = initialState(board);
      moves = 0;
      retries++;
      completed = false;
      continue;
    }
    if (completed) throw new Error('El registro sigue después de completar el nivel');
    if (event === 'hint') {
      hints++; // La pista no mueve: solo cuenta (suma un golpe).
      continue;
    }
    const next = applyMove(board, state, event);
    if (!next) continue;
    cells += Math.abs(next.player.x - state.player.x) + Math.abs(next.player.y - state.player.y);
    state = next;
    moves++;
    totalMoves++;
    completed = isComplete(board, state);
    if (completed) {
      last = { moves, hints, strokes: moves + hints };
      if (!best || last.strokes < best.strokes) best = last;
    }
  }
  return { state, moves, cells, totalMoves, retries, hints, completed, best, last };
}

/**
 * Tiempo mínimo de una partida jugada de verdad: la suma de las animaciones de
 * todos sus deslizamientos (el juego no envía el resultado hasta que termina la
 * última). Una partida más rápida no se ha jugado en el juego.
 */
export function minPlayTimeMs(replay: Pick<RunReplay, 'totalMoves' | 'cells'>): number {
  return replay.totalMoves * SLIDE_BASE_MS + replay.cells * SLIDE_MS_PER_CELL;
}
