// Pantallas de partida: modo niveles y reto diario. Aquí viven las reglas de
// cada modo (contadores, reintentos, resultado); BoardScene solo dibuja.

import { initialState, type Board, type Direction, type GameState } from '../core/board';
import { dailyLevel, decodeRun, encodeRun, replayRun, type RunEvent } from '../core/daily';
import { generateLevel } from '../core/generator';
import { applyMove, isComplete } from '../core/move';
import { solve } from '../core/solver';
import { dailyScore, SCORING, starsFor } from '../core/score';
import type { BoardHooks } from '../game/BoardScene';
import type { MountedBoard } from '../game/mount';
import * as online from '../services/online';
import {
  claimMilestone,
  MILESTONES,
  saveDaily,
  saveProgress,
  startingProgress,
  type DailyRecord,
  type DailyResult,
} from '../services/storage';
import { celebrate } from './celebrate';
import { showDailyResult } from './daily';
import { formatDay, formatTime, h, haptic, isTouch, openModal, starSvg, toast, type Modal } from './dom';
import { sfx } from '../audio/sound';
import { soundSettings } from './audio-controls';
import { currentMe } from './profile';
import { go, type Screen } from './router';

// ------------------------------------------------------------------ Layout

interface StatDef {
  readonly key: string;
  readonly label: string;
  readonly tone?: 'gold';
}

interface PlayLayout {
  readonly el: HTMLElement;
  readonly boardWrap: HTMLElement;
  setTitle(title: string, subtitle: string): void;
  setStat(key: string, value: string | number, tone?: 'warn'): void;
  /** Muestra (o quita, con null) el aviso de que ya no se puede terminar. */
  setStuck(stuck: boolean): void;
  /** Deja de escuchar los ajustes de sonido (al salir de la pantalla). */
  dispose(): void;
  /** Contador de pistas usadas sobre la bombilla (0 lo oculta). */
  setHintCount(n: number): void;
}

/** Distancia (px de pantalla) que tiene que recorrer el dedo para contar como gesto. */
const SWIPE_MIN = 24;

function playLayout(opts: {
  stats: StatDef[];
  hint: { keys: string; touch: string };
  /** Abre el menú de pausa. */
  onMenu(): void;
  onRestart(): void;
  onSwipe(dir: Direction): void;
  restartLabel: string;
  /** Botón 💡 de pista. */
  onHint?(): void;
}): PlayLayout {
  const title = h('h1');
  const subtitle = h('p');
  const values = new Map<string, HTMLElement>();
  const boxes = new Map<string, HTMLElement>();

  const stats = h('div', { class: 'stats' });
  for (const s of opts.stats) {
    const value = h('strong', null, '0');
    const box = h('div', { class: `stat ${s.tone ?? ''}` }, h('span', null, s.label), value);
    values.set(s.key, value);
    boxes.set(s.key, box);
    stats.append(box);
  }

  const stuck = h(
    'div',
    { class: 'stuck', role: 'status', hidden: true },
    h('span', null, '🧊 Sin salida: desde aquí ya no se puede terminar.'),
    h('button', { class: 'btn small', onclick: opts.onRestart }, opts.restartLabel),
  );

  const hintBadge = h('span', { class: 'badge', hidden: true });

  const boardWrap = h('div', { class: 'board-wrap' });
  const el = h(
    'div',
    { class: 'screen play' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Pausa', title: 'Pausa', onclick: opts.onMenu }, '⏸'),
      h('div', { class: 'title' }, title, subtitle),
      opts.onHint ? h('button', { class: 'icon-btn hint-btn', 'aria-label': 'Pista', title: 'Pista', onclick: opts.onHint }, '💡', hintBadge) : null,
      h('button', { class: 'icon-btn', 'aria-label': opts.restartLabel, title: opts.restartLabel, onclick: opts.onRestart }, '↺'),
    ),
    stats,
    stuck,
    boardWrap,
    h('p', { class: 'hint' }, isTouch() ? opts.hint.touch : opts.hint.keys),
  );

  // Gestos en toda la pantalla de juego (no solo sobre el tablero). El movimiento
  // sale en cuanto el dedo recorre SWIPE_MIN, sin esperar a que se levante.
  let gesture: { id: number; x: number; y: number; fired: boolean } | null = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || (e.target as Element).closest('button')) return;
    gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false };
  });
  el.addEventListener('pointermove', (e) => {
    if (!gesture || gesture.id !== e.pointerId || gesture.fired) return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
    gesture.fired = true;
    opts.onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  });
  const end = (e: PointerEvent) => {
    if (gesture?.id === e.pointerId) gesture = null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  return {
    el,
    boardWrap,
    setTitle(t, s) {
      title.textContent = t;
      subtitle.textContent = s;
    },
    setStat(key, value, tone) {
      values.get(key)!.textContent = String(value);
      boxes.get(key)!.classList.toggle('warn', tone === 'warn');
    },
    setStuck(isStuck) {
      if (isStuck && stuck.hidden) sfx.stuck(); // Solo al caer en el callejón, no en cada movimiento.
      stuck.hidden = !isStuck;
    },
    setHintCount(n) {
      hintBadge.textContent = String(n);
      hintBadge.hidden = n === 0;
    },
    dispose: () => {},
  };
}

