// Partida del reto diario: un intento con el reloj del servidor, reintentos y pistas que restan puntos.

import { initialState, type GameState } from '../../../../common/logic/engine/board';
import { dailyLevel, decodeRun, encodeRun, replayRun, type RunEvent } from '../../../../common/logic/daily/daily';
import { applyMove, isComplete } from '../../../../common/logic/engine/move';
import { solve } from '../../../../common/logic/engine/solver';
import { dailyScore, SCORING } from '../../../../common/logic/daily/score';
import type { BoardHooks } from '../../game/BoardScene';
import type { MountedBoard } from '../../game/mount';
import * as online from '../../shared/api';
import { celebrateStreak, showDailyResult } from './daily';
import { formatDay, formatTime, h, haptic, openModal } from '../../shared/dom';
import { sfx } from '../../audio/sound';
import { go, type Screen } from '../../shared/router';
import { loadBoard, onKey, openPauseMenu, playLayout, wearHat } from '../../play/play';
import { finishDaily } from './api';
import { type DailyRecord, type DailyResult, saveDaily } from './storage';

export function dailyScreen(record: DailyRecord): Screen {
  const { day } = record;
  const level = dailyLevel(day);
  const board = level.board;
  const optimal = level.solution.length;

  let events: RunEvent[];
  try {
    events = decodeRun(record.log);
  } catch {
    events = [];
  }
  const replay = replayRun(board, events);
  let state: GameState = replay.state;
  let moves = replay.moves;
  let retries = replay.retries;
  let hints = replay.hints;
  let finished = replay.completed;
  let submitting = false;
  let mounted: MountedBoard | null = null;
  let disposed = false;
  let timer = 0;

  const ui = playLayout({
    stats: [
      { key: 'moves', label: 'Movimientos' },
      { key: 'optimal', label: 'Óptimo', tone: 'gold' },
      { key: 'retries', label: 'Reintentos' },
      { key: 'time', label: 'Tiempo' },
    ],
    hint: {
      keys: 'Flechas o WASD para moverte · R reintenta (resta puntos)',
      touch: 'Desliza el dedo en cualquier parte · ↺ reintenta (resta puntos)',
    },
    onMenu: () =>
      openPauseMenu(mounted, {
        note: finished ? null : '⏱ El reloj del reto sigue corriendo: la pausa no lo para.',
        restartLabel: `Reintentar (−${SCORING.perRetry})`,
        onRestart: finished ? null : () => confirmRetry(),
        onExit: () => go({ name: 'home' }),
      }),
    onRestart: () => confirmRetry(),
    onSwipe: (dir) => mounted?.scene.requestMove(dir),
    restartLabel: 'Reintentar',
    onHint: () => confirmHint(),
  });
  ui.setTitle('Reto diario', formatDay(day));

  const elapsed = () => Date.now() - record.startedAt;
  const hud = () => {
    ui.setStat('moves', moves, moves > optimal ? 'warn' : undefined);
    ui.setStat('optimal', optimal);
    ui.setStat('retries', retries, retries > 0 ? 'warn' : undefined);
    ui.setHintCount(hints);
    ui.setStat('time', formatTime(elapsed()), Math.floor(elapsed() / 1000) > optimal * SCORING.parSecondsPerOptimalMove ? 'warn' : undefined);
  };

  const persist = () => saveDaily({ day, startedAt: record.startedAt, log: encodeRun(events) });

  const hooks: BoardHooks = {
    onMove(dir) {
      if (finished) return undefined;
      const next = applyMove(board, state, dir);
      if (!next) {
        haptic(20);
        return null; // No cuenta: no se registra.
      }
      events.push(dir);
      state = next;
      moves++;
      finished = isComplete(board, state);
      if (finished) clearInterval(timer);
      haptic(finished ? [30, 60, 30] : 8);
      persist();
      hud();
      return next;
    },
    onSettled() {
      if (finished) void submit();
      else ui.setStuck(solve(board, state) === null);
    },
  };

  function confirmRetry() {
    if (finished) return;
    const modal = openModal(
      [
        h('h2', null, '¿Reintentar?'),
        h('p', { class: 'lead' }, `Vuelves al principio. Los movimientos que llevas se mantienen y el reintento resta ${SCORING.perRetry} puntos.`),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => modal.close() }, 'Cancelar'),
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                modal.close();
                events.push('restart');
                retries++;
                state = initialState(board);
                ui.setStuck(false);
                persist();
                hud();
                mounted?.scene.reset(state);
              },
            },
            'Reintentar',
          ),
        ),
      ],
      { dismissable: true },
    );
  }

  /** Pista en el reto: el siguiente movimiento óptimo, a cambio de puntos. Se apunta en el registro. */
  function confirmHint() {
    if (finished || !mounted) return;
    const [next] = solve(board, state) ?? [];
    if (!next) return ui.setStuck(true); // Sin salida: la pista no sirve, sin coste.
    const modal = openModal(
      [
        h('h2', null, '¿Usar una pista?'),
        h('p', { class: 'lead' }, `Te enseña el siguiente movimiento, pero resta ${SCORING.perHint} puntos a tu resultado.`),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => modal.close() }, 'Cancelar'),
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                modal.close();
                events.push('hint');
                hints++;
                persist();
                hud();
                mounted?.scene.showHint(next);
                sfx.hint();
              },
            },
            `Pista (−${SCORING.perHint})`,
          ),
        ),
      ],
      { dismissable: true },
    );
  }

  async function submit() {
    if (submitting) return;
    submitting = true;
    const log = encodeRun(events);
    const timeMs = elapsed();
    const local: DailyResult = {
      moves,
      retries,
      hints,
      timeMs,
      optimal,
      score: dailyScore({ moves, optimal, retries, hints, timeMs }).total,
    };

    sfx.win();
    if (!online.onlineEnabled) {
      saveDaily({ day, startedAt: record.startedAt, log, result: local });
      return showDailyResult(day, local);
    }

    const sending = openModal([h('h2', null, '¡Conseguido!'), h('p', { class: 'lead' }, 'Enviando tu resultado…')]);
    try {
      const result = await finishDaily(day, log);
      saveDaily({ day, startedAt: record.startedAt, log, result });
      sending.close();
      await celebrateStreak(result);
      showDailyResult(day, result);
    } catch (err) {
      saveDaily({ day, startedAt: record.startedAt, log, result: local, pendingSubmit: true });
      sending.close();
      showDailyResult(day, local, {
        error: `No se pudo enviar al ranking: ${(err as Error).message}`,
        retry: () => {
          submitting = false;
          void submit();
        },
      });
    }
  }

  let removeKeys = () => {};
  return {
    el: ui.el,
    async mount() {
      hud();
      if (!finished) timer = window.setInterval(hud, 250);
      removeKeys = onKey((e) => {
        if (e.key === 'r' || e.key === 'R') confirmRetry();
        if (e.key === 'Escape') ui.el.querySelector<HTMLButtonElement>('[aria-label=Pausa]')?.click();
      });
      const m = await loadBoard(ui.boardWrap, board, hooks);
      if (disposed) return m.destroy();
      mounted = m;
      m.scene.setBoard(board, state);
      wearHat(m);
      if (finished) void submit(); // Terminado pero sin enviar (p. ej. se cerró la página).
      else ui.setStuck(solve(board, state) === null); // Al reanudar, por si se quedó atascado.
    },
    dispose() {
      disposed = true;
      clearInterval(timer);
      removeKeys();
      mounted?.destroy();
      ui.dispose();
    },
  };
}
