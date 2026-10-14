// Partida de un duelo en directo: un intento, con el reloj corriendo desde que
// empezó el duelo (reiniciar se puede, pero el reloj sigue). Al terminar se envía
// y se espera al rival en un modal; cuando acabáis los dos, el resultado.

import { initialState, parseBoard, type Direction } from '../../../../common/logic/engine/board';
import { encodeRun } from '../../../../common/logic/daily/daily';
import { applyMove, isComplete } from '../../../../common/logic/engine/move';
import { solve } from '../../../../common/logic/engine/solver';
import { DUEL_POLL_MS } from '../../../../common/logic/duels/duels';
import type { BoardHooks } from '../../game/BoardScene';
import type { MountedBoard } from '../../game/mount';
import { formatTime, h, haptic, openModal, type Modal } from '../../shared/dom';
import { sfx } from '../../audio/sound';
import { go, type Screen } from '../../shared/router';
import { loadBoard, onKey, openPauseMenu, playLayout, wearHat } from '../../play/play';
import { type Duel, finishDuel, getDuel } from './api';
import { clearDuelUrl, difficultyLabel, duelResultContent, keepDuelInUrl, rivalName, waitingForRival } from './duels';
import { t } from '../../i18n/i18n';

export function duelPlayScreen(duel: Duel): Screen {
  const board = parseBoard(duel.rows);
  const { optimal } = duel;
  const name = rivalName(duel);
  // Reloj del servidor visto desde aquí: así el tiempo es el mismo para los dos.
  const offset = duel.serverNow - Date.now();
  const serverNow = () => Date.now() + offset;
  const startsAt = duel.startsAt ?? serverNow();

  let state = initialState(board);
  let moves = 0;
  let attempt: Direction[] = [];
  let finished = false;
  let mounted: MountedBoard | null = null;
  let disposed = false;
  let modal: Modal | null = null;
  let clock = 0;
  let poll = 0;

  const ui = playLayout({
    stats: [
      { key: 'moves', label: t('stats.strokes') },
      { key: 'optimal', label: t('stats.optimal'), tone: 'gold' },
      { key: 'time', label: t('stats.time') },
    ],
    hint: { keys: t('duels.live.hintKeys'), touch: t('duels.live.hintTouch') },
    onMenu: () =>
      openPauseMenu(mounted, { note: t('duels.live.clockRuns'), restartLabel: t('play.restart'), onRestart: () => restart(), onExit: () => go({ name: 'duels' }) }),
    onRestart: () => restart(),
    onSwipe: (dir) => mounted?.scene.requestMove(dir),
    restartLabel: t('play.restart'),
  });
  ui.setTitle(t('duels.play.title', { name }), difficultyLabel(duel.difficulty));

  const hud = () => {
    ui.setStat('moves', moves, moves > optimal ? 'warn' : undefined);
    ui.setStat('optimal', optimal);
    ui.setStat('time', formatTime(Math.max(0, serverNow() - startsAt)));
  };

  const hooks: BoardHooks = {
    onMove(dir) {
      if (finished) return undefined;
      const next = applyMove(board, state, dir);
      if (!next) {
        haptic(20);
        return null;
      }
      attempt.push(dir);
      state = next;
      moves++;
      finished = isComplete(board, state);
      haptic(finished ? [30, 60, 30] : 8);
      hud();
      return next;
    },
    onSettled() {
      if (finished) {
        if (!modal) void submit();
        return;
      }
      ui.setStuck(solve(board, state) === null);
    },
  };

  /** Vuelve a empezar el tablero; el reloj sigue corriendo. */
  function restart() {
    if (finished) return;
    state = initialState(board);
    moves = 0;
    attempt = [];
    ui.setStuck(false);
    hud();
    mounted?.scene.reset(state);
  }

  async function submit() {
    sfx.win();
    clearInterval(clock);
    hud();
    modal = openModal([h('h2', null, t('golf.headline.done')), h('p', { class: 'lead' }, t('common.saving'))]);
    try {
      show((await finishDuel(duel.id, encodeRun(attempt))).duel);
    } catch (err) {
      modal.el.replaceChildren(
        h('h2', null, t('golf.headline.done')),
        h('p', { class: 'error' }, t('common.saveFailed', { error: (err as Error).message })),
        h('button', { class: 'btn block', onclick: () => go({ name: 'duelRoom', id: duel.id }) }, t('duels.room.back')),
      );
    }
  }

  /** Se acabó el tiempo sin terminar: a esperar el resultado. */
  function timeUp() {
    finished = true;
    clearInterval(clock);
    modal = openModal([h('h2', null, t('duels.live.timeUp')), h('p', { class: 'lead' }, t('common.loading'))]);
    void refresh();
  }

  /** Esperando al rival (con la animación) o, si ya habéis terminado los dos, el resultado. */
  function show(d: Duel) {
    if (disposed || !modal) return;
    if (d.status === 'finished' || d.status === 'declined') {
      clearDuelUrl();
      if (d.outcome === 'win') sfx.win();
      modal.el.replaceChildren(
        ...duelResultContent(d, { onChange: () => go({ name: 'duels' }), close: () => modal?.close() }),
        h('button', { class: 'link-btn', onclick: () => go({ name: 'duels' }) }, t('nav.duels')),
      );
      return;
    }
    modal.el.replaceChildren(...waitingForRival(d));
    poll = window.setTimeout(() => void refresh(), DUEL_POLL_MS);
  }

  async function refresh() {
    try {
      const { duel: d } = await getDuel(duel.id);
      if (d) show(d);
    } catch {
      // Sin conexión un momento: se vuelve a preguntar.
      if (!disposed) poll = window.setTimeout(() => void refresh(), DUEL_POLL_MS);
    }
  }

  let removeKeys = () => {};
  return {
    el: ui.el,
    async mount() {
      keepDuelInUrl(duel.id);
      hud();
      clock = window.setInterval(() => {
        hud();
        if (!finished && serverNow() >= duel.expiresAt) timeUp();
      }, 250);
      removeKeys = onKey((e) => {
        if (e.key === 'r' || e.key === 'R') restart();
        if (e.key === 'Escape') ui.el.querySelector<HTMLButtonElement>('.pause-btn')?.click();
      });
      const m = await loadBoard(ui.boardWrap, board, hooks);
      if (disposed) return m.destroy();
      mounted = m;
      m.scene.setBoard(board, state);
      wearHat(m);
    },
    dispose() {
      disposed = true;
      clearInterval(clock);
      clearTimeout(poll);
      removeKeys();
      mounted?.destroy();
      ui.dispose();
      clearDuelUrl();
    },
  };
}
