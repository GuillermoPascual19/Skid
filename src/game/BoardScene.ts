// Vista del tablero. Solo dibuja y anima: las reglas y la puntuación las lleva
// quien la usa (ver src/ui/play.ts) a través de BoardHooks.

import Phaser from 'phaser';
import { DIRECTION_DELTA, nextPiece, type Board, type Direction, type GameState, type Piece, type Pos } from '../core/board';
import { slideDurationMs } from '../core/daily';
import { traceMove, type MoveTrace } from '../core/move';
import { HAT_BOX, hatSvg, type HatId } from '../art/hats';
import { sfx } from '../audio/sound';

/** Tamaño de casilla en el canvas; Phaser escala el canvas para que quepa. */
export const TILE = 96;
const FONT = '"Baloo 2", "Trebuchet MS", sans-serif';

const C = {
  ice: 0xa6e1f5,
  iceAlt: 0x9bdaf1,
  iceShine: 0xffffff,
  iceShadow: 0x2a6f99,
  snowTop: 0xf6fbff,
  snowSpeck: 0xd9ecfa,
  snowFront: 0xc4dcef,
  snowFrontDark: 0x9fbfd9,
  coin: 0xffffff,
  coinRim: 0x8fb0cc,
  gold: 0xffc93c,
  goldRim: 0xe48f0c,
  goldGlow: 0xfff0b3,
  penguin: 0x1f2f45,
  belly: 0xffffff,
  beak: 0xff9f1c,
  cheek: 0xff8fa3,
  spark: 0xfff4c2,
  arrow: 0x1f86c2,
  water: 0x1d5f8a,
  waterDeep: 0x123f5e,
  ripple: 0x8fd3f7,
  iceEdge: 0xe6f6fd,
};

/** Color de cada pareja de teletransportes. */
const PORTAL_COLORS = [0xa78bfa, 0xff8fa3, 0x2bb673, 0xff9f1c, 0x2b8fd6];

/** Tramo recto del recorrido de un deslizamiento, de una casilla a la siguiente. */
interface Segment {
  readonly from: Pos;
  readonly to: Pos;
  /** Recoge al llegar la pieza que tocaba. */
  readonly collects: boolean;
  /** Al llegar gira hacia aquí (corriente). */
  readonly turn: Direction | null;
  /** Al llegar se teletransporta a esta casilla. */
  readonly teleport: Pos | null;
}

const KEY_TO_DIR: Record<string, Direction> = {
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
  W: 'up',
  S: 'down',
  A: 'left',
  D: 'right',
};

export interface BoardHooks {
  /**
   * El jugador quiere moverse. Devuelve el estado nuevo, `null` si el movimiento
   * no desplaza (se anima un empujón), o `undefined` para ignorarlo.
   */
  onMove(dir: Direction): GameState | null | undefined;
  /** Terminó la animación de un movimiento. */
  onSettled(state: GameState): void;
}

interface PieceView {
  readonly piece: Piece;
  readonly container: Phaser.GameObjects.Container;
  readonly glow: Phaser.GameObjects.Arc;
  readonly coin: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
}

