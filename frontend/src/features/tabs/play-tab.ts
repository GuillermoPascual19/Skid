// Pestaña Jugar: el modo libre, los niveles de los jugadores y cómo se juega.

import { h } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import { withTabs } from '../../shared/tabs';
import * as online from '../../shared/api';
import { startingProgress } from '../free-play/storage';
import { openGuide } from '../guide/guide';
import { t } from '../../i18n/i18n';

export function playTab(): Screen {
  const level = startingProgress().level;
  const el = h(
    'div',
    { class: 'screen tab-screen' },
    h('header', { class: 'tab-title' }, h('h1', null, t('tabs.play'))),
    h(
      'section',
      { class: 'card levels-card' },
      h('div', { class: 'info' }, h('p', { class: 'eyebrow' }, t('home.free.eyebrow')), h('h2', null, t('common.levelN', { n: level })), h('p', { class: 'muted' }, t('home.free.text'))),
      h('button', { class: 'btn', onclick: () => go({ name: 'levels' }) }, t('common.play')),
    ),
    online.onlineEnabled
      ? h(
          'section',
          { class: 'card levels-card multiplayer-card' },
          h('div', { class: 'info' }, h('p', { class: 'eyebrow' }, t('home.community.eyebrow')), h('h2', null, t('home.community.title')), h('p', { class: 'muted' }, t('home.community.text'))),
          h('button', { class: 'btn secondary', onclick: () => go({ name: 'community' }) }, t('home.community.enter')),
        )
      : null,
    h(
      'section',
      { class: 'card list-card' },
      h('button', { class: 'list-row', onclick: () => go({ name: 'tutorial' }) }, h('span', { 'aria-hidden': 'true' }, '▶'), h('span', null, t('tutorial.practice')), h('span', { class: 'chevron' }, '›')),
      h('button', { class: 'list-row', onclick: () => openGuide() }, h('span', { 'aria-hidden': 'true' }, '❓'), h('span', null, t('nav.rules')), h('span', { class: 'chevron' }, '›')),
    ),
  );
  return { el: withTabs(el, 'play') };
}
