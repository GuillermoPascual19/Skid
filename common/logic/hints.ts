// Pistas: como mucho MAX_HINTS por tablero. En el reto diario se cuentan en
// todo el día (aunque se vuelva a empezar) y el servidor lo hace cumplir; en el
// modo libre, por nivel. `extra` son las pistas que se ganen aparte (la idea es
// que en el futuro se puedan desbloquear viendo un anuncio; en el reto diario
// el servidor tendrá que comprobarlo con la red de anuncios).

export const MAX_HINTS = 3;

/**
 * Primer reto diario con tope: los anteriores (y el del día en que se
 * desplegó, que alguien podía estar jugando ya) no lo tienen.
 */
export const DAILY_HINT_LIMIT_SINCE = '2026-10-18';

/** Pistas que se pueden pedir en total. */
export function hintLimit(extra = 0): number {
  return MAX_HINTS + extra;
}

/** Pistas que quedan tras usar `used`. */
export function hintsLeft(used: number, extra = 0): number {
  return Math.max(0, hintLimit(extra) - used);
}

/** Tope de pistas del reto diario de `day`, o null si es de antes del tope. */
export function dailyHintLimit(day: string): number | null {
  return day >= DAILY_HINT_LIMIT_SINCE ? hintLimit() : null;
}