/** Monta el tablero cuando la pantalla ya está en el documento (Phaser necesita su tamaño). */
async function loadBoard(parent: HTMLElement, board: Board, hooks: BoardHooks): Promise<MountedBoard> {
  const { mountBoard } = await import('../game/mount');
  return mountBoard(parent, board, hooks);
}

/** El pingüino de la partida lleva el gorro que el jugador eligió en Logros. */
function wearHat(mounted: MountedBoard): void {
  if (!online.onlineEnabled) return;
  currentMe()
    .then((me) => mounted.scene.setHat(me.hat))
    .catch(() => {});
}

/**
 * Menú de pausa: congela la partida y ofrece los ajustes de sonido, volver a
 * empezar y salir. En el reto diario el reloj del servidor no se para (`note`).
 */
function openPauseMenu(
  mounted: MountedBoard | null,
  opts: { note?: string | null; restartLabel: string; onRestart: (() => void) | null; onExit: () => void },
): void {
  mounted?.scene.pause();
  const modal = openModal(
    [
      h('h2', null, 'Pausa'),
      opts.note ? h('p', { class: 'pause-note' }, opts.note) : null,
      // Las acciones arriba, siempre a la vista; los ajustes de sonido debajo.
      h('button', { class: 'btn big block', onclick: () => modal.close() }, '▶ Continuar'),
      h(
        'div',
        { class: 'row' },
        opts.onRestart
          ? h(
              'button',
              {
                class: 'btn ghost',
                onclick: () => {
                  modal.close();
                  opts.onRestart?.();
                },
              },
              `↺ ${opts.restartLabel}`,
            )
          : null,
        h('button', { class: 'btn secondary', onclick: opts.onExit }, 'Salir al inicio'),
      ),
      h('p', { class: 'eyebrow pause-section' }, 'Sonido'),
      ...soundSettings({ compact: true }),
    ],
    { dismissable: true, onClose: () => mounted?.scene.resume() },
  );
  modal.el.classList.add('pause-menu');
}

function onKey(handler: (e: KeyboardEvent) => void): () => void {
  const listener = (e: KeyboardEvent) => {
    if (document.querySelector('.overlay') || e.repeat) return;
    handler(e);
  };
  document.addEventListener('keydown', listener);
  return () => document.removeEventListener('keydown', listener);
}

// ------------------------------------------------------------ Modo niveles

