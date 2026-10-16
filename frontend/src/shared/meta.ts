// Título de la pestaña y descripción de la página, en el idioma del jugador. El
// juego es una sola página: el título cambia con cada pantalla («Ranking · Skid»).

import type { Route } from './router';
import { t, type TextKey } from '../i18n/i18n';

const TITLES: Record<Route['name'], TextKey | null> = {
  home: null,
  levels: 'home.free.eyebrow',
  daily: 'home.daily.eyebrow',
  solution: 'solution.title',
  ghost: 'ghost.title',
  weekly: 'weekly.eyebrow',
  duels: 'nav.duels',
  duelRoom: 'duels.room.title',
  timeAttack: 'timeattack.title',
  duel: 'duels.room.title',
  duelGhost: 'ghost.title',
  ranking: 'nav.ranking',
  stats: 'nav.stats',
  achievements: 'nav.achievements',
  player: 'profile.title',
  community: 'home.community.title',
  editor: 'levels.create.button',
  custom: 'home.community.title',
  customTest: 'levels.play.testTitle',
  admin: null,
  friends: 'nav.friends',
  tutorial: 'tutorial.title',
  play: 'tabs.play',
  me: 'tabs.me',
};

/** Al cambiar de pantalla. */
export function updateTitle(route: Route['name']): void {
  const key = TITLES[route];
  document.title = key ? `${t(key)} · Skid` : t('meta.title');
}

/** Al arrancar: la descripción en el idioma del jugador (la del HTML está en español). */
export function updateDescription(): void {
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('meta.description'));
}
