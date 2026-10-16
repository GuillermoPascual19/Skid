// Lo último que se vio de cada tarjeta (reto semanal, duelos, racha…), guardado
// en el navegador para pintarlo al instante la próxima vez mientras llega lo
// nuevo del servidor. Es del jugador de este dispositivo: al cambiar de sesión
// se borra (ver shared/api.ts).

import { read, write } from './storage';

const PREFIX = 'skid.cache.';
/** Lo guardado hace más de esto ya no se enseña (mejor «cargando» que algo muy viejo). */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export function recall<T>(key: string): T | null {
  const saved = read<{ at: number; data: T }>(PREFIX + key);
  return saved && Date.now() - saved.at < MAX_AGE_MS ? saved.data : null;
}

export function remember<T>(key: string, data: T): void {
  write(PREFIX + key, { at: Date.now(), data });
}

/** Borra todo lo guardado (al entrar o salir de una cuenta). */
export function forgetAll(): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key);
  } catch {
    // Sin almacenamiento: no había nada.
  }
}

/**
 * Pinta lo guardado (si lo hay) y después lo del servidor, que se guarda para
 * la próxima vez. Si el servidor falla y había algo guardado, se queda eso (sin
 * conexión); si no había nada, `onError`.
 */
export async function cached<T>(key: string, fetcher: () => Promise<T>, render: (data: T) => void, onError: (err: Error) => void): Promise<void> {
  const saved = recall<T>(key);
  if (saved !== null) render(saved);
  try {
    const data = await fetcher();
    remember(key, data);
    render(data);
  } catch (err) {
    if (saved === null) onError(err as Error);
  }
}
