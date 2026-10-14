// Partida de contrarreloj: cuenta atrás, y 3 minutos encadenando tableros. Cada
// tablero superado se envía (el servidor lo reproduce y da los puntos) y llega el
// siguiente; se puede saltar uno perdiendo unos segundos. Al acabar, el resultado.

import { initialState, parseBoard, type Board, type Direction, type GameState } from '../../../../common/logic/engine/board';
import { encodeRun } from '../../../../common/logic/daily/daily';
import { applyMove, isComplete } from '../../../../common/logic/engine/move';
import { solve } from '../../../../common/logic/engine/solver';
import { TIME_ATTACK_SKIP_MS } from '../../../../common/logic/timeattack/timeattack';
import type { BoardHooks } from '../../game/BoardScene';
import type { MountedBoard } from '../../game/mount';
import { celebrate } from '../../shared/celebrate';
import { formatTime, h, haptic, openModal, toast } from '../../shared/dom';
import { sfx } from '../../audio/sound';
import { go, type Screen } from '../../shared/router';
import { loadBoard, onKey, openPauseMenu, playLayout, wearHat } from '../../play/play';
import { type TimeAttackBoard, type TimeAttackStart, finishBoard, skipBoard, startTimeAttack, timeAttackResult } from './api';
import { formatPoints, openTimeAttackRanking } from './timeattack';
import { t, tn } from '../../i18n/i18n';

