// Pantalla de duelos: retar a alguien y tus duelos (te toca, esperando al rival y terminados).
// Con `open` (el id de un enlace ?duelo=) enseña la invitación o el duelo.

import { movesLabel } from '../../shared/result';
import { h, toast } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import { type Duel, getDuel, listDuels } from './api';
import { avatar, rivalName, confirmDecline, difficultyLabel, myTurn, openInvite, openNewDuel, outcomeText, playDuel, shareDuel, showDuelResult, timeLeft } from './duels';
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
    else if (turn)
      detail = duel.me.finished
        ? t('duels.screen.notHandedIn', { mark: movesLabel(duel.optimal + (duel.me.overPar ?? 0)) })
        : rival?.handedIn
          ? t('duels.play.rivalHandedIn', { name: rivalName(duel) })
          : t('duels.screen.yourTurn');
    else detail = t('duels.screen.waitingFor', { name: rivalName(duel) });

    const actions: (HTMLElement | null)[] = [];
    if (turn) actions.push(h('button', { class: 'btn small', onclick: () => void playDuel(duel) }, duel.me.started ? t('duels.screen.resume') : t('common.play')));
    if (turn && duel.role === 'opponent' && !duel.me.started) {
      actions.push(h('button', { class: 'link-btn', onclick: () => confirmDecline(duel, () => void load()) }, t('duels.decline.button')));
    }
    if (duel.status === 'open') actions.push(h('button', { class: 'btn small secondary', onclick: () => shareDuel(duel) }, t('duels.screen.shareLink')));
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
      const waiting = duels.filter((d) => !turn.includes(d) && (d.status === 'open' || d.status === 'playing'));
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
      body.replaceChildren(h('p', { class: 'error' }, (err as Error).message));
    }
  }

  /** El enlace ?duelo=: la invitación si es para ti, o el duelo si ya juegas en él. */
  async function openLink(id: string) {
    try {
      const { duel, invite } = await getDuel(id);
      if (disposed) return;
      if (invite) return openInvite(invite, (accepted) => void playDuel(accepted));
      if (!duel) return;
      if (duel.status === 'finished' || duel.status === 'declined') showDuelResult(duel, () => void load());
      else if (duel.status === 'playing' && !duel.me.handedIn) void playDuel(duel);
      else if (duel.status === 'open') shareDuel(duel);
    } catch (err) {
      toast((err as Error).message);
    }
  }

  return {
    el,
    mount() {
      void load();
      if (open) void openLink(open);
    },
    dispose() {
      disposed = true;
    },
  };
}
