// Pantalla de duelos: retar a alguien y tus duelos (te toca, esperando al rival y terminados).
// Con `open` (el id de un enlace ?duelo=) enseña la invitación o el duelo.

import { golfLabel } from '../../../../common/logic/daily/score';
import { h, toast } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import { type Duel, getDuel, listDuels } from './api';
import { avatar, confirmDecline, difficultyLabel, myTurn, openInvite, openNewDuel, outcomeText, playDuel, shareDuel, showDuelResult, timeLeft } from './duels';

export function duelsScreen(open?: string): Screen {
  const body = h('div', { class: 'duels-body' }, h('p', { class: 'empty' }, 'Cargando…'));
  let disposed = false;

  const el = h(
    'div',
    { class: 'screen duels' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: () => go({ name: 'home' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, 'Duelos'), h('p', null, 'Reta a un amigo al mismo tablero')),
    ),
    h('button', { class: 'btn big block', onclick: () => void openNewDuel(() => void load()) }, '⚔️ Nuevo duelo'),
    body,
  );

  function card(duel: Duel): HTMLElement {
    const rival = duel.rival;
    const over = duel.status === 'finished' || duel.status === 'declined';
    const turn = duel.status === 'playing' && !duel.me.handedIn;
    let detail: string;
    if (over) detail = outcomeText(duel);
    else if (duel.status === 'open') detail = 'Nadie ha aceptado el enlace todavía';
    else if (turn) detail = duel.me.finished ? `Tu mejor: ${golfLabel(duel.me.overPar ?? 0)} · sin entregar` : rival?.handedIn ? `${rival.name} ya ha entregado su marca` : 'Te toca jugar';
    else detail = `Esperando a ${rival?.name ?? 'tu rival'}`;

    const actions: (HTMLElement | null)[] = [];
    if (turn) actions.push(h('button', { class: 'btn small', onclick: () => void playDuel(duel) }, duel.me.started ? 'Seguir' : 'Jugar'));
    if (turn && duel.role === 'opponent' && !duel.me.started) {
      actions.push(h('button', { class: 'link-btn', onclick: () => confirmDecline(duel, () => void load()) }, 'Rechazar'));
    }
    if (duel.status === 'open') actions.push(h('button', { class: 'btn small secondary', onclick: () => shareDuel(duel) }, 'Compartir enlace'));
    if (over) actions.push(h('button', { class: 'btn small ghost', onclick: () => showDuelResult(duel, () => void load()) }, 'Ver resultado'));

    return h(
      'article',
      { class: `card duel-card ${turn ? 'turn' : ''} ${duel.outcome ?? ''}` },
      rival ? avatar(rival.hat) : h('span', { class: 'avatar duel-link-icon', 'aria-hidden': 'true' }, '🔗'),
      h(
        'div',
        { class: 'duel-info' },
        h('strong', null, rival ? rival.name : 'Duelo por enlace'),
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
      const sections = [section('Te toca', turn), section('Esperando al rival', waiting), section('Terminados', over)].filter((s) => s !== null);
      body.replaceChildren(
        ...(sections.length
          ? sections
          : [h('section', { class: 'card empty' }, h('div', { style: 'font-size: 44px' }, '⚔️'), h('p', { class: 'muted' }, 'Aún no tienes duelos. ¡Reta a un amigo!'))]),
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