/** Pseudoaleatorio estable por casilla, para decorar sin depender de la semilla. */
function cellHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export class BoardScene extends Phaser.Scene {
  readonly ready: Promise<void>;
  private resolveReady!: () => void;

  private board: Board | null = null;
  private shown!: GameState;
  private animating = false;
  private queued: Direction | null = null;

  private layer!: Phaser.GameObjects.Container;
  private pieceViews = new Map<number, PieceView>();
  private penguin!: Phaser.GameObjects.Container;
  private face!: Phaser.GameObjects.Container;
  private pulse: Phaser.Tweens.Tween | null = null;
  private hint: Phaser.GameObjects.Container | null = null;
  private hat: HatId | null = null;
  private paused = false;
  private hatImage: Phaser.GameObjects.Image | null = null;

  constructor(private readonly hooks: BoardHooks) {
    super('board');
    this.ready = new Promise((resolve) => (this.resolveReady = resolve));
  }

  create(): void {
    this.layer = this.add.container(0, 0);

    const keyboard = this.input.keyboard!;
    for (const [key, dir] of Object.entries(KEY_TO_DIR)) keyboard.on(`keydown-${key}`, () => this.request(dir));

    this.resolveReady();
  }

  /** Dibuja un tablero nuevo y coloca el estado indicado (p. ej. al reanudar una partida). */
  setBoard(board: Board, state: GameState): void {
    this.board = board;
    this.scale.setGameSize(board.width * TILE, board.height * TILE);

    this.clearHint();
    this.layer.removeAll(true);
    this.pieceViews.clear();
    this.drawTiles(board);
    for (const piece of board.pieces) this.pieceViews.set(piece.order, this.createPiece(piece));
    this.createPenguin();

    this.layer.setAlpha(0).setScale(0.96);
    this.tweens.add({ targets: this.layer, alpha: 1, scale: 1, duration: 350, ease: 'Back.easeOut' });
    this.reset(state);
  }

  /** Vuelve a colocar todo según `state`, sin animar el movimiento (reintentos). */
  reset(state: GameState): void {
    this.clearHint();
    this.time.removeAllEvents();
    this.tweens.killTweensOf(this.penguin);
    this.shown = state;
    this.animating = false;
    this.queued = null;

    // Las piezas ya recogidas no se muestran.
    for (const view of this.pieceViews.values()) {
      this.tweens.killTweensOf(view.container);
      const visible = view.piece.order > state.collected;
      view.container.setVisible(visible).setAlpha(1).setScale(1);
    }
    const { x, y } = this.center(state.player.x, state.player.y);
    this.penguin.setPosition(x, y).setScale(1).setAngle(0);
    this.look('down');
    this.highlightNext();
  }

  // -------------------------------------------------------------- Movimiento

  /** Pide un movimiento (teclado o gesto). Si hay uno animándose, se encola. */
  requestMove(dir: Direction): void {
    this.request(dir);
  }

  /** Congela la partida (animaciones y tiempos) mientras está abierto el menú de pausa. */
  pause(): void {
    this.paused = true;
    this.scene.pause();
  }

  resume(): void {
    this.paused = false;
    this.scene.resume();
  }

  private request(dir: Direction): void {
    // Nada de moverse en pausa ni con un menú o diálogo encima (las flechas llegan igual).
    if (!this.board || this.paused || document.querySelector('.overlay')) return;
    if (this.animating) {
      this.queued = dir; // Se aplica al terminar el movimiento actual.
      return;
    }
    this.perform(dir);
  }

  private perform(dir: Direction): void {
    const result = this.hooks.onMove(dir);
    if (result) this.clearHint();
    if (result === undefined) return;
    this.look(dir);
    if (result === null) this.bump(dir);
    else this.slide(this.shown, traceMove(this.board!, this.shown, dir)!, dir);
  }

  private settle(): void {
    this.animating = false;
    this.hooks.onSettled(this.shown);
    const queued = this.queued;
    this.queued = null;
    if (queued) this.perform(queued);
  }

  /**
   * Anima el recorrido de un movimiento casilla a casilla (con giros,
   * teletransportes y caídas al agua). Frena al final como si fuera un único
   * deslizamiento: 'Cubic.easeOut' sobre el recorrido entero.
   */
  private slide(before: GameState, trace: MoveTrace, dir: Direction): void {
    const board = this.board!;
    const segments: Segment[] = [];
    let at = before.player;
    let moving = dir;
    let fall: Pos | null = null;
    for (const step of trace.steps) {
      if (step.kind === 'slide') {
        segments.push({ from: at, to: step.pos, collects: step.collects, turn: step.dir !== moving ? step.dir : null, teleport: null });
        moving = step.dir;
      } else if (step.kind === 'teleport') {
        segments[segments.length - 1] = { ...segments[segments.length - 1], teleport: step.pos };
      } else {
        fall = step.pos;
      }
      at = step.pos;
    }

    const duration = slideDurationMs(segments.length);
    this.shown = trace.state;
    this.animating = true;
    this.puff(this.penguin.x, this.penguin.y, dir);
    sfx.slide(duration);

    let pieceIndex = before.collected;
    let done = 0; // Tramos ya recorridos (con sus efectos aplicados).
    const progress = { v: 0 };
    const place = () => {
      // Efectos de cada tramo terminado: recoger, girar, teletransportarse.
      while (done < Math.min(Math.floor(progress.v), segments.length)) {
        const seg = segments[done++];
        if (seg.collects) this.collect(board.pieces[pieceIndex++]);
        if (seg.turn) {
          this.look(seg.turn);
          sfx.turn();
        }
        if (seg.teleport) this.teleportFx(seg.to, seg.teleport);
      }
      const i = Math.min(Math.floor(progress.v), segments.length - 1);
      const seg = segments[i];
      const f = progress.v - i;
      const from = this.center(seg.from.x, seg.from.y);
      const to = this.center(seg.to.x, seg.to.y);
      this.penguin.setPosition(from.x + (to.x - from.x) * f, from.y + (to.y - from.y) * f);
    };

    this.tweens.add({
      targets: progress,
      v: segments.length,
      duration,
      ease: 'Cubic.easeOut',
      onUpdate: place,
      onComplete: () => {
        place();
        const last = segments[segments.length - 1];
        if (fall) return this.fallInto(last.to, fall);
        const facing = this.directionOf(last);
        this.squash(facing);
        if (board.cells[last.to.y][last.to.x] === 'snow') {
          sfx.snow();
          this.puff(this.penguin.x, this.penguin.y, facing);
        } else sfx.land();
        this.settle();
      },
    });
  }

  /** Dirección en la que avanza un tramo. */
  private directionOf(seg: Segment): Direction {
    if (seg.to.x > seg.from.x) return 'right';
    if (seg.to.x < seg.from.x) return 'left';
    return seg.to.y > seg.from.y ? 'down' : 'up';
  }

  /** Destellos en la entrada y la salida de un teletransporte. */
  private teleportFx(entry: Pos, exit: Pos): void {
    sfx.teleport();
    for (const p of [entry, exit]) {
      const { x, y } = this.center(p.x, p.y);
      this.sparkle(x, y);
    }
    this.penguin.setScale(0.6);
    this.tweens.add({ targets: this.penguin, scale: 1, duration: 200, ease: 'Back.easeOut' });
  }

  /** Cae al agua en `hole`, salpica y reaparece en `start`. */
  private fallInto(hole: Pos, start: Pos): void {
    sfx.splash();
    const { x, y } = this.center(hole.x, hole.y);
    this.splash(x, y);
    this.tweens.add({
      targets: this.penguin,
      scale: 0,
      angle: 180,
      duration: 260,
      ease: 'Quad.easeIn',
      onComplete: () => {
        const back = this.center(start.x, start.y);
        this.penguin.setPosition(back.x, back.y).setAngle(0);
        this.look('down');
        this.tweens.add({
          targets: this.penguin,
          scale: 1,
          duration: 320,
          delay: 120,
          ease: 'Back.easeOut',
          onComplete: () => this.settle(),
        });
      },
    });
  }

  /** Ondas y gotas al caer al agua. */
  private splash(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      const ring = this.add.ellipse(x, y, TILE * 0.3, TILE * 0.2).setStrokeStyle(TILE * 0.03, C.ripple, 0.9);
      this.layer.add(ring);
      this.tweens.add({
        targets: ring,
        scale: 2.4,
        alpha: 0,
        delay: i * 120,
        duration: 600,
        ease: 'Quad.easeOut',
        onComplete: () => ring.destroy(),
      });
    }
    for (let i = 0; i < 6; i++) {
      const drop = this.add.circle(x, y, TILE * 0.04, C.ripple);
      this.layer.add(drop);
      const angle = -Math.PI * (0.15 + 0.7 * (i / 5));
      this.tweens.add({
        targets: drop,
        x: x + Math.cos(angle) * TILE * 0.45,
        y: y + Math.sin(angle) * TILE * 0.45,
        alpha: 0,
        duration: 420,
        ease: 'Quad.easeOut',
        onComplete: () => drop.destroy(),
      });
    }
  }

  private bump(dir: Direction): void {
    sfx.bump();
    const delta = DIRECTION_DELTA[dir];
    const { x, y } = this.center(this.shown.player.x, this.shown.player.y);
    this.animating = true;
    this.tweens.add({
      targets: this.penguin,
      x: x + delta.x * TILE * 0.1,
      y: y + delta.y * TILE * 0.1,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.penguin.setPosition(x, y);
        this.animating = false;
        this.queued = null;
      },
    });
  }

  private squash(dir: Direction): void {
    const horizontal = dir === 'left' || dir === 'right';
    this.tweens.add({
      targets: this.penguin,
      scaleX: horizontal ? 0.82 : 1.12,
      scaleY: horizontal ? 1.12 : 0.82,
      duration: 80,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  private collect(piece: Piece): void {
    const view = this.pieceViews.get(piece.order);
    if (!view) return;
    sfx.collect(piece.order - 1);
    this.tweens.add({
      targets: view.container,
      scale: 1.6,
      alpha: 0,
      y: view.container.y - TILE * 0.25,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => view.container.setVisible(false).setY(this.center(piece.pos.x, piece.pos.y).y),
    });
    this.sparkle(view.container.x, view.container.y);
    this.highlightNext(this.board!.pieces.indexOf(piece) + 1);
  }

  // ------------------------------------------------------------------- Pista

  /** Flecha dorada junto al pingüino hacia `dir`. Se quita al moverse. */
  showHint(dir: Direction): void {
    this.clearHint();
    const delta = DIRECTION_DELTA[dir];
    const { x, y } = this.center(this.shown.player.x, this.shown.player.y);
    const r = TILE * 0.32;

    const g = this.add.graphics();
    g.fillStyle(C.iceShadow, 0.25).fillCircle(0, r * 0.15, r * 1.05);
    g.fillStyle(C.goldRim, 1).fillCircle(0, r * 0.08, r);
    g.fillStyle(C.gold, 1).fillCircle(0, 0, r * 0.94);
    // Flecha hacia la derecha; el contenedor se gira según la dirección.
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(r * 0.6, 0, -r * 0.05, -r * 0.5, -r * 0.05, r * 0.5);
    g.fillRect(-r * 0.55, -r * 0.18, r * 0.55, r * 0.36);

    const angle = { right: 0, down: 90, left: 180, up: -90 }[dir];
    const hx = x + delta.x * TILE * 0.78;
    const hy = y + delta.y * TILE * 0.78;
    this.hint = this.add.container(hx, hy, [g]).setAngle(angle).setScale(0);
    this.layer.add(this.hint);
    this.tweens.add({ targets: this.hint, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: this.hint,
      x: hx + delta.x * TILE * 0.12,
      y: hy + delta.y * TILE * 0.12,
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private clearHint(): void {
    if (!this.hint) return;
    this.tweens.killTweensOf(this.hint);
    this.hint.destroy();
    this.hint = null;
  }

  // ----------------------------------------------------------------- Efectos

  private sparkle(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.3;
      const reach = TILE * (0.55 + Math.random() * 0.35);
      const dot = this.add.star(x, y, 4, TILE * 0.04, TILE * 0.1, C.spark);
      this.layer.add(dot);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * reach,
        y: y + Math.sin(angle) * reach,
        angle: 180,
        alpha: 0,
        scale: 0.4,
        duration: 480,
        ease: 'Cubic.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  /** Polvo de nieve al arrancar a deslizarse. */
  private puff(x: number, y: number, dir: Direction): void {
    const delta = DIRECTION_DELTA[dir];
    for (let i = 0; i < 4; i++) {
      const p = this.add.circle(x - delta.x * TILE * 0.2, y + TILE * 0.2, TILE * (0.06 + Math.random() * 0.05), 0xffffff, 0.9);
      this.layer.addAt(p, this.layer.getIndex(this.penguin));
      this.tweens.add({
        targets: p,
        x: p.x - delta.x * TILE * (0.2 + Math.random() * 0.3) + (Math.random() - 0.5) * TILE * 0.3,
        y: p.y - delta.y * TILE * 0.25 - Math.random() * TILE * 0.15,
        alpha: 0,
        scale: 1.8,
        duration: 420,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  // ------------------------------------------------------------------ Dibujo

  private center(x: number, y: number): { x: number; y: number } {
    return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
  }

  private drawTiles(board: Board): void {
    const g = this.add.graphics();
    const wallAt = (x: number, y: number) => (board.cells[y]?.[x] ?? 'wall') === 'wall';
    const front = Math.round(TILE * 0.22);

    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        if (wallAt(x, y)) continue;
        const px = x * TILE;
        const py = y * TILE;
        g.fillStyle((x + y) % 2 === 0 ? C.ice : C.iceAlt, 1).fillRect(px, py, TILE, TILE);
        // Sombra que proyecta el bloque de nieve de encima.
        if (wallAt(x, y - 1)) g.fillStyle(C.iceShadow, 0.18).fillRect(px, py, TILE, TILE * 0.18);
        if (wallAt(x - 1, y)) g.fillStyle(C.iceShadow, 0.08).fillRect(px, py, TILE * 0.08, TILE);
        // Reflejos del hielo.
        const h = cellHash(x, y);
        if (h % 3 === 0) {
          g.lineStyle(TILE * 0.05, C.iceShine, 0.55);
          g.lineBetween(px + TILE * 0.2, py + TILE * 0.62, px + TILE * 0.44, py + TILE * 0.38);
          g.lineStyle(TILE * 0.035, C.iceShine, 0.4);
          g.lineBetween(px + TILE * 0.34, py + TILE * 0.72, px + TILE * 0.5, py + TILE * 0.56);
        } else if (h % 7 === 1) {
          g.fillStyle(C.iceShine, 0.35).fillCircle(px + TILE * 0.7, py + TILE * 0.3, TILE * 0.05);
        }
      }
    }

    // Bloques de nieve: tapa blanca y, donde se ve, cara frontal azulada.
    for (let y = 0; y < board.height; y++) {
      for (let x = 0; x < board.width; x++) {
        if (!wallAt(x, y)) continue;
        const px = x * TILE;
        const py = y * TILE;
        const hasFront = y === board.height - 1 || !wallAt(x, y + 1);
        g.fillStyle(C.snowTop, 1).fillRect(px, py, TILE, TILE);
        if (hasFront) {
          g.fillStyle(C.snowFront, 1).fillRect(px, py + TILE - front, TILE, front);
          g.fillStyle(C.snowFrontDark, 1).fillRect(px, py + TILE - front * 0.3, TILE, front * 0.3);
          // Borde redondeado de nieve que cae sobre la cara frontal.
          g.fillStyle(C.snowTop, 1);
          for (let i = 0; i < 3; i++) g.fillCircle(px + TILE * (0.17 + i * 0.33), py + TILE - front * 1.1, TILE * 0.17);
        }
        const h = cellHash(x, y);
        g.fillStyle(C.snowSpeck, 1);
        g.fillCircle(px + TILE * (0.2 + (h % 50) / 100), py + TILE * (0.2 + ((h >>> 8) % 30) / 100), TILE * 0.04);
        g.fillCircle(px + TILE * (0.3 + ((h >>> 4) % 40) / 100), py + TILE * (0.25 + ((h >>> 12) % 25) / 100), TILE * 0.025);
      }
    }

    this.layer.add(g);

    // Elementos especiales, encima del hielo.
    const e = this.add.graphics();
    this.layer.add(e);
    board.cells.forEach((row, y) =>
      row.forEach((cell, x) => {
        const { x: cx, y: cy } = this.center(x, y);
        if (cell === 'snow') this.drawSnow(e, cx, cy);
        else if (cell === 'hole') this.drawHole(e, cx, cy);
        else if (cell.startsWith('arrow-')) this.drawArrow(e, cx, cy, cell.slice('arrow-'.length) as Direction);
      }),
    );
    board.portals.forEach((pair, i) => {
      for (const p of pair) this.createPortal(p, PORTAL_COLORS[i % PORTAL_COLORS.length]);
    });
  }

  /** Montículo de nieve blanda. */
  private drawSnow(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    g.fillStyle(C.iceShadow, 0.18).fillEllipse(cx, cy + TILE * 0.22, TILE * 0.86, TILE * 0.3);
    g.fillStyle(C.snowFront, 1);
    g.fillCircle(cx - TILE * 0.2, cy + TILE * 0.1, TILE * 0.22).fillCircle(cx + TILE * 0.2, cy + TILE * 0.12, TILE * 0.2);
    g.fillStyle(C.snowTop, 1);
    g.fillCircle(cx - TILE * 0.2, cy + TILE * 0.06, TILE * 0.21).fillCircle(cx + TILE * 0.2, cy + TILE * 0.08, TILE * 0.19);
    g.fillCircle(cx, cy - TILE * 0.06, TILE * 0.27);
    g.fillStyle(C.snowSpeck, 1);
    g.fillCircle(cx - TILE * 0.08, cy - TILE * 0.12, TILE * 0.04).fillCircle(cx + TILE * 0.14, cy + TILE * 0.02, TILE * 0.03);
  }

  /** Agujero de agua con el borde de hielo roto. */
  private drawHole(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    const edge: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      const r = TILE * (i % 2 === 0 ? 0.42 : 0.36);
      edge.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85));
    }
    g.fillStyle(C.iceEdge, 1).fillPoints(edge, true);
    g.fillStyle(C.water, 1).fillEllipse(cx, cy, TILE * 0.62, TILE * 0.52);
    g.fillStyle(C.waterDeep, 1).fillEllipse(cx, cy + TILE * 0.04, TILE * 0.42, TILE * 0.32);
    g.lineStyle(TILE * 0.025, C.ripple, 0.55).strokeEllipse(cx - TILE * 0.06, cy - TILE * 0.06, TILE * 0.3, TILE * 0.14);
  }

  /** Flecha de corriente: dos «>» hacia `dir`. */
  private drawArrow(g: Phaser.GameObjects.Graphics, cx: number, cy: number, dir: Direction): void {
    // Puntos pensados hacia la derecha; se giran según la dirección.
    const rot = (x: number, y: number) => {
      const [rx, ry] = { right: [x, y], down: [-y, x], left: [-x, -y], up: [y, -x] }[dir];
      return new Phaser.Math.Vector2(cx + rx * TILE, cy + ry * TILE);
    };
    const chevron = (dx: number) => [rot(dx - 0.2, -0.26), rot(dx, -0.26), rot(dx + 0.2, 0), rot(dx, 0.26), rot(dx - 0.2, 0.26), rot(dx, 0)];
    g.fillStyle(C.iceShine, 0.35).fillCircle(cx, cy, TILE * 0.38);
    g.fillStyle(C.arrow, 0.45).fillPoints(chevron(-0.14), true);
    g.fillStyle(C.arrow, 1).fillPoints(chevron(0.12), true);
  }

  /** Teletransporte: remolino del color de su pareja que gira despacio. */
  private createPortal(pos: Pos, color: number): void {
    const { x, y } = this.center(pos.x, pos.y);
    const g = this.add.graphics();
    g.fillStyle(C.iceShadow, 0.2).fillCircle(0, TILE * 0.04, TILE * 0.4);
    g.fillStyle(color, 1).fillCircle(0, 0, TILE * 0.38);
    g.fillStyle(0x2a1f4f, 1).fillCircle(0, 0, TILE * 0.28);
    g.lineStyle(TILE * 0.05, color, 0.9);
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI * 2 * i) / 3;
      g.beginPath();
      g.arc(0, 0, TILE * 0.17, a, a + Math.PI * 0.8);
      g.strokePath();
    }
    g.fillStyle(0xffffff, 0.9).fillCircle(0, 0, TILE * 0.05);
    const portal = this.add.container(x, y, [g]);
    this.layer.add(portal);
    this.tweens.add({ targets: portal, angle: 360, duration: 4000, repeat: -1 });
  }

  private createPiece(piece: Piece): PieceView {
    const { x, y } = this.center(piece.pos.x, piece.pos.y);
    const glow = this.add.circle(0, 0, TILE * 0.48, C.goldGlow, 0.6).setVisible(false);
    const coin = this.add.graphics();
    const label = this.add
      .text(0, -TILE * 0.05, String(piece.order), {
        fontFamily: FONT,
        fontSize: `${Math.round(TILE * 0.42)}px`,
        fontStyle: '800',
        color: '#5f7d97',
      })
      .setOrigin(0.5);
    const container = this.add.container(x, y, [glow, coin, label]);
    this.layer.add(container);
    return { piece, container, glow, coin, label };
  }

  private drawPiece(view: PieceView, isNext: boolean): void {
    const r = TILE * 0.34;
    const g = view.coin;
    g.clear();
    g.fillStyle(C.iceShadow, 0.22).fillEllipse(0, r * 0.95, r * 2.1, r * 0.7);
    g.fillStyle(isNext ? C.goldRim : C.coinRim, 1).fillCircle(0, r * 0.12, r);
    g.fillStyle(isNext ? C.gold : C.coin, 1).fillCircle(0, 0, r * 0.94);
    g.fillStyle(0xffffff, isNext ? 0.45 : 0.7).fillEllipse(-r * 0.35, -r * 0.45, r * 0.6, r * 0.32);
    view.label.setColor(isNext ? '#7a3d00' : '#4f7391');
    view.glow.setVisible(isNext);
  }

  /** Resalta la pieza que toca. `collected` permite adelantarse a la animación. */
  private highlightNext(collected = this.shown.collected): void {
    const target = nextPiece(this.board!, { player: this.shown.player, collected });
    this.pulse?.stop();
    this.pulse = null;
    for (const view of this.pieceViews.values()) this.drawPiece(view, view.piece === target);

    const view = target && this.pieceViews.get(target.order);
    if (!view) return;
    view.glow.setAlpha(0.7).setScale(0.9);
    this.pulse = this.tweens.add({
      targets: view.glow,
      alpha: 0.15,
      scale: 1.15,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private createPenguin(): void {
    const r = TILE * 0.33;
    const shadow = this.add.ellipse(0, r * 1.02, r * 1.7, r * 0.45, C.iceShadow, 0.25);
    const feet = [-1, 1].map((s) => this.add.ellipse(s * r * 0.42, r * 0.92, r * 0.55, r * 0.3, C.beak));
    const body = this.add.ellipse(0, 0, r * 2, r * 2.15, C.penguin);
    const flippers = [-1, 1].map((s) => this.add.ellipse(s * r * 0.95, r * 0.15, r * 0.35, r * 0.95, C.penguin));

    const belly = this.add.ellipse(0, r * 0.25, r * 1.3, r * 1.45, C.belly);
    const mask = [-1, 1].map((s) => this.add.circle(s * r * 0.3, -r * 0.3, r * 0.4, C.belly));
    const eyes = [-1, 1].map((s) => this.add.circle(s * r * 0.3, -r * 0.33, r * 0.14, C.penguin));
    const glints = [-1, 1].map((s) => this.add.circle(s * r * 0.3 + r * 0.05, -r * 0.39, r * 0.05, 0xffffff));
    const cheeks = [-1, 1].map((s) => this.add.ellipse(s * r * 0.55, -r * 0.05, r * 0.25, r * 0.15, C.cheek, 0.7));
    const beak = this.add.triangle(0, -r * 0.08, -r * 0.18, 0, r * 0.18, 0, 0, r * 0.22, C.beak).setOrigin(0.5, 0);
    this.face = this.add.container(0, 0, [belly, ...mask, ...cheeks, ...eyes, ...glints, beak]);

    this.penguin = this.add.container(0, 0, [shadow, ...feet, ...flippers, body, this.face]);
    this.layer.add(this.penguin);
    this.hatImage = null;
    void this.applyHat();
  }

  // ------------------------------------------------------------------- Gorro

  /** Pone (o quita, con null) el gorro del pingüino. */
  setHat(hat: HatId | null): void {
    this.hat = hat;
    if (this.penguin) void this.applyHat();
  }

  /** El SVG del gorro (src/art/hats.ts) se convierte en textura una sola vez. */
  private async hatTexture(hat: HatId): Promise<string> {
    const key = `hat-${hat}`;
    if (this.textures.exists(key)) return key;
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(hatSvg(hat))}`;
    await img.decode();
    if (!this.textures.exists(key)) this.textures.addImage(key, img);
    return key;
  }

  private async applyHat(): Promise<void> {
    const hat = this.hat;
    const penguin = this.penguin;
    this.hatImage?.destroy();
    this.hatImage = null;
    if (!hat) return;
    const key = await this.hatTexture(hat).catch(() => null);
    // Mientras se cargaba pudo cambiar el gorro o el tablero.
    if (!key || hat !== this.hat || penguin !== this.penguin || !penguin.active) return;

    // Coordenadas del SVG: el cuerpo mide 64 de ancho y la cabeza acaba en y = 14.
    // Aquí el cuerpo mide 2r y la cabeza acaba en -1.075r.
    const r = TILE * 0.33;
    const unit = (2 * r) / 64;
    const headTopInBox = 14 - HAT_BOX.top;
    const image = this.add.image(0, -1.075 * r + (HAT_BOX.height / 2 - headTopInBox) * unit, key);
    image.setDisplaySize(100 * unit, HAT_BOX.height * unit);
    penguin.add(image);
    this.hatImage = image;
  }

  /** La cara del pingüino se gira hacia donde va. */
  private look(dir: Direction): void {
    const delta = DIRECTION_DELTA[dir];
    const r = TILE * 0.33;
    this.face.setPosition(delta.x * r * 0.22, delta.y * r * 0.12);
    this.face.setVisible(dir !== 'up');
  }
}
