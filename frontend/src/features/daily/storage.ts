// Reto diario guardado en el navegador: el intento de hoy (por si se cierra la
// página a medias) y qué victorias ya se han celebrado.

import { read, remove, write } from '../../shared/storage';

const DAILY_KEY = 'skid.daily.v1';
const WIN_SEEN_KEY = 'skid.winSeen.v1';

export interface DailyResult {
  readonly moves: number;
  readonly retries: number;
  /** Pistas pedidas (no existe en resultados anteriores a las pistas). */
  readonly hints?: number;
  /** Racha tras terminar este reto (la calcula el servidor). */
  readonly streak?: number;
  /** Protectores de racha que le quedan tras este reto. */
  readonly freezes?: number;
  /** Si este reto le dio un protector nuevo. */
  readonly freezeEarned?: boolean;
  readonly timeMs: number;
  readonly optimal: number;
  readonly score: number;
}

/** Intento del reto de un día en este navegador. */
export interface DailyRecord {
  readonly day: string;
  /** Instante de inicio (ms). Con ranking online, el del servidor. */
  readonly startedAt: number;
  /** Registro de la partida (ver encodeRun). */
  readonly log: string;
  readonly result?: DailyResult;
  /** El resultado se calculó aquí y aún no lo ha aceptado el servidor. */
  readonly pendingSubmit?: boolean;
}

export function loadDaily(day: string): DailyRecord | null {
  const record = read<DailyRecord>(DAILY_KEY);
  return record?.day === day ? record : null;
}

export function saveDaily(record: DailyRecord): void {
  write(DAILY_KEY, record);
}

/** Olvida el reto guardado en este navegador (p. ej. al cambiar de jugador). */
export function clearDaily(): void {
  remove(DAILY_KEY);
}

/** Marca como vista la celebración de haber ganado el reto de `day`. Devuelve false si ya se vio. */
export function claimWinCelebration(day: string): boolean {
  if (read<string>(WIN_SEEN_KEY) === day) return false;
  write(WIN_SEEN_KEY, day);
  return true;
}
