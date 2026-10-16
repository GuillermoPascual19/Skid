// Barra de pestañas de abajo: Hoy, Jugar, Amigos y Tú. Sale en esas cuatro
// pantallas; las demás (partidas, rankings…) tienen su botón de volver.

import { h } from './dom';
import { go, type Route } from './router';
import * as online from './api';
import { t, type TextKey } from '../i18n/i18n';

export type TabRoute = 'home' | 'play' | 'friends' | 'me';

const TABS: readonly { route: TabRoute; icon: string; label: TextKey; online?: boolean }[] = [
  { route: 'home', icon: '🏠', label: 'tabs.home' },
  { route: 'play', icon: '🎮', label: 'tabs.play' },
  { route: 'friends', icon: '👥', label: 'tabs.friends', online: true },
  { route: 'me', icon: '🐧', label: 'tabs.me' },
];

/** Solicitudes de amistad pendientes: el número sobre la pestaña de Amigos. */
let friendRequests = 0;
const badges = new Set<HTMLElement>();

export function setFriendRequests(n: number): void {
  friendRequests = n;
  for (const badge of badges) {
    // Las de pantallas que ya no están se olvidan.
    if (badge.isConnected) paintBadge(badge);
    else badges.delete(badge);
  }
}

function paintBadge(badge: HTMLElement) {
  badge.textContent = String(friendRequests);
  badge.hidden = friendRequests === 0;
}

/** La barra, con `active` marcada. */
export function tabBar(active: TabRoute): HTMLElement {
  return h(
    'nav',
    { class: 'tab-bar', 'aria-label': t('tabs.label') },
    ...TABS.filter((tab) => !tab.online || online.onlineEnabled).map((tab) => {
      const badge = tab.route === 'friends' ? h('span', { class: 'badge', hidden: true }) : null;
      if (badge) {
        badges.add(badge);
        paintBadge(badge);
      }
      return h(
        'button',
        {
          class: `tab ${tab.route === active ? 'active' : ''}`,
          'aria-current': tab.route === active ? 'page' : null,
          onclick: () => tab.route !== active && go({ name: tab.route } as Route),
        },
        h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, tab.icon, badge),
        h('span', { class: 'tab-label' }, t(tab.label)),
      );
    }),
  );
}

/** Pantalla con barra de pestañas: la barra va al final y se deja sitio para ella. */
export function withTabs(el: HTMLElement, active: TabRoute): HTMLElement {
  el.classList.add('has-tabs');
  el.append(tabBar(active));
  return el;
}