export function levelsScreen(): Screen {
  const progress = startingProgress();
  const seed = progress.seed;
  let level = progress.level;
  let generated = generateLevel(level, seed);
  let board = generated.board;
  let optimal = generated.solution.length;
  let state = initialState(board);
  let moves = 0;
  let finished = false;
  let mounted: MountedBoard | null = null;
  let disposed = false;
  let result: Modal | null = null;
  let celebrating = false;

  const ui = playLayout({
    stats: [
      { key: 'moves', label: 'Movimientos' },
      { key: 'optimal', label: 'Óptimo', tone: 'gold' },
    ],
    hint: { keys: 'Flechas o WASD para moverte · R reinicia', touch: 'Desliza el dedo en cualquier parte de la pantalla' },
    onMenu: () =>
      openPauseMenu(mounted, { restartLabel: 'Reiniciar', onRestart: () => restart(), onExit: () => go({ name: 'home' }) }),
    onRestart: () => restart(),
    onSwipe: (dir) => mounted?.scene.requestMove(dir),
    restartLabel: 'Reiniciar',
    onHint: () => showHint(),
  });

  /** Pista: el siguiente movimiento de la solución óptima desde donde esté el jugador. */
  function showHint() {
    if (finished || !mounted) return;
    const [next] = solve(board, state) ?? [];
    if (!next) return toast('Sin salida desde aquí: reinicia el nivel');
    mounted.scene.showHint(next);
    sfx.hint();
  }

  const hud = () => {
    ui.setTitle(`Nivel ${level}`, 'Modo libre');
    ui.setStat('moves', moves, moves > optimal ? 'warn' : undefined);
    ui.setStat('optimal', optimal);
  };

  const hooks: BoardHooks = {
    onMove(dir: Direction) {
      if (finished) return undefined;
      const next = applyMove(board, state, dir);
      if (!next) {
        haptic(20);
        return null;
      }
      state = next;
      moves++;
      finished = isComplete(board, state);
      haptic(finished ? [30, 60, 30] : 8);
      hud();
      return next;
    },
    onSettled() {
      if (finished) {
        if (!result) void finishLevel();
        return;
      }
      ui.setStuck(solve(board, state) === null);
    },
  };

  function load(n: number) {
    level = n;
    generated = generateLevel(level, seed);
    board = generated.board;
    optimal = generated.solution.length;
    saveProgress({ seed, level });
    restart(false);
    mounted?.scene.setBoard(board, state);
  }

  function restart(resetScene = true) {
    result?.close();
    result = null;
    state = initialState(board);
    moves = 0;
    finished = false;
    ui.setStuck(false);
    hud();
    if (resetScene) mounted?.scene.reset(state);
  }

  /** Al superar 25, 50, 75 o 100 (la primera vez), celebración antes del resultado. */
  async function finishLevel() {
    saveProgress({ seed, level: level + 1 });
    if (MILESTONES.includes(level) && claimMilestone(level)) {
      const done = level;
      celebrating = true;
      await celebrate({
        icon: done >= 100 ? '👑' : done >= 75 ? '💎' : done >= 50 ? '🏆' : '⭐',
        eyebrow: `Nivel ${done} superado`,
        title: done >= 100 ? '¡Leyenda del hielo!' : '¡Enhorabuena!',
        text:
          done >= 100
            ? '¡Has superado 100 niveles! Pocos pingüinos han llegado tan lejos.'
            : `Ya llevas ${done} niveles. Los siguientes serán aún más difíciles.`,
        button: 'Continuar',
      });
      celebrating = false;
      if (disposed || level !== done || !finished) return;
    }
    showResult();
  }

  function showResult() {
    sfx.win();
    const stars = starsFor(moves, optimal);
    result = openModal([
      h('div', { class: 'stars' }, ...[0, 1, 2].map((i) => starSvg(i < stars))),
      h('h2', null, `¡Nivel ${level} superado!`),
      h('p', { class: 'lead' }, `${moves} movimientos · óptimo ${optimal}`),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn ghost', onclick: () => restart() }, 'Repetir'),
        h('button', { class: 'btn', onclick: () => load(level + 1) }, 'Siguiente →'),
      ),
    ]);
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
      document.addEventListener('keydown', nextOnEnter);
      const m = await loadBoard(ui.boardWrap, board, hooks);
      if (disposed) return m.destroy();
      mounted = m;
      m.scene.setBoard(board, state);
      wearHat(m);
    },
    dispose() {
      disposed = true;
      removeKeys();
      document.removeEventListener('keydown', nextOnEnter);
      mounted?.destroy();
      ui.dispose();
    },
  };

  function nextOnEnter(e: KeyboardEvent) {
    if (finished && result && !celebrating && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      load(level + 1);
    }
  }
}

// ------------------------------------------------------------- Reto diario

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
      const result = await online.finishDaily(day, log);
      saveDaily({ day, startedAt: record.startedAt, log, result });
      sending.close();
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
