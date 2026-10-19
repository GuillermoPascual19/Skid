// Caché en memoria para lo que es igual para todos y caro de calcular: el ranking
// global y el orden de los niveles de jugadores. Dura poco (un minuto como mucho)
// y se borra en cuanto algo la cambia (un reto terminado, un nivel nuevo…).
//
// Vive en la memoria de cada copia del Worker: cada una tiene la suya y la pierde
// al apagarse. No hay nada mejor gratis en workers.dev (la Cache API no funciona
// ahí y KV tiene pocas escrituras), y con esto basta: si llegan muchas visitas,
// casi todas las responde la caché. Lo que se borra al cambiar algo solo se borra
// en la copia que atendió el cambio; las demás tardan como mucho lo que dure.

interface Entry {
  at: number;
  value: Promise<unknown>;
}

const entries = new Map<string, Entry>();

/** Entradas como mucho: se van las más antiguas (una por página de niveles y periodo de ranking). */
const MAX_ENTRIES = 200;

/**
 * El valor de `key` si se calculó hace menos de `ttlMs`; si no, lo calcula. Las
 * peticiones que llegan a la vez comparten el mismo cálculo. Un error no se guarda.
 */
export function memo<T>(key: string, ttlMs: number, compute: () => Promise<T>, now = Date.now()): Promise<T> {
  const hit = entries.get(key);
  if (hit && now - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = compute();
  entries.delete(key); // Al final del orden: es la más reciente.
  entries.set(key, { at: now, value });
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  return value;
}

/** Borra lo guardado cuyas claves empiezan por `prefix` (algo ha cambiado). */
export function forget(prefix: string): void {
  for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key);
}

/** Para los tests: cada base de datos de prueba empieza sin nada guardado. */
export function forgetAll(): void {
  entries.clear();
}
