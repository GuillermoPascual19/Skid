// Partida de un nivel de la comunidad (o prueba de uno en el editor) y su valoración.

import { levelMarks } from './marks';
import { initialState, parseBoard, type Direction } from '../../../../common/logic/engine/board';
import { encodeRows } from '../../../../common/logic/community/community';
import { encodeRun } from '../../../../common/logic/daily/daily';
import { applyMove, isComplete } from '../../../../common/logic/engine/move';
import { solve } from '../../../../common/logic/engine/solver';
import { starsFor } from '../../../../common/logic/daily/score';
import type { BoardHooks } from '../../game/BoardScene';
import type { MountedBoard } from '../../game/mount';
import { shareLevel } from './community-screen';
import { h, haptic, openModal, starSvg, toast, type Modal } from '../../shared/dom';
import { sfx } from '../../audio/sound';
import { go, type Screen } from '../../shared/router';
import { loadBoard, onKey, openPauseMenu, playLayout, wearHat } from '../../play/play';
import { finishCustomLevel, getLevelRanking, rateCustomLevel, type CustomLevel } from './api';
import { openLevelRanking } from './level-ranking';
import { loadEditorDraft, saveEditorDraft } from './storage';
import { playerName, t, tn } from '../../i18n/i18n';

/**
 * Partida de un nivel de la comunidad (`level`) o prueba de uno en el editor
 * (`testRows`). Se manda al servidor el último intento entero, para que pueda
 * comprobar que se ha superado. En la prueba, superarlo habilita publicarlo.
 */
export function customLevelScreen(source: { level: CustomLevel } | { testRows: string[] }): Screen {
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
      { key: 'moves', label: t('stats.moves') },
      { key: 'optimal', label: t('stats.optimal'), tone: 'gold' },
    ],
    hint: { keys: t('play.hintKeys'), touch: t('play.hintTouch') },
    onMenu: () =>
      openPauseMenu(mounted, {
        restartLabel: t('play.reset'),
        onRestart: () => restart(),
        onExit: back,
      }),
    onRestart: () => restart(),
    onSwipe: (dir) => mounted?.scene.requestMove(dir),
    restartLabel: t('play.reset'),
  });
  ui.setTitle(
    testing ? t('levels.play.testTitle') : level!.name,
    testing ? t('levels.play.testSubtitle') : level!.mine ? t('levels.play.byYou') : t('levels.play.by', { name: playerName(level!.author) }),
  );

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
      h('h2', null, t('levels.play.beaten')),
      h('p', { class: 'lead' }, `${tn('common.moves', moves)} · ${t('common.optimalN', { n: optimal })}`),
    ];

    if (testing) {
      const draft = loadEditorDraft();
      if (draft) saveEditorDraft({ ...draft, proofLog: log, proofRows: encodeRows(rows) });
      result = openModal([
        ...header,
        h('p', { class: 'muted' }, t('levels.play.canPublish')),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => restart() }, t('levels.play.repeat')),
          h('button', { class: 'btn', onclick: () => go({ name: 'editor' }) }, t('levels.play.backToEditor')),
        ),
      ]);
      return;
    }

    // El voto va en su propio recuadro: que no se confunda con las estrellas del resultado.
    const rating = h('div', { class: 'rate' });
    const status = h('p', { class: 'rate-status' }, t('levels.play.savingMark'));
    const boxTitle = h('p', { class: 'eyebrow' }, t('levels.rate.title'));
    const rateBox = h('section', { class: 'rate-box' }, boxTitle, status, rating);
    const showRating = (lvl: CustomLevel) => {
      if (lvl.mine) {
        boxTitle.textContent = t('levels.rate.yours');
        status.textContent = t('levels.rate.othersRate');
        return rating.replaceChildren();
      }
      status.textContent = lvl.myRating ? t('levels.rate.thanks') : t('levels.rate.question');
      rating.replaceChildren(
        ...[1, 2, 3, 4, 5].map((n) =>
          h(
            'button',
            {
              class: `rate-star ${lvl.myRating !== null && n <= lvl.myRating ? 'on' : ''}`,
              'aria-label': tn('levels.rate.stars', n),
              onclick: async () => {
                try {
                  level = await rateCustomLevel(lvl.id, n);
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

    // Tu puesto en el ranking del nivel, cuando el servidor ha guardado la marca.
    const place = h('p', { class: 'level-place', hidden: true });
    result = openModal([
      ...header,
      place,
      rateBox,
      level!.mine
        ? null
        : h(
            'div',
            { class: 'marks-row' },
            levelMarks(level!, (next) => (level = next)),
          ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn ghost', onclick: () => restart() }, t('levels.play.repeat')),
        h('button', { class: 'btn', onclick: back }, t('levels.play.more')),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'link-btn', onclick: () => void openLevelRanking(level!.id, level!.name) }, `🏆 ${t('levels.play.seeRanking')}`),
        h('button', { class: 'link-btn', onclick: () => shareLevel(level!) }, t('levels.play.share')),
      ),
    ]);

    finishCustomLevel(level!.id, log)
      .then(async (saved) => {
        level = saved;
        if (disposed) return;
        showRating(saved);
        // Si falla, la marca ya está guardada: solo no se muestra el puesto.
        const ranking = await getLevelRanking(saved.id).catch(() => null);
        if (!ranking?.me || disposed) return;
        const { me, total } = ranking;
        place.textContent = `🏆 ${t('levels.play.place', { position: me.position, total })}${me.moves < moves ? ` · ${t('levels.play.yourBestMark', { n: me.moves })}` : ''}`;
        place.hidden = false;
      })
      .catch((err) => (status.textContent = t('common.saveFailed', { error: (err as Error).message })));
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
