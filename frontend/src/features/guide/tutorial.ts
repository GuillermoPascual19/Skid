// Tutorial interactivo: tres tableros mini que enseñan las reglas jugando
// (deslizar hasta chocar, usar los muros para girar y recoger en orden). Una
// flecha marca el siguiente movimiento; si el jugador se desvía, la flecha se
// recalcula desde donde esté, y si se queda sin salida el tablero vuelve a
// empezar. Sale la primera vez, en lugar de la guía, y desde la guía.

import { initialState, parseBoard, type Board, type GameState } from '../../../../common/logic/engine/board';
import { applyMove, isComplete } from '../../../../common/logic/engine/move';
import { solve } from '../../../../common/logic/engine/solver';
import type { BoardHooks } from '../../game/BoardScene';
import type { MountedBoard } from '../../game/mount';
import { h, haptic, openModal } from '../../shared/dom';
import { sfx } from '../../audio/sound';
import { go, type Screen } from '../../shared/router';
import { loadBoard, onKey, openPauseMenu, playLayout, wearHat } from '../../play/play';
import { dismissGuideNews, openGuide } from './guide';
import { openDaily } from '../daily/daily';
import { t, type TextKey } from '../../i18n/i18n';

interface Lesson {
  readonly rows: readonly string[];
  readonly title: TextKey;
  readonly text: TextKey;
}

const LESSONS: readonly Lesson[] = [
  // Un movimiento: hasta el final de la fila.
  { rows: ['#######', '#@...1#', '#######'], title: 'tutorial.slide.title', text: 'tutorial.slide.text' },
  // Derecha, abajo, izquierda: los muros son los frenos.
  { rows: ['#######', '#@....#', '#####.#', '#1....#', '#######'], title: 'tutorial.walls.title', text: 'tutorial.walls.text' },
  // Yendo a la derecha se choca con el 2: primero hay que dar la vuelta hasta el 1.
  { rows: ['#######', '#@.2.1#', '#.....#', '#######'], title: 'tutorial.order.title', text: 'tutorial.order.text' },
];

/** Pausa tras completar un tablero antes de pasar al siguiente (ms). */
const NEXT_DELAY = 1100;

export function tutorialScreen(): Screen {
  let index = 0;
  let board: Board = parseBoard(LESSONS[0].rows);
  let state: GameState = initialState(board);
  let done = false;
  let mounted: MountedBoard | null = null;
  let disposed = false;
  let timer = 0;

  const ui = playLayout({
    stats: [],
    hint: { keys: t('play.hintKeys'), touch: t('play.hintTouch') },
    onMenu: () => openPauseMenu(mounted, { restartLabel: t('play.restart'), onRestart: () => restart(), onExit: () => skip() }),
    onRestart: () => restart(),
    onSwipe: (dir) => mounted?.scene.requestMove(dir),
    restartLabel: t('play.restart'),
  });
  const lessonTitle = h('h2');
  const lessonText = h('p', { class: 'lead' });
  const card = h('section', { class: 'card tutorial-card', 'aria-live': 'polite' }, lessonTitle, lessonText);
  ui.el.insertBefore(card, ui.boardWrap);
  ui.el.append(h('button', { class: 'link-btn tutorial-skip', onclick: () => skip() }, t('tutorial.skip')));

  function showLesson() {
    const lesson = LESSONS[index];
    ui.setTitle(t('tutorial.title'), t('tutorial.step', { n: index + 1, total: LESSONS.length }));
    lessonTitle.textContent = t(lesson.title);
    lessonText.textContent = t(lesson.text);
    card.classList.remove('done');
  }

  /** La flecha del siguiente movimiento, desde donde esté el pingüino. */
  function pointNext() {
    const next = solve(board, state)?.[0];
    if (next) mounted?.scene.showHint(next);
    return next !== undefined;
  }

  const hooks: BoardHooks = {
    onMove(dir) {
      if (done) return undefined;
      const next = applyMove(board, state, dir);
      if (!next) {
        haptic(20);
        return null;
      }
      state = next;
      done = isComplete(board, state);
      haptic(done ? [30, 60, 30] : 8);
      return next;
    },
    onSettled() {
      if (done) return void lessonDone();
      // Sin salida desde aquí: se vuelve a empezar, con un aviso.
      if (!pointNext()) {
        lessonText.textContent = t('tutorial.again');
        timer = window.setTimeout(restart, 900);
      }
    },
  };

  function restart() {
    clearTimeout(timer);
    state = initialState(board);
    done = false;
    showLesson();
    mounted?.scene.reset(state);
    pointNext();
  }

  function lessonDone() {
    sfx.win();
    card.classList.add('done');
    lessonTitle.textContent = `✓ ${t('tutorial.wellDone')}`;
    timer = window.setTimeout(() => {
      if (disposed) return;
      if (index === LESSONS.length - 1) return finish();
      index++;
      board = parseBoard(LESSONS[index].rows);
      state = initialState(board);
      done = false;
      showLesson();
      mounted?.scene.setBoard(board, state);
      pointNext();
    }, NEXT_DELAY);
  }

  /** Terminado: ya sabe jugar. A por el reto del día, o a leer las reglas. */
  function finish() {
    dismissGuideNews();
    const modal = openModal([
      h('p', { class: 'eyebrow' }, t('tutorial.title')),
      h('h2', null, `🐧 ${t('tutorial.finished.title')}`),
      h('p', { class: 'lead' }, t('tutorial.finished.text')),
      h('button', { class: 'btn big block', onclick: () => (modal.close(), go({ name: 'home' }), void openDaily()) }, t('tutorial.finished.daily')),
      h('button', { class: 'btn ghost block', onclick: () => (modal.close(), go({ name: 'home' }), openGuide()) }, t('tutorial.finished.rules')),
      h('button', { class: 'link-btn', onclick: () => (modal.close(), go({ name: 'home' })) }, t('common.backHome')),
    ]);
  }

  /** Saltar: no se vuelve a ofrecer solo (sigue en la guía de reglas). */
  function skip() {
    dismissGuideNews();
    go({ name: 'home' });
  }

  let removeKeys = () => {};
  return {
    el: ui.el,
    async mount() {
      showLesson();
      removeKeys = onKey((e) => {
        if (e.key === 'r' || e.key === 'R') restart();
        if (e.key === 'Escape') ui.el.querySelector<HTMLButtonElement>('.pause-btn')?.click();
      });
      const m = await loadBoard(ui.boardWrap, board, hooks);
      if (disposed) return m.destroy();
      mounted = m;
      m.scene.setBoard(board, state);
      wearHat(m);
      pointNext();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      removeKeys();
      mounted?.destroy();
      ui.dispose();
    },
  };
}
