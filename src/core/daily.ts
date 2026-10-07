// Reto diario: el mismo tablero para todos cada día, y el registro de la
// partida (movimientos y reintentos) que el servidor reproduce para verificarla.

import { initialState, type Board, type Direction, type GameState } from './board.ts';
import { generateLevel, type GeneratedLevel } from './generator.ts';
import { applyMove, isComplete } from './move.ts';
import { hashSeed } from './rng.ts';

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

export function dailyLevel(day: string): GeneratedLevel {
  return generateLevel(DAILY_LEVEL, hashSeed(`skid-daily:${day}`), { rejectDeadEnds: day >= NO_DEAD_ENDS_SINCE });
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

export interface RunReplay {
  readonly state: GameState;
  /** Movimientos que desplazaron al jugador, sumando todos los intentos. */
  readonly moves: number;
  readonly retries: number;
  readonly hints: number;
  readonly completed: boolean;
}

/**
 * Reproduce un registro sobre el tablero. Los movimientos que no desplazan no
 * cuentan. Lanza un Error si hay eventos después de completar el nivel.
 */
export function replayRun(board: Board, events: readonly RunEvent[]): RunReplay {
  let state = initialState(board);
  let moves = 0;
  let retries = 0;
  let hints = 0;
  let completed = false;

  for (const event of events) {
    if (completed) throw new Error('El registro sigue después de completar el nivel');
    if (event === 'restart') {
      state = initialState(board);
      retries++;
      continue;
    }
    if (event === 'hint') {
      hints++; // La pista no mueve: solo cuenta (y resta puntos).
      continue;
    }
    const next = applyMove(board, state, event);
    if (!next) continue;
    state = next;
    moves++;
    completed = isComplete(board, state);
  }
  return { state, moves, retries, hints, completed };
}
