// Versión nueva desplegada: el juego compara su identificador de compilación con
// el de la web (version.json) al volver a la app y cada poco mientras está
// abierta. Si ha cambiado, se recarga solo en las pantallas tranquilas; en mitad
// de una partida no se interrumpe: sale un aviso para actualizar cuando se quiera.

import { h } from './dom';
import { currentRoute, type Route } from './router';
import { t } from '../i18n/i18n';

/** Cada cuánto se mira mientras la app está abierta y a la vista. */
const CHECK_EVERY_MS = 10 * 60 * 1000;
/** Pantallas sin nada a medias: aquí se puede recargar sin preguntar. */
const SAFE: readonly Route['name'][] = ['home', 'ranking', 'stats', 'achievements', 'player', 'duels', 'community', 'admin'];

/** La versión de la web, si es otra que la de este juego (null si es la misma o no se sabe). */
let newVersion: string | null = null;
let lastCheck = 0;
/** Para qué versión se recargó ya: si tras recargar sigue igual (una caché), no se insiste. */
const RELOADED_KEY = 'skid.reloadedFor';

async function remoteVersion(): Promise<string | null> {
  try {
    // Sin caché: tiene que ser el de la web ahora mismo.
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null; // En desarrollo no hay version.json.
    const { build } = (await res.json()) as { build?: string };
    return build && build !== __BUILD_ID__ ? build : null;
  } catch {
    return null; // Sin conexión: ya se mirará.
  }
}

/** Aviso fijo abajo: «Hay una versión nueva · Actualizar». */
function showBanner(): void {
  if (document.querySelector('.update-banner')) return;
  document.body.append(
    h(
      'div',
      { class: 'update-banner', role: 'status' },
      h('span', null, `✨ ${t('update.available')}`),
      h('button', { class: 'btn small', onclick: () => location.reload() }, t('update.reload')),
    ),
  );
}

async function check(): Promise<void> {
  if (newVersion) return void apply();
  lastCheck = Date.now();
  newVersion = await remoteVersion();
  if (newVersion) apply();
}

/** Recarga si la pantalla lo permite; si no, el aviso (y se recargará al pasar a una tranquila). */
function apply(): void {
  const route = currentRoute();
  let reloadedFor: string | null = null;
  try {
    reloadedFor = sessionStorage.getItem(RELOADED_KEY);
  } catch {
    // Sin almacenamiento: se recarga sin esa protección.
  }
  // Con un modal abierto (un resultado, unas reglas…) tampoco se recarga sin preguntar.
  const safe = route && SAFE.includes(route) && !document.querySelector('.overlay');
  if (safe && reloadedFor !== newVersion) {
    try {
      sessionStorage.setItem(RELOADED_KEY, newVersion!);
    } catch {
      // Igual que arriba.
    }
    location.reload();
  } else showBanner();
}

/** Al arrancar: mira al volver a la app y cada poco mientras se juega. */
export function watchForUpdates(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck >= CHECK_EVERY_MS) void check();
  }, 60_000);
}
