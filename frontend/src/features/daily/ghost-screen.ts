// Fantasma de un amigo: tu mejor intento del reto y el suyo, a la vez y
// movimiento a movimiento. Su pingüino es el fantasma (semitransparente, con su
// nombre); si no jugaste ese día, su partida la hace el pingüino normal.

import { initialState, parseBoard, type Direction, type GameState } from '../../../../common/logic/engine/board';
import { decodeRun } from '../../../../common/logic/daily/daily';
import { applyMove } from '../../../../common/logic/engine/move';
import type { HatId } from '../../../../common/art/hats';
import type { BoardHooks } from '../../game/BoardScene';
import type { MountedBoard } from '../../game/mount';
import { formatTime, h, openModal, toast } from '../../shared/dom';
import { sfx } from '../../audio/sound';
import { go, type Route, type Screen } from '../../shared/router';
import { loadBoard, onKey, openPauseMenu, playLayout } from '../../play/play';
import { currentMe } from '../profile/profile';
import type { GhostRun } from './api';
import { t } from '../../i18n/i18n';

/** De dónde salen las dos partidas: el reto diario de un día o un duelo. */
export interface GhostSource {
  /** Subtítulo de la pantalla y del resumen («Reto · martes, 13 de octubre», «Duelo · Difícil»). */
  readonly subtitle: string;
  readonly rows: string[];
  /** Tu mejor intento (null si no jugaste) y el del otro. */
  load(): Promise<{ me: GhostRun | null; friend: GhostRun }>;
  /** A dónde se vuelve (también si falla la carga). */
  readonly back: { readonly label: string; readonly route: Route };
}

const FIRST_DELAY = 900;
const STEP_DELAY = 350;

/** Movimientos (cada pista cuenta como uno) o, en retos de antes de contar por movimientos, los puntos. */
const resultLabel = (run: GhostRun) =>
  run.overPar !== null
    ? `${t('common.movesShort', { n: decodeRun(run.path).length + run.hints })}${run.hints ? ` · 💡 ${run.hints}` : ''}`
    : `${run.score ?? 0} ${t('common.pts')} · ${t('common.movesShort', { n: decodeRun(run.path).length })}${run.hints ? ` · 💡 ${run.hints}` : ''}`;

