// Partida de un nivel de la comunidad (o prueba de uno en el editor) y su valoración.

import { initialState, parseBoard, type Direction } from '../../logic/engine/board';
import { encodeRows } from '../../logic/community/community';
import { encodeRun } from '../../logic/daily/daily';
import { applyMove, isComplete } from '../../logic/engine/move';
import { solve } from '../../logic/engine/solver';
import { starsFor } from '../../logic/daily/score';
import type { BoardHooks } from '../../game/BoardScene';
import type { MountedBoard } from '../../game/mount';
import * as online from '../../shared/api';
import { loadEditorDraft, saveEditorDraft } from '../../shared/storage';
import { shareLevel } from './community-screen';
import { h, haptic, openModal, starSvg, toast, type Modal } from '../../shared/dom';
import { sfx } from '../../audio/sound';
import { go, type Screen } from '../../shared/router';
import { loadBoard, onKey, openPauseMenu, playLayout, wearHat } from '../../play/play';

/**
 * Partida de un nivel de la comunidad (`level`) o prueba de uno en el editor
 * (`testRows`). Se manda al servidor el último intento entero, para que pueda
 * comprobar que se ha superado. En la prueba, superarlo habilita publicarlo.
 */
export function customLevelScreen(source: { level: online.CustomLevel } | { testRows: string[] }): Screen {
  const testing = 'testRows' in source;
  let level = testing ? null : source.level;
  const rows = testing ? source.testRows : source.level.rows;
  const board = parseBoard(rows);
  const optimal = level?.optimal ?? solve(board)?.length ?? 0;
  const back = () => go(testing ? { name: 'editor' } : { name: 'community' });

  let state = initialState(board);
  let moves = 0;
  let attempt: Direction[] = [];
  let finished = false;
  let mounted: MountedBoard | null = null;
  let disposed = false;
  let result: Modal | null = null;

  const ui = playLayout({
    stats: [
      { key: 'moves', label: 'Movimientos' },
      { key: 'optimal', label: 'Óptimo', tone: 'gold' },
    ],
    hint: { keys: 'Flechas o WASD para moverte · R reinicia', touch: 'Desliza el dedo en cualquier parte de la pantalla' },
    onMenu: () =>
      openPauseMenu(mounted, {
        restartLabel: 'Reiniciar',
        onRestart: () => restart(),
        onExit: back,
      }),
    onRestart: () => restart(),
    onSwipe: (dir) => mounted?.scene.requestMove(dir),
    restartLabel: 'Reiniciar',
  });
  ui.setTitle(testing ? 'Prueba tu nivel' : level!.name, testing ? 'Supéralo para poder publicarlo' : `de ${level!.mine ? 'ti' : level!.author}`);

  const hud = () => {
    ui.setStat('moves', moves, moves > optimal ? 'warn' : undefined);
    ui.setStat('optimal', optimal);
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
        if (!result) finish();
        return;
      }
      ui.setStuck(solve(board, state) === null);
    },
  };

  function restart() {
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

  function finish() {
    sfx.win();
    const log = encodeRun(attempt);
    const stars = starsFor(moves, optimal);
    const header = [
      h('div', { class: 'stars' }, ...[0, 1, 2].map((i) => starSvg(i < stars))),
      h('h2', null, '¡Nivel superado!'),
      h('p', { class: 'lead' }, `${moves} movimientos · óptimo ${optimal}`),
    ];

    if (testing) {
      const draft = loadEditorDraft();
      if (draft) saveEditorDraft({ ...draft, proofLog: log, proofRows: encodeRows(rows) });
      result = openModal([
        ...header,
        h('p', { class: 'muted' }, 'Ya puedes publicarlo. Si lo cambias, tendrás que superarlo otra vez.'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => restart() }, 'Repetir'),
          h('button', { class: 'btn', onclick: () => go({ name: 'editor' }) }, 'Volver al editor'),
        ),
      ]);
      return;
    }

    // El voto va en su propio recuadro: que no se confunda con las estrellas del resultado.
    const rating = h('div', { class: 'rate' });
    const status = h('p', { class: 'rate-status' }, 'Guardando tu marca…');
    const boxTitle = h('p', { class: 'eyebrow' }, 'Valora este nivel');
    const rateBox = h('section', { class: 'rate-box' }, boxTitle, status, rating);
    const showRating = (lvl: online.CustomLevel) => {
      if (lvl.mine) {
        boxTitle.textContent = 'Tu nivel';
        status.textContent = 'Lo valoran los demás jugadores al superarlo.';
        return rating.replaceChildren();
      }
      status.textContent = lvl.myRating ? '¡Gracias! Puedes cambiar tu voto.' : '¿Qué te ha parecido?';
      rating.replaceChildren(
        ...[1, 2, 3, 4, 5].map((n) =>
          h(
            'button',
            {
              class: `rate-star ${lvl.myRating !== null && n <= lvl.myRating ? 'on' : ''}`,
              'aria-label': `${n} ${n === 1 ? 'estrella' : 'estrellas'}`,
              onclick: async () => {
                try {
                  level = await online.rateCustomLevel(lvl.id, n);
                  showRating(level);
                } catch (err) {
                  toast((err as Error).message);
                }
              },
            },
            '★',
          ),
        ),
      );
    };

    result = openModal([
      ...header,
      rateBox,
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn ghost', onclick: () => restart() }, 'Repetir'),
        h('button', { class: 'btn', onclick: back }, 'Más niveles'),
      ),
      h('button', { class: 'link-btn', onclick: () => shareLevel(level!) }, 'Compartir nivel'),
    ]);

    online
      .finishCustomLevel(level!.id, log)
      .then((saved) => {
        level = saved;
        if (!disposed) showRating(saved);
      })
      .catch((err) => (status.textContent = `No se pudo guardar: ${(err as Error).message}`));
  }

  let removeKeys = () => {};
  return {
    el: ui.el,
    async mount() {
      hud();
      removeKeys = onKey((e) => {
        if (e.key === 'r' || e.key === 'R') restart();
        if (e.key === 'Escape') ui.el.querySelector<HTMLButtonElement>('[aria-label=Pausa]')?.click();
      });
      const m = await loadBoard(ui.boardWrap, board, hooks);
      if (disposed) return m.destroy();
      mounted = m;
      m.scene.setBoard(board, state);
      wearHat(m);
      ui.setStuck(solve(board, state) === null);
    },
    dispose() {
      disposed = true;
      removeKeys();
      mounted?.destroy();
      ui.dispose();
    },
  };
}
