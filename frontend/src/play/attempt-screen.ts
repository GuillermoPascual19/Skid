// Partida «al mejor intento» (reto semanal y duelos): cada intento empieza de
// cero, al terminarlo se envía al servidor y este se queda con el mejor. Sin pistas.
// Lo propio de cada modo (a dónde se envía y qué se cuenta al terminar) llega en `opts`.

import { initialState, parseBoard, type Direction } from '../../../common/logic/engine/board';
import { encodeRun } from '../../../common/logic/daily/daily';
import { movesBig, movesLabel } from '../shared/result';
import { applyMove, isComplete } from '../../../common/logic/engine/move';
import { solve } from '../../../common/logic/engine/solver';
import type { BoardHooks } from '../game/BoardScene';
import type { MountedBoard } from '../game/mount';
import { h, haptic, openModal, type Modal } from '../shared/dom';
import { sfx } from '../audio/sound';
import { go, type Screen } from '../shared/router';
import { loadBoard, onKey, openPauseMenu, playLayout, wearHat } from './play';
import { t } from '../i18n/i18n';

/** Lo que cuenta el servidor tras recibir un intento. */
export interface AttemptOutcome {
  /** Tu mejor marca tras este intento (golpes de más). */
  readonly bestOverPar: number | null;
  /** Frase bajo el resultado (nueva mejor marca, te quedas con la tuya…). */
  readonly note: string;
  /** Línea destacada (puesto, resultado del duelo…), si la hay. */
  readonly highlight?: string;
  /** Ya no se puede volver a intentar (p. ej. el duelo ha terminado). */
  readonly closed?: boolean;
}

export interface AttemptScreenOptions {
  readonly title: string;
  readonly subtitle: string;
  /** Encabezado del modal de resultado. */
  readonly eyebrow: string;
  readonly rows: string[];
  readonly optimal: number;
  /** Tu mejor marca al entrar (golpes de más), o null. */
  readonly bestOverPar: number | null;
  /** Envía el intento (registro de movimientos) y dice qué ha pasado. */
  submit(log: string, moves: number): Promise<AttemptOutcome>;
  /** Botón junto a «Mejorar» en el resultado (ranking, ver el duelo…). */
  readonly secondary: { label: string; onclick: () => void };
  /** Dejar de jugar y entregar la marca (duelos). Al hacerlo ya no se puede reintentar. */
  readonly handIn?: { label: string; run(): Promise<AttemptOutcome> };
}

function headline(over: number): string {
  if (over === 0) return t('golf.headline.par');
  if (over <= 2) return t('golf.headline.close');
  return t('golf.headline.done');
}

export function attemptScreen(opts: AttemptScreenOptions): Screen {
  const board = parseBoard(opts.rows);
  const { optimal } = opts;
  let best = opts.bestOverPar;
  let closed = false;

  let state = initialState(board);
  let moves = 0;
  let attempt: Direction[] = [];
  let finished = false;
  let mounted: MountedBoard | null = null;
  let disposed = false;
  let result: Modal | null = null;

  const ui = playLayout({
    stats: [
      { key: 'moves', label: t('stats.strokes') },
      { key: 'optimal', label: t('stats.optimal'), tone: 'gold' },
      { key: 'best', label: t('stats.yourBest') },
    ],
    hint: {
      keys: t('play.hintKeysFreeRestart'),
      touch: t('play.hintTouchFreeRestart'),
    },
    onMenu: () => openPauseMenu(mounted, { restartLabel: t('play.restart'), onRestart: () => restart(), onExit: () => go({ name: 'home' }) }),
    onRestart: () => restart(),
    onSwipe: (dir) => mounted?.scene.requestMove(dir),
    restartLabel: t('play.restart'),
  });
  ui.setTitle(opts.title, opts.subtitle);

  const hud = () => {
    ui.setStat('moves', moves, moves > optimal ? 'warn' : undefined);
    ui.setStat('optimal', optimal);
    ui.setStat('best', best !== null ? movesLabel(optimal + best) : '—');
  };

  const hooks: BoardHooks = {
    onMove(dir) {
      if (finished || closed) return undefined;
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
        if (!result) void finish();
        return;
      }
      ui.setStuck(solve(board, state) === null);
    },
  };

  function restart() {
    if (closed) return;
    result?.close();
    result = null;
    state = initialState(board);
    moves = 0;
    attempt = [];
    finished = false;
    ui.setStuck(false);
    hud();
    mounted?.scene.reset(state);
  }

  async function finish() {
    sfx.win();
    const over = Math.max(0, moves - optimal);
    const note = h('p', { class: 'result-note' }, t('common.saving'));
    const highlight = h('p', { class: 'level-place', hidden: true });
    const retry = h('button', { class: 'btn secondary', onclick: () => restart() }, over === 0 ? t('golf.again') : `↺ ${t('golf.improve')}`);
    const handIn = opts.handIn
      ? h('button', { class: 'btn block', hidden: true, onclick: () => void doHandIn() }, opts.handIn.label)
      : null;
    const show = (outcome: AttemptOutcome) => {
      best = outcome.bestOverPar;
      closed = !!outcome.closed;
      retry.hidden = closed;
      if (handIn) handIn.hidden = closed;
      hud();
      note.textContent = outcome.note;
      highlight.textContent = outcome.highlight ?? '';
      highlight.hidden = !outcome.highlight;
    };
    async function doHandIn() {
      handIn!.disabled = true;
      try {
        show(await opts.handIn!.run());
      } catch (err) {
        note.textContent = (err as Error).message;
        handIn!.disabled = false;
      }
    }
    result = openModal([
      h('p', { class: 'eyebrow' }, opts.eyebrow),
      h('h2', null, headline(over)),
      movesBig(moves, optimal),
      h('p', { class: 'lead' }, t('common.optimalN', { n: optimal })),
      note,
      highlight,
      h('div', { class: 'row' }, retry, h('button', { class: 'btn ghost', onclick: opts.secondary.onclick }, opts.secondary.label)),
      handIn,
      h('button', { class: 'link-btn', onclick: () => go({ name: 'home' }) }, t('common.backHome')),
    ]);

    try {
      const outcome = await opts.submit(encodeRun(attempt), moves);
      if (disposed) return;
      show(outcome);
      if (handIn) handIn.hidden = closed; // Ya hay marca: se puede entregar.
    } catch (err) {
      note.textContent = t('common.saveFailed', { error: (err as Error).message });
      note.classList.add('error');
    }
  }

  let removeKeys = () => {};
  return {
    el: ui.el,
    async mount() {
      hud();
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
      removeKeys();
      mounted?.destroy();
      ui.dispose();
    },
  };
}