export function timeAttackScreen(start: TimeAttackStart, previousBest: number | null): Screen {
  let run = start.run;
  let current: TimeAttackBoard = start.board;
  let board: Board = parseBoard(current.rows);
  let state: GameState = initialState(board);
  let moves = 0;
  let attempt: Direction[] = [];
  /** Enviando un tablero o cargando el siguiente: no se mueve. */
  let busy = false;
  let over = false;
  let mounted: MountedBoard | null = null;
  let disposed = false;
  let clock = 0;
  /** El tablero que se está enviando: al acabar el tiempo se espera a que llegue. */
  let sending: Promise<unknown> | null = null;
  // Reloj del servidor visto desde aquí: el tiempo que cuenta es el suyo.
  const offset = run.serverNow - Date.now();
  const serverNow = () => Date.now() + offset;
  const started = () => serverNow() >= run.startedAt;

  const ui = playLayout({
    stats: [
      { key: 'time', label: t('stats.time') },
      { key: 'score', label: t('timeattack.points'), tone: 'gold' },
      { key: 'board', label: t('timeattack.board') },
    ],
    hint: { keys: t('timeattack.hintKeys'), touch: t('timeattack.hintTouch') },
    onMenu: () =>
      openPauseMenu(mounted, { note: t('duels.live.clockRuns'), restartLabel: t('play.restart'), onRestart: () => restart(), onExit: () => go({ name: 'home' }) }),
    onRestart: () => restart(),
    onSwipe: (dir) => mounted?.scene.requestMove(dir),
    restartLabel: t('play.restart'),
  });

  const skip = h('button', { class: 'btn small secondary ta-skip', onclick: () => void doSkip() }, `⏭ ${t('timeattack.skip', { seconds: TIME_ATTACK_SKIP_MS / 1000 })}`);
  const countdown = h('div', { class: 'ta-countdown', 'aria-live': 'polite' });
  const pops = h('div', { class: 'ta-pops', 'aria-live': 'polite' });
  ui.el.querySelector('.hint')?.before(h('div', { class: 'ta-bar' }, skip));
  ui.boardWrap.append(countdown, pops);

  const hud = () => {
    const left = Math.max(0, run.deadline - serverNow());
    ui.setStat('time', formatTime(started() ? left : run.deadline - run.startedAt), started() && left < 10_000 ? 'warn' : undefined);
    ui.setStat('score', formatPoints(run.score));
    ui.setStat('board', current.index + 1);
    ui.setTitle(t('timeattack.title'), `${t('common.optimalN', { n: current.optimal })} · ${tn('common.moves', moves)}`);
    skip.disabled = busy || over || !started();
  };

  /** «+150 🎯» o «−10 s», que sube y se desvanece sobre el tablero. */
  function pop(text: string, tone: 'good' | 'bad' = 'good') {
    const el = h('span', { class: `ta-pop ${tone}` }, text);
    pops.append(el);
    setTimeout(() => el.remove(), 1200);
  }

  const hooks: BoardHooks = {
    onMove(dir) {
      if (busy || over || !started()) return undefined;
      const next = applyMove(board, state, dir);
      if (!next) {
        haptic(20);
        return null;
      }
      attempt.push(dir);
      state = next;
      moves++;
      if (isComplete(board, state)) busy = true;
      haptic(busy ? [30, 60, 30] : 8);
      hud();
      return next;
    },
    onSettled() {
      if (busy && isComplete(board, state)) return void submitBoard();
      ui.setStuck(!busy && solve(board, state) === null);
    },
  };

  /** Pone el tablero siguiente. */
  function show(next: TimeAttackBoard) {
    current = next;
    board = parseBoard(next.rows);
    state = initialState(board);
    moves = 0;
    attempt = [];
    busy = false;
    ui.setStuck(false);
    mounted?.scene.setBoard(board, state);
    hud();
  }

  /** Vuelve a empezar el tablero en curso; el reloj sigue. */
  function restart() {
    if (busy || over) return;
    state = initialState(board);
    moves = 0;
    attempt = [];
    ui.setStuck(false);
    mounted?.scene.reset(state);
    hud();
  }

  async function submitBoard() {
    sfx.win();
    const request = finishBoard(run.id, encodeRun(attempt));
    sending = request.catch(() => {});
    try {
      const res = await request;
      if (disposed) return;
      run = res.run;
      pop(`+${formatPoints(res.points)}${res.perfect ? ' 🎯' : ''}`);
      if (over) return;
      show(res.board);
    } catch (err) {
      if (disposed) return;
      // Se acabó el tiempo mientras se enviaba: el resultado lo dirá.
      if (serverNow() >= run.deadline) return void end();
      toast((err as Error).message);
      busy = false;
      restart();
    }
  }

  async function doSkip() {
    if (busy || over || !started()) return;
    busy = true;
    hud();
    try {
      const res = await skipBoard(run.id);
      if (disposed) return;
      run = res.run;
      pop(`−${TIME_ATTACK_SKIP_MS / 1000} s`, 'bad');
      show(res.board);
    } catch (err) {
      toast((err as Error).message);
      busy = false;
      hud();
    }
  }

  /** Cuenta atrás de la salida y el reloj de la partida. */
  function tick() {
    const toStart = run.startedAt - serverNow();
    countdown.hidden = toStart <= 0;
    if (toStart > 0) countdown.textContent = String(Math.ceil(toStart / 1000));
    hud();
    if (!over && serverNow() >= run.deadline) void end();
  }

  /** Se acabó el tiempo: el resultado de la partida, tu mejor marca y tu puesto. */
  async function end() {
    if (over) return;
    over = true;
    busy = true;
    clearInterval(clock);
    hud();
    sfx.win();
    const modal = openModal([h('h2', null, t('timeattack.over')), h('p', { class: 'lead' }, t('common.loading'))]);
    // Si el último tablero aún se estaba enviando, sus puntos cuentan: se espera a que llegue.
    await sending;
    try {
      const result = await timeAttackResult(run.id);
      if (disposed) return;
      const record = result.run.score > 0 && (previousBest === null || result.run.score > previousBest);
      modal.el.replaceChildren(
        h('p', { class: 'eyebrow' }, t('timeattack.title')),
        h('h2', null, record ? `🏆 ${t('timeattack.record')}` : t('timeattack.over')),
        h('div', { class: 'score-big' }, formatPoints(result.run.score), h('small', null, t('common.pts'))),
        h(
          'div',
          { class: 'chips' },
          h('span', { class: 'chip' }, `🧊 ${tn('timeattack.boards', result.run.boards)}`),
          result.run.perfect ? h('span', { class: 'chip' }, `🎯 ${result.run.perfect}`) : null,
          result.run.skipped ? h('span', { class: 'chip' }, `⏭ ${result.run.skipped}`) : null,
        ),
        ...(result.best && !record ? [h('p', { class: 'muted' }, t('timeattack.weekBest', { points: formatPoints(result.best.score) }))] : []),
        ...(result.position !== null && result.total > 1 ? [h('p', { class: 'level-place' }, t('weekly.place', { position: result.position, total: result.total }))] : []),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', onclick: () => void again(Math.max(previousBest ?? 0, result.run.score) || null) }, `↺ ${t('weekly.playAgain')}`),
          h('button', { class: 'btn ghost', onclick: () => void openTimeAttackRanking(run.week) }, t('nav.ranking')),
        ),
        h('button', { class: 'link-btn', onclick: () => go({ name: 'home' }) }, t('common.backHome')),
      );
      if (record && previousBest !== null) void celebrate({ icon: '⏱', eyebrow: t('timeattack.title'), title: t('timeattack.record'), text: t('timeattack.recordText', { points: formatPoints(result.run.score) }), button: t('common.great') });
    } catch (err) {
      modal.el.replaceChildren(h('h2', null, t('timeattack.over')), h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: () => go({ name: 'home' }) }, t('common.backHome')));
    }
  }

  async function again(best: number | null) {
    try {
      go({ name: 'timeAttack', start: await startTimeAttack(run.week), previousBest: best });
    } catch (err) {
      toast((err as Error).message);
    }
  }

  let removeKeys = () => {};
  return {
    el: ui.el,
    async mount() {
      tick();
      clock = window.setInterval(tick, 100);
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
      removeKeys();
      mounted?.destroy();
      ui.dispose();
    },
  };
}
