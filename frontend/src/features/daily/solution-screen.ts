// Solución óptima del reto diario: el pingüino la juega solo, movimiento a movimiento.

import { initialState, type Direction, type GameState } from '../../../../common/logic/engine/board';
import { dailyLevel } from '../../../../common/logic/daily/daily';
import { applyMove } from '../../../../common/logic/engine/move';
import type { BoardHooks } from '../../game/BoardScene';
import type { MountedBoard } from '../../game/mount';
import { formatDay, h, openModal, plural } from '../../shared/dom';
import { sfx } from '../../audio/sound';
import { go, type Screen } from '../../shared/router';
import { loadBoard, onKey, openPauseMenu, playLayout, wearHat } from '../../play/play';

/** Pausa antes del primer movimiento y entre uno y otro (ms). */
const FIRST_DELAY = 800;
const STEP_DELAY = 450;

const ARROW: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' };

export function solutionScreen(day: string): Screen {
  const level = dailyLevel(day);
  const board = level.board;
  const solution = level.solution;

  let state: GameState = initialState(board);
  let step = 0;
  /** El movimiento que toca: el tablero ignora las flechas y gestos del jugador. */
  let expected: Direction | null = null;
  let mounted: MountedBoard | null = null;
  let disposed = false;

  const ui = playLayout({
    stats: [
      { key: 'step', label: 'Movimiento' },
      { key: 'optimal', label: 'Óptimo', tone: 'gold' },
    ],
    hint: {
      keys: 'Mira cómo se resuelve · R para verla otra vez',
      touch: 'Mira cómo se resuelve · ↺ para verla otra vez',
    },
    onMenu: () =>
      openPauseMenu(mounted, {
        restartLabel: 'Ver otra vez',
        onRestart: () => replay(),
        onExit: () => go({ name: 'home' }),
      }),
    onRestart: () => replay(),
    onSwipe: () => {},
    restartLabel: 'Ver otra vez',
  });
  ui.setTitle('Solución', `Reto · ${formatDay(day)}`);

  // Los movimientos ya hechos, como flechas, debajo del tablero.
  const trail = h('p', { class: 'solution-trail', 'aria-live': 'polite' });
  ui.boardWrap.after(trail);

  const hud = () => {
    ui.setStat('step', `${step}/${solution.length}`);
    ui.setStat('optimal', solution.length);
    trail.replaceChildren(
      ...solution.map((dir, i) => h('span', { class: i < step ? 'done' : i === step ? 'next' : '' }, ARROW[dir])),
    );
  };

  const hooks: BoardHooks = {
    onMove(dir) {
      if (dir !== expected) return undefined;
      expected = null;
      const next = applyMove(board, state, dir);
      if (next) state = next;
      return next;
    },
    onSettled() {
      step++;
      hud();
      if (step < solution.length) schedule(STEP_DELAY);
      else finish();
    },
  };

  /** El siguiente movimiento, con los tiempos de la escena (se paran con la pausa y se cancelan al reiniciar). */
  function schedule(delay: number) {
    mounted?.scene.time.delayedCall(delay, () => {
      expected = solution[step];
      mounted?.scene.requestMove(solution[step]);
    });
  }

  function replay() {
    if (!mounted) return;
    state = initialState(board);
    step = 0;
    expected = null;
    mounted.scene.reset(state); // También cancela el movimiento programado.
    hud();
    schedule(FIRST_DELAY);
  }

  function finish() {
    sfx.win();
    mounted?.scene.time.delayedCall(700, () => {
      const modal = openModal(
        [
          h('p', { class: 'eyebrow' }, `Reto · ${formatDay(day)}`),
          h('h2', null, `Así se hace en ${plural(solution.length, 'movimiento', 'movimientos')}`),
          h('p', { class: 'solution-trail big' }, ...solution.map((dir) => h('span', { class: 'done' }, ARROW[dir]))),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn secondary', onclick: () => (modal.close(), replay()) }, '↺ Ver otra vez'),
            h('button', { class: 'btn', onclick: () => go({ name: 'home' }) }, 'Volver al inicio'),
          ),
        ],
        { dismissable: true },
      );
    });
  }

  let removeKeys = () => {};
  return {
    el: ui.el,
    async mount() {
      hud();
      removeKeys = onKey((e) => {
        if (e.key === 'r' || e.key === 'R') replay();
        if (e.key === 'Escape') ui.el.querySelector<HTMLButtonElement>('[aria-label=Pausa]')?.click();
      });
      const m = await loadBoard(ui.boardWrap, board, hooks);
      if (disposed) return m.destroy();
      mounted = m;
      m.scene.setBoard(board, state);
      wearHat(m);
      schedule(FIRST_DELAY);
    },
    dispose() {
      disposed = true;
      removeKeys();
      mounted?.destroy();
      ui.dispose();
    },
  };
}
