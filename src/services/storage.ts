// Datos guardados en el navegador. Si localStorage no está disponible (modo
// privado, almacenamiento bloqueado...), el juego funciona igual sin guardar.

const PROGRESS_KEY = 'skid.progress.v1';
const DAILY_KEY = 'skid.daily.v1';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // No se puede guardar: se sigue jugando igual.
  }
}

// ------------------------------------------------------------- Modo niveles

export interface Progress {
  readonly seed: number;
  readonly level: number;
}

/**
 * Semilla y nivel con los que empezar el modo niveles:
 * `?seed=123` en la URL (desde el nivel 1), si no el progreso guardado, si no uno nuevo.
 */
export function startingProgress(): Progress {
  const param = new URLSearchParams(window.location.search).get('seed');
  if (param !== null && /^\d+$/.test(param)) return { seed: Number(param) >>> 0, level: 1 };
  const saved = read<Progress>(PROGRESS_KEY);
  if (saved && Number.isInteger(saved.seed) && Number.isInteger(saved.level) && saved.level >= 1) return saved;
  return { seed: Math.floor(Math.random() * 2 ** 32), level: 1 };
}

export function saveProgress(progress: Progress): void {
  write(PROGRESS_KEY, progress);
}

// --------------------------------------------------------------- Reto diario

export interface DailyResult {
  readonly moves: number;
  readonly retries: number;
  /** Pistas pedidas (no existe en resultados anteriores a las pistas). */
  readonly hints?: number;
  /** Racha tras terminar este reto (la calcula el servidor). */
  readonly streak?: number;
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

// ------------------------------------------------------------ Celebraciones

const MILESTONES_KEY = 'skid.milestones.v1';
const WIN_SEEN_KEY = 'skid.winSeen.v1';

/** Niveles del modo libre que se celebran al superarlos. */
export const MILESTONES: readonly number[] = [25, 50, 75, 100];

/** Marca un hito como celebrado. Devuelve false si ya se había celebrado antes. */
export function claimMilestone(level: number): boolean {
  const seen = read<number[]>(MILESTONES_KEY) ?? [];
  if (seen.includes(level)) return false;
  write(MILESTONES_KEY, [...seen, level]);
  return true;
}

/** Marca como vista la celebración de haber ganado el reto de `day`. Devuelve false si ya se vio. */
export function claimWinCelebration(day: string): boolean {
  if (read<string>(WIN_SEEN_KEY) === day) return false;
  write(WIN_SEEN_KEY, day);
  return true;
}

/** Olvida el reto guardado en este navegador (p. ej. al cambiar de jugador). */
export function clearDaily(): void {
  try {
    localStorage.removeItem(DAILY_KEY);
  } catch {
    // Sin almacenamiento: nada que borrar.
  }
}
