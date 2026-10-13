// Modo libre: niveles generados que se van complicando, con hitos y presentación de los elementos nuevos.

import { initialState, type Direction } from '../../logic/engine/board';
import { elementSvg } from '../../art/elements';
import { ELEMENTS } from '../../logic/engine/elements';
import { generateLevel } from '../../logic/engine/generator';
import { applyMove, isComplete } from '../../logic/engine/move';
import { solve } from '../../logic/engine/solver';
import { starsFor } from '../../logic/daily/score';
import type { BoardHooks } from '../../game/BoardScene';
import type { MountedBoard } from '../../game/mount';
import { claimElementIntro, claimMilestone, MILESTONES, saveProgress, startingProgress } from '../../shared/storage';
import { celebrate } from '../../shared/celebrate';
import { h, haptic, openModal, starSvg, toast, type Modal } from '../../shared/dom';
import { sfx } from '../../audio/sound';
import { go, type Screen } from '../../shared/router';
import { loadBoard, onKey, openPauseMenu, playLayout, wearHat } from '../../play/play';

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
    void introduceElements();
  }

  /** Presenta los elementos del tablero recién desbloqueados (una vez cada uno). */
  async function introduceElements() {
    const fresh = ELEMENTS.filter((e) => level >= e.level && claimElementIntro(e.id));
    for (const e of fresh) {
      celebrating = true;
      await celebrate({
        icon: '🧊',
        iconSvg: elementSvg(e.id),
        eyebrow: '¡Nuevo en el hielo!',
        title: e.name,
        text: e.description,
        button: '¡A probarlo!',
      });
      celebrating = false;
      if (disposed) return;
    }
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
      void introduceElements();
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
