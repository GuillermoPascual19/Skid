// Partida: lo común a todos los modos de juego (pantalla con contadores y
// gestos, menú de pausa, teclas y montaje del tablero). Cada modo vive en su apartado.

import type { Board, Direction } from '../logic/engine/board';
import type { BoardHooks } from '../game/BoardScene';
import type { MountedBoard } from '../game/mount';
import * as online from '../shared/api';
import { h, isTouch, openModal } from '../shared/dom';
import { sfx } from '../audio/sound';
import { soundSettings } from '../audio/audio-controls';
import { currentMe } from '../features/profile/profile';

// ------------------------------------------------------------------ Layout

export interface StatDef {
  readonly key: string;
  readonly label: string;
  readonly tone?: 'gold';
}

export interface PlayLayout {
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

export function playLayout(opts: {
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
export async function loadBoard(parent: HTMLElement, board: Board, hooks: BoardHooks): Promise<MountedBoard> {
  const { mountBoard } = await import('../game/mount');
  return mountBoard(parent, board, hooks);
}

/** El pingüino de la partida lleva el gorro que el jugador eligió en Logros. */
export function wearHat(mounted: MountedBoard): void {
  if (!online.onlineEnabled) return;
  currentMe()
    .then((me) => mounted.scene.setHat(me.hat))
    .catch(() => {});
}

/**
 * Menú de pausa: congela la partida y ofrece los ajustes de sonido, volver a
 * empezar y salir. En el reto diario el reloj del servidor no se para (`note`).
 */
export function openPauseMenu(
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

export function onKey(handler: (e: KeyboardEvent) => void): () => void {
  const listener = (e: KeyboardEvent) => {
    if (document.querySelector('.overlay') || e.repeat) return;
    handler(e);
  };
  document.addEventListener('keydown', listener);
  return () => document.removeEventListener('keydown', listener);
}
