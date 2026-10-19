// Sala del duelo: se entra al crearlo o al aceptarlo (también desde el enlace).
// Mientras está abierta avisa al servidor de que sigues aquí; cuando estáis los
// dos y habéis pulsado Empezar, cuenta atrás y a jugar. Si ya has terminado, espera al rival; si el duelo
// ha acabado, el resultado. Queda en la dirección para volver aquí al recargar.

import { penguinSvg } from '../../../../common/art/hats';
import { DUEL_POLL_MS } from '../../../../common/logic/duels/duels';
import { h, svg, toast } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import { ensureName } from '../profile/profile';
import { type Duel, type DuelInvite, type DuelSide, acceptDuel, duelHere, getDuel, setDuelReady } from './api';
import { clearDuelUrl, confirmDecline, difficultyLabel, duelResultContent, keepDuelInUrl, rivalName, shareDuel, timeLeft, waitingForRival } from './duels';
import { playerName, t } from '../../i18n/i18n';
import { duelNotifyHint } from '../notifications/notifications';

export function duelRoomScreen(id: string): Screen {
  const subtitle = h('p');
  const body = h('div', { class: 'duel-room' }, h('p', { class: 'empty' }, t('common.loading')));
  const el = h(
    'div',
    { class: 'screen duels' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': t('common.back'), onclick: () => go({ name: 'duels' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, t('duels.room.title')), subtitle),
    ),
    body,
  );

  let duel: Duel | null = null;
  let offset = 0;
  /** «Avísame cuando entre», si las notificaciones están apagadas (se mira una vez). */
  let notifyHint: HTMLElement | null = null;
  void duelNotifyHint().then((el) => (notifyHint = el));
  let disposed = false;
  let poll = 0;
  let tick = 0;

  /** Pregunta al servidor (y, mientras se espera a empezar, le dice que sigues aquí). */
  async function refresh() {
    clearTimeout(poll);
    try {
      if (!duel) {
        const { duel: found, invite } = await getDuel(id);
        if (disposed) return;
        if (invite) return renderInvite(invite);
        duel = found;
      }
      if (duel && (duel.status === 'open' || duel.status === 'waiting')) duel = await duelHere(id);
      else if (duel) duel = (await getDuel(id)).duel;
      if (disposed || !duel) return;
      offset = duel.serverNow - Date.now();
      render(duel);
    } catch (err) {
      if (disposed) return;
      // Si ya se veía la sala, un fallo suelto de red no la borra: se reintenta.
      if (!duel) {
        body.replaceChildren(h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: () => void refresh() }, t('common.retry')));
        return;
      }
    }
    if (!disposed && duel && duel.status !== 'finished' && duel.status !== 'declined') poll = window.setTimeout(() => void refresh(), DUEL_POLL_MS);
  }

  /** Un jugador en la sala: su pingüino y si está dentro. */
  function seat(name: string, side: DuelSide | null, isMe: boolean): HTMLElement {
    const here = isMe || side?.present;
    const ready = here && side?.ready;
    const state = ready ? `⚔️ ${t('duels.room.wantsToStart')}` : here ? `✓ ${t('duels.room.here')}` : side ? t('duels.room.away') : t('duels.room.nobodyYet');
    return h(
      'div',
      { class: `duel-seat ${here ? 'here' : ''} ${ready ? 'ready' : ''}` },
      h('div', { class: 'duel-seat-penguin' }, side || isMe ? svg(penguinSvg(side?.hat ?? null)) : h('span', { class: 'duel-seat-unknown' }, '?')),
      h('strong', null, name),
      h('span', { class: 'duel-seat-state' }, state),
    );
  }

  function seats(d: Duel): HTMLElement {
    return h(
      'div',
      { class: 'duel-seats' },
      seat(t('ghost.you'), d.me, true),
      h('span', { class: 'duel-vs' }, 'VS'),
      seat(d.rival ? playerName(d.rival.name) : t('duels.screen.linkDuel'), d.rival, false),
    );
  }

  function render(d: Duel) {
    subtitle.textContent = `${difficultyLabel(d.difficulty)} · ${t('common.optimalN', { n: d.optimal })}`;
    clearInterval(tick);

    if (d.status === 'finished' || d.status === 'declined') {
      clearDuelUrl();
      body.replaceChildren(
        h('section', { class: 'card duel-result-card' }, ...duelResultContent(d, { onChange: () => go({ name: 'duels' }) })),
        h('button', { class: 'btn ghost block', onclick: () => go({ name: 'duels' }) }, t('nav.duels')),
      );
      return;
    }

    if (d.status === 'playing') {
      if (d.me.handedIn) {
        body.replaceChildren(h('section', { class: 'card duel-wait-card' }, ...waitingForRival(d)));
        return;
      }
      // Cuenta atrás hasta la hora fijada por el servidor; luego, a jugar.
      const number = h('div', { class: 'duel-countdown' });
      body.replaceChildren(seats(d), h('section', { class: 'card duel-start' }, h('p', { class: 'eyebrow' }, t('duels.room.starting')), number));
      const update = () => {
        const left = (d.startsAt ?? 0) - (Date.now() + offset);
        if (left <= 0) {
          clearInterval(tick);
          go({ name: 'duel', duel: d });
          return;
        }
        const n = String(Math.ceil(left / 1000));
        if (number.textContent !== n) {
          number.textContent = n;
          number.classList.remove('pop');
          void number.offsetWidth; // Reinicia la animación en cada número.
          number.classList.add('pop');
        }
      };
      update();
      tick = window.setInterval(update, 100);
      return;
    }

    // Esperando: a que alguien abra el enlace, a que el rival entre en la sala o a que
    // pulséis Empezar los dos.
    const rival = d.rival;
    const name = rivalName(d);
    const rivalReady = !!rival?.present && rival.ready;
    const message = !rival
      ? t('duels.room.waitingLink')
      : d.me.ready
        ? rival.present
          ? t('duels.room.waitingStart', { name })
          : t('duels.screen.waitingFor', { name })
        : rivalReady
          ? t('duels.room.rivalWants', { name })
          : rival.present
            ? t('duels.room.bothHere')
            : t('duels.screen.waitingFor', { name });
    body.replaceChildren(
      seats(d),
      h(
        'section',
        { class: `card duel-waiting ${rivalReady && !d.me.ready ? 'nudge' : ''}` },
        !rival || d.me.ready || !rival.present ? h('span', { class: 'duel-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')) : null,
        h('h2', null, message),
        h('p', { class: 'muted' }, rival ? t('duels.room.pressStart') : t('duels.room.keepOpen')),
        rival && !d.me.ready ? h('button', { class: 'btn big block duel-start-btn', onclick: () => void ready(true) }, `⚔️ ${t('duels.room.start')}`) : null,
        rival && d.me.ready ? h('button', { class: 'link-btn', onclick: () => void ready(false) }, t('duels.room.notYet')) : null,
        rival && !rival.present ? notifyHint : null,
        h('p', { class: 'muted small' }, timeLeft(d.expiresAt)),
        !rival ? h('button', { class: 'btn block', onclick: () => shareDuel(d) }, `🔗 ${t('duels.screen.shareLink')}`) : null,
        rival && d.role === 'opponent'
          ? h('button', { class: 'link-btn', onclick: () => confirmDecline(d, () => go({ name: 'duels' })) }, t('duels.decline.button'))
          : null,
      ),
    );
  }

  /** Pulsas Empezar (o lo deshaces): se pinta enseguida con la respuesta del servidor. */
  async function ready(value: boolean) {
    try {
      duel = await setDuelReady(id, value);
      if (disposed) return;
      offset = duel.serverNow - Date.now();
      render(duel);
    } catch (err) {
      toast((err as Error).message);
    }
  }

  /** Alguien abre el enlace de un duelo abierto: quién reta y aceptar (o no). */
  function renderInvite(invite: DuelInvite) {
    subtitle.textContent = difficultyLabel(invite.difficulty);
    const accept = h('button', { class: 'btn' }, t('duels.invite.accept'));
    accept.addEventListener('click', async () => {
      accept.disabled = true;
      try {
        if (!(await ensureName())) return void (accept.disabled = false);
        duel = await acceptDuel(invite.id);
        if (disposed) return;
        offset = duel.serverNow - Date.now();
        render(duel);
        poll = window.setTimeout(() => void refresh(), DUEL_POLL_MS);
      } catch (err) {
        toast((err as Error).message);
        accept.disabled = false;
      }
    });
    body.replaceChildren(
      h(
        'section',
        { class: 'card duel-invite' },
        h('div', { class: 'duel-invite-penguin' }, svg(penguinSvg(invite.challenger.hat))),
        h('p', { class: 'eyebrow' }, t('ghost.duelSubtitle', { difficulty: difficultyLabel(invite.difficulty) })),
        h('h2', null, t('duels.invite.title', { name: playerName(invite.challenger.name) })),
        h('p', { class: 'lead' }, t('duels.invite.text', { left: timeLeft(invite.expiresAt) })),
        h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => go({ name: 'duels' }) }, t('common.notNow')), accept),
      ),
    );
  }

  // Al volver de otra app (WhatsApp…), se pregunta enseguida en vez de esperar.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !disposed) void refresh();
  };

  return {
    el,
    mount() {
      keepDuelInUrl(id);
      document.addEventListener('visibilitychange', onVisible);
      void refresh();
    },
    dispose() {
      disposed = true;
      clearTimeout(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
      // Si se va a la partida, esta vuelve a ponerlo; si se sale, ya no hace falta.
      clearDuelUrl();
    },
  };
}
