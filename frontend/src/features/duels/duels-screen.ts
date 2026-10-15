// Pantalla de duelos: retar a alguien y tus duelos (te esperan, esperando al rival
// y terminados). Cada duelo se juega en su sala. Con `open` (el id de un enlace
// ?duelo=) se va directamente a ella.

import { movesLabel } from '../../shared/result';
import { h } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import { type Duel, listDuels } from './api';
import { avatar, rivalName, confirmDecline, difficultyLabel, enterRoom, myTurn, openNewDuel, outcomeText, shareDuel, showDuelResult, timeLeft } from './duels';
import { playerName, t } from '../../i18n/i18n';

export function duelsScreen(open?: string): Screen {
  const body = h('div', { class: 'duels-body' }, h('p', { class: 'empty' }, t('common.loading')));
  let disposed = false;

  const el = h(
    'div',
    { class: 'screen duels' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': t('common.back'), onclick: () => go({ name: 'home' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, t('nav.duels')), h('p', null, t('duels.screen.subtitle'))),
    ),
    h('button', { class: 'btn big block', onclick: () => void openNewDuel(() => void load()) }, `⚔️ ${t('duels.new.eyebrow')}`),
    body,
  );

  function card(duel: Duel): HTMLElement {
    const rival = duel.rival;
    const over = duel.status === 'finished' || duel.status === 'declined';
    const turn = duel.status === 'playing' && !duel.me.handedIn;
    let detail: string;
    if (over) detail = outcomeText(duel);
    else if (duel.status === 'open') detail = t('duels.screen.noOneYet');
    else if (duel.status === 'playing')
      detail = duel.me.handedIn
        ? t('duels.screen.notHandedIn', { mark: movesLabel(duel.me.moves ?? duel.optimal) })
        : t('duels.screen.yourTurn');
    else detail = rival?.present ? `⚡ ${t('duels.room.rivalHere', { name: rivalName(duel) })}` : t('duels.screen.waitingFor', { name: rivalName(duel) });

    const actions: (HTMLElement | null)[] = [];
    if (!over) {
      const label = duel.status === 'playing' ? (duel.me.handedIn ? t('duels.room.see') : t('duels.screen.resume')) : t('duels.room.enter');
      actions.push(h('button', { class: `btn small ${turn ? '' : 'secondary'}`, onclick: () => enterRoom(duel) }, label));
    }
    if (duel.status === 'waiting' && duel.role === 'opponent') {
      actions.push(h('button', { class: 'link-btn', onclick: () => confirmDecline(duel, () => void load()) }, t('duels.decline.button')));
    }
    if (duel.status === 'open') actions.push(h('button', { class: 'link-btn', onclick: () => shareDuel(duel) }, t('duels.screen.shareLink')));
    if (over) actions.push(h('button', { class: 'btn small ghost', onclick: () => showDuelResult(duel, () => void load()) }, t('duels.screen.seeResult')));

    return h(
      'article',
      { class: `card duel-card ${turn ? 'turn' : ''} ${duel.outcome ?? ''}` },
      rival ? avatar(rival.hat) : h('span', { class: 'avatar duel-link-icon', 'aria-hidden': 'true' }, '🔗'),
      h(
        'div',
        { class: 'duel-info' },
        h('strong', null, rival ? playerName(rival.name) : t('duels.screen.linkDuel')),
        h('small', null, [difficultyLabel(duel.difficulty), over ? null : timeLeft(duel.expiresAt)].filter(Boolean).join(' · ')),
        h('span', { class: 'duel-detail' }, detail),
      ),
      h('div', { class: 'duel-actions' }, ...actions),
    );
  }

  function section(title: string, duels: Duel[]): HTMLElement | null {
    if (!duels.length) return null;
    return h('section', { class: 'duel-section' }, h('p', { class: 'eyebrow' }, title), ...duels.map(card));
  }

  async function load() {
    try {
      const duels = await listDuels();
      if (disposed) return;
      const turn = myTurn(duels);
      const waiting = duels.filter((d) => !turn.includes(d) && (d.status === 'open' || d.status === 'waiting' || d.status === 'playing'));
      const over = duels.filter((d) => d.status === 'finished' || d.status === 'declined');
      const sections = [section(t('duels.screen.sectionTurn'), turn), section(t('duels.screen.sectionWaiting'), waiting), section(t('duels.screen.sectionOver'), over)].filter(
        (s) => s !== null,
      );
      body.replaceChildren(
        ...(sections.length
          ? sections
          : [h('section', { class: 'card empty' }, h('div', { style: 'font-size: 44px' }, '⚔️'), h('p', { class: 'muted' }, t('duels.screen.empty')))]),
      );
    } catch (err) {
      body.replaceChildren(
        h('section', { class: 'card empty' }, h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: () => void load() }, t('common.retry'))),
      );
    }
  }

  return {
    el,
    mount() {
      if (open) return enterRoom({ id: open });
      void load();
    },
    dispose() {
      disposed = true;
    },
  };
}
