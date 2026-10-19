// Avisos de errores: los errores de JS no capturados (y las promesas rechazadas
// sin manejar) de los jugadores se mandan al servidor, que los deja en los logs
// del Worker (Cloudflare → Workers → skid → Logs). Sin datos personales: ni el
// token ni nada de la cuenta; solo el error, la pantalla y la versión.

import { currentRoute } from './router';

const API = import.meta.env.VITE_API_BASE ?? '/api';
/** Como mucho tantos avisos por carga de la página (un bucle de errores no inunda los logs). */
const MAX_REPORTS = 5;
/** Errores que no dicen nada o no son nuestros. */
const IGNORED = [/^Script error\.?$/, /ResizeObserver loop/];

const sent = new Set<string>();

export interface ClientError {
  readonly kind: 'error' | 'rejection';
  readonly message: string;
  readonly stack: string | null;
  /** Archivo, línea y columna donde saltó (sin el dominio). */
  readonly source: string | null;
  readonly route: string | null;
  readonly build: string;
}

/** Quita el dominio de las URL de la pila: el archivo y la línea bastan. */
function stripOrigin(text: string): string {
  return text.replaceAll(location.origin, '');
}

/** Si el error viene de una extensión del navegador, no es nuestro. */
function fromExtension(text: string | null | undefined): boolean {
  return !!text && /(chrome|moz|safari(-web)?)-extension:\/\//.test(text);
}

function report(error: Omit<ClientError, 'route' | 'build'>): void {
  if (IGNORED.some((re) => re.test(error.message)) || fromExtension(error.stack) || fromExtension(error.source)) return;
  const key = `${error.kind}|${error.message}|${error.source}`;
  if (sent.has(key) || sent.size >= MAX_REPORTS) return;
  sent.add(key);
  const payload: ClientError = {
    ...error,
    message: stripOrigin(error.message).slice(0, 300),
    stack: error.stack ? stripOrigin(error.stack).slice(0, 2000) : null,
    route: currentRoute(),
    build: __BUILD_ID__,
  };
  // keepalive: llega aunque el error haga que el jugador cierre la página.
  fetch(`${API}/errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), keepalive: true }).catch(() => {});
}

function describe(reason: unknown): { message: string; stack: string | null } {
  if (reason instanceof Error) return { message: `${reason.name}: ${reason.message}`, stack: reason.stack ?? null };
  try {
    return { message: typeof reason === 'string' ? reason : (JSON.stringify(reason) ?? String(reason)), stack: null };
  } catch {
    return { message: String(reason), stack: null };
  }
}

/** Empieza a avisar de los errores. Se llama lo primero al arrancar; en desarrollo y sin servidor, no hace nada. */
export function installErrorReporting(): void {
  if (import.meta.env.DEV || API === '') return;
  window.addEventListener('error', (e) => {
    // Los fallos al cargar una imagen o un script también llegan aquí, pero sin mensaje: esos no.
    if (!(e instanceof ErrorEvent) || !e.message) return;
    const { stack } = describe(e.error);
    report({ kind: 'error', message: e.message, stack, source: e.filename ? `${stripOrigin(e.filename)}:${e.lineno}:${e.colno}` : null });
  });
  window.addEventListener('unhandledrejection', (e) => {
    report({ kind: 'rejection', ...describe(e.reason), source: null });
  });
}