export function ghostScreen(source: GhostSource): Screen {
  const board = parseBoard(source.rows);
  let mounted: MountedBoard | null = null;
  let disposed = false;
  let me: GhostRun | null = null;
  let friend: GhostRun | null = null;
  /** Lo que hace el pingüino normal (tú, o tu amigo si no jugaste) y el fantasma (tu amigo, o nadie). */
  let lead: Direction[] = [];
  let ghost: Direction[] = [];
  let state: GameState = initialState(board);
  let step = 0;
  let expected: Direction | null = null;
  let settled: (() => void) | null = null;
  /** Sube al volver a empezar: las continuaciones de la vuelta anterior se descartan. */
  let run = 0;

  const ui = playLayout({
    stats: [
      { key: 'lead', label: t('ghost.you') },
      { key: 'ghost', label: t('ghost.friend') },
      { key: 'step', label: t('stats.stroke') },
    ],
    hint: {
      keys: t('ghost.hintKeys'),
      touch: t('ghost.hintTouch'),
    },
    onMenu: () =>
      openPauseMenu(mounted, {
        restartLabel: t('common.watchAgain'),
        onRestart: () => replay(),
        onExit: () => go(source.back.route),
      }),
    onRestart: () => replay(),
    onSwipe: () => {},
    restartLabel: t('common.watchAgain'),
  });
  ui.setTitle(t('ghost.title'), source.subtitle);

  /** Nombre del otro (o «Amigo» si no eligió ninguno). */
  const friendName = () => friend?.name ?? t('ghost.friend');

  const hud = () => {
    ui.setStat('lead', `${Math.min(step, lead.length)}/${lead.length}`);
    if (me) ui.setStat('ghost', `${Math.min(step, ghost.length)}/${ghost.length}`);
    ui.setStat('step', step);
  };

  const hooks: BoardHooks = {
    onMove(dir) {
      if (dir !== expected) return undefined; // El tablero ignora las flechas y gestos.
      expected = null;
      const next = applyMove(board, state, dir);
      if (next) state = next;
      return next;
    },
    onSettled() {
      settled?.();
    },
  };

  /** Mueve el pingüino normal; se resuelve al terminar la animación. */
  function moveLead(dir: Direction): Promise<void> {
    return new Promise((resolve) => {
      settled = () => {
        settled = null;
        resolve();
      };
      expected = dir;
      mounted!.scene.requestMove(dir);
    });
  }

  function schedule(delay: number) {
    const current = run;
    mounted?.scene.time.delayedCall(delay, async () => {
      if (current !== run || !mounted) return;
      const moves: Promise<void>[] = [];
      if (step < lead.length) moves.push(moveLead(lead[step]));
      if (step < ghost.length) moves.push(mounted.scene.moveGhost(ghost[step]));
      await Promise.all(moves);
      if (current !== run || disposed) return;
      step++;
      hud();
      if (step < Math.max(lead.length, ghost.length)) schedule(STEP_DELAY);
      else finish();
    });
  }

  function replay() {
    if (!mounted) return;
    run++;
    state = initialState(board);
    step = 0;
    expected = null;
    settled = null;
    mounted.scene.reset(state);
    mounted.scene.placeGhost(state);
    hud();
    schedule(FIRST_DELAY);
  }

  /** Quién gana: menos movimientos y, a igualdad, menos tiempo (como el ranking). */
  function verdict(): string {
    if (!me || !friend) return '';
    const a = me.overPar ?? -(me.score ?? 0);
    const b = friend.overPar ?? -(friend.score ?? 0);
    if (a !== b) return a < b ? t('ghost.youWin') : t('ghost.theyWin', { name: friendName() });
    const ta = me.timeMs ?? 0;
    const tb = friend.timeMs ?? 0;
    if (ta === tb) return t('ghost.draw');
    return ta < tb ? t('ghost.youWinTime') : t('ghost.theyWinTime', { name: friendName() });
  }

  function finish() {
    sfx.win();
    mounted?.scene.time.delayedCall(600, () => {
      if (!friend) return;
      const line = (who: string, r: GhostRun) => h('div', null, h('span', null, who), h('span', null, `${resultLabel(r)} · ⏱ ${formatTime(r.timeMs ?? 0)}`));
      const modal = openModal(
        [
          h('p', { class: 'eyebrow' }, source.subtitle),
          h('h2', null, me ? verdict() : t('ghost.theirGame', { name: friendName() })),
          h('div', { class: 'breakdown' }, me ? line(t('ghost.you'), me) : null, line(friendName(), friend)),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn secondary', onclick: () => (modal.close(), replay()) }, `↺ ${t('common.watchAgain')}`),
            h('button', { class: 'btn', onclick: () => go(source.back.route) }, source.back.label),
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
      removeKeys = onKey((e) => {
        if (e.key === 'r' || e.key === 'R') replay();
        if (e.key === 'Escape') ui.el.querySelector<HTMLButtonElement>('.pause-btn')?.click();
      });
      let myHat: HatId | null = null;
      try {
        const [runs, profile] = await Promise.all([source.load(), currentMe().catch(() => null)]);
        me = runs.me;
        friend = runs.friend;
        myHat = profile?.hat ?? null;
      } catch (err) {
        toast((err as Error).message);
        return go(source.back.route);
      }
      if (disposed) return;

      lead = decodeRun((me ?? friend).path) as Direction[];
      ghost = me ? (decodeRun(friend.path) as Direction[]) : [];
      // Los nombres en los contadores: el tuyo y el suyo (o solo el suyo).
      const labels = ui.el.querySelectorAll('.stat > span');
      labels[0].textContent = me ? t('ghost.you') : friendName();
      labels[1].textContent = me ? friendName() : '—';
      if (!me) ui.setStat('ghost', '—');
      hud();

      const m = await loadBoard(ui.boardWrap, board, hooks);
      if (disposed) return m.destroy();
      mounted = m;
      m.scene.setBoard(board, state);
      m.scene.setHat(me ? myHat : friend.hat);
      if (me) m.scene.setGhost({ name: friendName(), hat: friend.hat, state });
      schedule(FIRST_DELAY);
    },
    dispose() {
      disposed = true;
      run++;
      removeKeys();
      mounted?.destroy();
      ui.dispose();
    },
  };
}
