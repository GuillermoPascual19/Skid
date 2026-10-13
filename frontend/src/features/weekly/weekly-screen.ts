// Partida del reto semanal: cada intento empieza de cero y se envía al
// terminarlo; el servidor se queda con el mejor. Sin pistas.

import { initialState, parseBoard, type Direction } from '../../../../common/logic/engine/board';
import { encodeRun } from '../../../../common/logic/daily/daily';
import { golfLabel } from '../../../../common/logic/daily/score';
import { applyMove, isComplete } from '../../../../common/logic/engine/move';
import { solve } from '../../../../common/logic/engine/solver';
import type { BoardHooks } from '../../game/BoardScene';
import type { MountedBoard } from '../../game/mount';
import { h, haptic, openModal, plural, type Modal } from '../../shared/dom';
import { sfx } from '../../audio/sound';
import { go, type Screen } from '../../shared/router';
import { loadBoard, onKey, openPauseMenu, playLayout, wearHat } from '../../play/play';
import { type WeeklyInfo, type WeeklyRun, finishWeekly } from './api';
import { formatWeek, openWeeklyRanking } from './weekly';

export function weeklyScreen(info: WeeklyInfo): Screen {
  const board = parseBoard(info.rows);
  const { optimal, week } = info;
  let best: WeeklyRun | null = info.run;

  let state = initialState(board);
  let moves = 0;
  let attempt: Direction[] = [];
  let finished = false;
  let mounted: MountedBoard | null = null;
  let disposed = false;
  let result: Modal | null = null;

  const ui = playLayout({
    stats: [
      { key: 'moves', label: 'Golpes' },
      { key: 'optimal', label: 'Óptimo', tone: 'gold' },
      { key: 'best', label: 'Tu mejor' },
    ],
    hint: {
      keys: 'Flechas o WASD para moverte · R vuelve a empezar (gratis)',
      touch: 'Desliza el dedo en cualquier parte · ↺ vuelve a empezar (gratis)',
    },
    onMenu: () => openPauseMenu(mounted, { restartLabel: 'Volver a empezar', onRestart: () => restart(), onExit: () => go({ name: 'home' }) }),
    onRestart: () => restart(),
    onSwipe: (dir) => mounted?.scene.requestMove(dir),
    restartLabel: 'Volver a empezar',
  });
  ui.setTitle('Reto semanal', `Semana ${formatWeek(week)}`);

  const hud = () => {
    ui.setStat('moves', moves, moves > optimal ? 'warn' : undefined);
    ui.setStat('optimal', optimal);
    ui.setStat('best', best?.overPar != null ? golfLabel(best.overPar) : '—');
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
        if (!result) void finish();
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

  function headline(over: number): string {
    if (over === 0) return '¡Al par!';
    if (over <= 2) return '¡Muy cerca!';
    return '¡Conseguido!';
  }

  async function finish() {
    sfx.win();
    const previous = best?.overPar ?? null;
    const over = Math.max(0, moves - optimal);
    const note = h('p', { class: 'golf-note' }, 'Guardando…');
    const place = h('p', { class: 'level-place', hidden: true });
    const actions = h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn secondary', onclick: () => restart() }, over === 0 ? 'Otra vez' : '↺ Mejorar'),
      h('button', { class: 'btn ghost', onclick: () => void openWeeklyRanking(week) }, 'Ranking'),
    );
    result = openModal([
      h('p', { class: 'eyebrow' }, `Reto semanal · ${formatWeek(week)}`),
      h('h2', null, headline(over)),
      h('div', { class: `score-big golf${over === 0 ? ' par' : ''}` }, golfLabel(over)),
      h('p', { class: 'lead' }, `${plural(moves, 'movimiento', 'movimientos')} · óptimo ${optimal}`),
      note,
      place,
      actions,
      h('button', { class: 'link-btn', onclick: () => go({ name: 'home' }) }, 'Volver al inicio'),
    ]);

    try {
      const sent = await finishWeekly(week, encodeRun(attempt));
      if (disposed) return;
      best = sent.run;
      hud();
      const bestOver = sent.run.overPar ?? over;
      note.textContent = sent.improved
        ? previous === null
          ? 'Tu primera marca de la semana. Puedes mejorarla hasta el domingo.'
          : `¡Nueva mejor marca! Antes tenías ${golfLabel(previous)}.`
        : `Te quedas con tu mejor marca: ${golfLabel(bestOver)}.`;
      if (sent.position !== null && sent.total > 1) {
        place.textContent = `🏆 Puesto ${sent.position} de ${sent.total} entre tus amigos`;
        place.hidden = false;
      }
    } catch (err) {
      note.textContent = `No se pudo guardar: ${(err as Error).message}`;
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
        if (e.key === 'Escape') ui.el.querySelector<HTMLButtonElement>('[aria-label=Pausa]')?.click();
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
