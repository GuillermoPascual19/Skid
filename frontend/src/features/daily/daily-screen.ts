// Partida del reto diario al estilo golf: el reloj del servidor no se para,
// volver a empezar es gratis (cuenta el mejor intento) y cada pista suma un golpe.

import { initialState, type GameState } from '../../../../common/logic/engine/board';
import { dailyLevel, decodeRun, encodeRun, replayRun, type RunEvent } from '../../../../common/logic/daily/daily';
import { applyMove, isComplete } from '../../../../common/logic/engine/move';
import { solve } from '../../../../common/logic/engine/solver';
import { golfPoints, overPar } from '../../../../common/logic/daily/score';
import type { BoardHooks } from '../../game/BoardScene';
import type { MountedBoard } from '../../game/mount';
import * as online from '../../shared/api';
import { canImprove, celebrateStreak, showDailyResult } from './daily';
import { formatDay, formatTime, h, haptic, openModal } from '../../shared/dom';
import { movesLabel } from '../../shared/result';
import { sfx } from '../../audio/sound';
import { go, type Screen } from '../../shared/router';
import { loadBoard, onKey, openPauseMenu, playLayout, wearHat } from '../../play/play';
import { finishDaily } from './api';
import { type DailyRecord, type DailyResult, loadDaily, saveDaily } from './storage';
import { t } from '../../i18n/i18n';

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
  let hints = replay.hints;
  let finished = replay.completed;
  /** Mejor resultado ya aceptado (o calculado aquí), para el contador y para saber si se ha mejorado. */
  let result: DailyResult | undefined = record.result;
  let pendingSubmit = record.pendingSubmit ?? false;
  let submitting = false;
  let mounted: MountedBoard | null = null;
  let disposed = false;
  let timer = 0;

  const ui = playLayout({
    stats: [
      { key: 'moves', label: t('stats.strokes') },
      { key: 'optimal', label: t('stats.optimal'), tone: 'gold' },
      { key: 'best', label: t('stats.best') },
      { key: 'time', label: t('stats.time') },
    ],
    hint: {
      keys: t('play.hintKeysFreeRestart'),
      touch: t('play.hintTouchFreeRestart'),
    },
    onMenu: () =>
      openPauseMenu(mounted, {
        note: finished ? null : `⏱ ${t('daily.play.clockNote')}`,
        restartLabel: t('play.restart'),
        onRestart: restartAllowed() ? () => restart() : null,
        onExit: () => go({ name: 'home' }),
      }),
    onRestart: () => restart(),
    onSwipe: (dir) => mounted?.scene.requestMove(dir),
    restartLabel: t('play.restart'),
    onHint: () => confirmHint(),
  });
  ui.setTitle(t('home.daily.eyebrow'), formatDay(day));

  const elapsed = () => Date.now() - record.startedAt;
  /** Resultado del intento en curso: sus movimientos más uno por cada pista pedida. */
  const strokes = () => moves + hints;
  const hud = () => {
    ui.setStat('moves', strokes(), strokes() > optimal ? 'warn' : undefined);
    ui.setStat('optimal', optimal);
    ui.setStat('best', result?.overPar != null ? movesLabel(optimal + result.overPar) : '—');
    ui.setHintCount(hints);
    // Terminado, se queda el tiempo del mejor intento; mientras se juega, corre el reloj.
    ui.setStat('time', formatTime(finished && result?.overPar != null ? result.timeMs : elapsed()));
  };

  const persist = () =>
    saveDaily({ ...(loadDaily(day) ?? record), day, startedAt: record.startedAt, log: encodeRun(events), result, pendingSubmit });

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
      if (finished) pendingSubmit = true; // Se envía al terminar la animación.
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

  /** Tras terminar solo se puede volver a empezar para mejorar (no al par ni tras ver la solución). */
  function restartAllowed(): boolean {
    return !submitting && (!finished || (!!result && canImprove(day, result)));
  }

  /** Volver a empezar es gratis: el intento nuevo empieza de cero (las pistas pedidas siguen contando). */
  function restart() {
    if (!restartAllowed()) return;
    events.push('restart');
    moves = 0;
    finished = false;
    state = initialState(board);
    ui.setStuck(false);
    persist();
    hud();
    mounted?.scene.reset(state);
  }

  /** Pista: el siguiente movimiento óptimo, a cambio de un golpe. Se apunta en el registro. */
  function confirmHint() {
    if (finished || !mounted) return;
    const [next] = solve(board, state) ?? [];
    if (!next) return ui.setStuck(true); // Sin salida: la pista no sirve, sin coste.
    const modal = openModal(
      [
        h('h2', null, t('daily.play.hintTitle')),
        h('p', { class: 'lead' }, t('daily.play.hintText')),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => modal.close() }, t('common.cancel')),
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
            t('daily.play.hintButton'),
          ),
        ),
      ],
      { dismissable: true },
    );
  }

  /** Mensaje bajo el resultado según cómo ha ido este intento frente al mejor anterior. */
  function attemptNote(previous: DailyResult | undefined, next: DailyResult, attemptOverPar: number): string | undefined {
    if (previous?.overPar == null) return undefined; // Primer intento terminado.
    if (next.overPar! < previous.overPar) return t('daily.play.improved', { before: movesLabel(optimal + previous.overPar) });
    return t('daily.play.notImproved', { attempt: movesLabel(optimal + attemptOverPar), best: movesLabel(optimal + next.overPar!) });
  }

  async function submit() {
    if (submitting || !pendingSubmit) return;
    submitting = true;
    const log = encodeRun(events);
    const previous = result;
    const attempt = replayRun(board, events);
    const attemptOverPar = overPar(attempt.last!.strokes, optimal);
    // Sin conexión, el resultado se calcula aquí con las mismas reglas.
    const bestOverPar = overPar(attempt.best!.strokes, optimal);
    const local: DailyResult = {
      moves: attempt.best!.moves,
      hints: attempt.best!.hints,
      retries: attempt.retries,
      timeMs: previous?.overPar != null && previous.overPar <= bestOverPar ? previous.timeMs : elapsed(),
      optimal,
      overPar: bestOverPar,
      score: golfPoints(bestOverPar),
      streak: previous?.streak,
    };

    sfx.win();
    if (!online.onlineEnabled) {
      result = local;
      pendingSubmit = false;
      submitting = false;
      persist();
      hud();
      return showDailyResult(day, local, { note: attemptNote(previous, local, attemptOverPar) });
    }

    const sending = openModal([h('h2', null, t('golf.headline.done')), h('p', { class: 'lead' }, t('daily.play.sending'))]);
    try {
      const sent = await finishDaily(day, log);
      result = sent;
      pendingSubmit = false;
      persist();
      hud();
      sending.close();
      if (!previous) await celebrateStreak(sent);
      showDailyResult(day, sent, { note: attemptNote(previous, sent, sent.attemptOverPar ?? attemptOverPar) });
    } catch (err) {
      sending.close();
      showDailyResult(day, local, {
        error: t('daily.play.sendFailed', { error: (err as Error).message }),
        retry: () => {
          submitting = false;
          void submit();
        },
      });
    } finally {
      submitting = false;
    }
  }

  let removeKeys = () => {};
  return {
    el: ui.el,
    async mount() {
      hud();
      timer = window.setInterval(hud, 250);
      removeKeys = onKey((e) => {
        if (e.key === 'r' || e.key === 'R') restart();
        if (e.key === 'Escape') ui.el.querySelector<HTMLButtonElement>('.pause-btn')?.click();
      });
      const m = await loadBoard(ui.boardWrap, board, hooks);
      if (disposed) return m.destroy();
      mounted = m;
      m.scene.setBoard(board, state);
      wearHat(m);
      if (pendingSubmit) void submit(); // Terminado pero sin enviar (p. ej. se cerró la página).
      else if (!finished) ui.setStuck(solve(board, state) === null); // Al reanudar, por si se quedó atascado.
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
