// Acceso al almacenamiento del navegador. Si localStorage no está disponible
// (modo privado, almacenamiento bloqueado...), el juego funciona igual sin
// guardar. Lo que guarda cada apartado está en su carpeta (features/*/storage.ts).

export function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // No se puede guardar: se sigue jugando igual.
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Sin almacenamiento: nada que borrar.
  }
}
