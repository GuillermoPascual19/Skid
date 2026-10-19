// Perfil de un amigo (se abre tocándolo en el ranking): su pingüino, racha,
// estadísticas, gorros y el cara a cara contigo.

import { penguinSvg } from '../../../../common/art/hats';
import { ACHIEVEMENTS } from '../../../../common/logic/achievements/achievements';
import { GLOBAL_HATS, SEASON_HATS } from '../../../../common/logic/leagues/seasons';
import { seasonName } from '../ranking/season';
import { h, svg } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import { movesTiles, overChart } from '../daily/stats-screen';
import { type PlayerProfile, getPlayer } from './api';
import { playerName, t, tn } from '../../i18n/i18n';

export function playerScreen(id: string): Screen {
  const title = h('h1', null, t('profile.title'));
  const subtitle = h('p');
  const body = h('div', { class: 'stats-body' }, h('p', { class: 'empty' }, t('common.loading')));
  const el = h(
    'div',
    { class: 'screen' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': t('common.back'), onclick: () => go({ name: 'ranking' }) }, '←'),
      h('div', { class: 'title' }, title, subtitle),
    ),
    body,
  );

  let disposed = false;

  async function load() {
    try {
      const p = await getPlayer(id);
      if (disposed) return;
      title.textContent = p.isMe ? t('profile.yours') : playerName(p.name);
      subtitle.textContent = p.sharedLeagues.length ? p.sharedLeagues.join(' · ') : t('home.daily.eyebrow');
      render(p);
    } catch (err) {
      body.replaceChildren(
        h('section', { class: 'card empty' }, h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: load }, t('common.retry'))),
      );
    }
  }

  function render(p: PlayerProfile) {
    const s = p.stats;
    // Los de logros y los de temporada (uno por mes ganado, aunque lo ganara varias veces).
    const hats = [
      ...ACHIEVEMENTS.filter((a) => p.achievements.includes(a.id)).map((a) => ({
        hat: a.hat,
        title: `${t(`achievements.${a.id}.name`)}: ${t(`achievements.${a.id}.description`)}`,
      })),
      ...SEASON_HATS.flatMap((hat) => {
        const won = p.seasons.filter((s) => s.hat === hat);
        return won.length ? [{ hat, title: won.map((s) => `🏆 ${s.leagueName} · ${seasonName(s.season)}`).join('\n') }] : [];
      }),
      ...GLOBAL_HATS.flatMap((hat) => {
        const won = p.global.filter((g) => g.hat === hat);
        return won.length ? [{ hat, title: won.map((g) => `🌍 ${seasonName(g.season)}`).join('\n') }] : [];
      }),
    ];
    body.replaceChildren(
      h(
        'section',
        { class: 'card profile-head' },
        h('div', { class: 'wardrobe-penguin' }, svg(penguinSvg(p.hat))),
        h(
          'div',
          null,
          h('h2', null, playerName(p.name)),
          h('p', { class: 'muted' }, p.hat ? t('profile.wears', { hat: t(`hats.${p.hat}`) }) : t('achievementsScreen.noHat')),
          h(
            'div',
            { class: 'chips' },
            h('span', { class: 'chip' }, `🔥 ${tn('common.days', s.currentStreak)}`),
            h('span', { class: 'chip' }, t('profile.bestStreak', { n: s.bestStreak })),
          ),
        ),
      ),
      ...(p.headToHead ? [headToHead(p.headToHead, playerName(p.name))] : []),
      h('div', { class: 'tiles' }, ...movesTiles(s)),
      h(
        'section',
        { class: 'card' },
        h('h2', { class: 'section-title' }, t('profile.hats', { n: hats.length, total: ACHIEVEMENTS.length + SEASON_HATS.length + GLOBAL_HATS.length })),
        hats.length === 0
          ? h('p', { class: 'muted' }, t('profile.noHats'))
          : h(
              'div',
              { class: 'hat-shelf' },
              ...hats.map((item) => h('div', { class: 'hat-item', title: item.title }, svg(penguinSvg(item.hat)), h('small', null, t(`hats.${item.hat}`)))),
            ),
      ),
      h('section', { class: 'card chart-card' }, h('h2', null, t('stats.screen.last30')), overChart(s.history)),
    );
  }

  return {
    el,
    mount: () => void load(),
    dispose: () => {
      disposed = true;
    },
  };
}

/** Marcador de los días que jugasteis los dos. */
function headToHead(r: NonNullable<PlayerProfile['headToHead']>, name: string): HTMLElement {
  if (r.played === 0) {
    return h('section', { class: 'card h2h' }, h('p', { class: 'eyebrow' }, t('profile.h2h.title')), h('p', { class: 'muted' }, t('profile.h2h.none')));
  }
  const verdict = r.myWins > r.theirWins ? t('profile.h2h.winning') : r.myWins < r.theirWins ? t('profile.h2h.losing', { name }) : t('profile.h2h.tied');
  return h(
    'section',
    { class: 'card h2h' },
    h('p', { class: 'eyebrow' }, t('profile.h2h.title')),
    h(
      'div',
      { class: 'h2h-score' },
      h('div', null, h('strong', null, String(r.myWins)), h('span', null, t('ghost.you'))),
      h('span', { class: 'h2h-vs' }, '–'),
      h('div', null, h('strong', null, String(r.theirWins)), h('span', null, name)),
    ),
    h('p', { class: 'muted' }, `${verdict} · ${tn('profile.h2h.played', r.played)}${r.ties ? ` · ${tn('profile.h2h.ties', r.ties)}` : ''}`),
  );
}
