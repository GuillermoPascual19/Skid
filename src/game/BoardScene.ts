// Vista del tablero. Solo dibuja y anima: las reglas y la puntuación las lleva
// quien la usa (ver src/ui/play.ts) a través de BoardHooks.

import Phaser from 'phaser';
import { DIRECTION_DELTA, nextPiece, type Board, type Direction, type GameState, type Piece } from '../core/board';
import { slideDurationMs } from '../core/daily';

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
};

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
    this.penguin.setPosition(x, y).setScale(1);
    this.look('down');
    this.highlightNext();
  }

  // -------------------------------------------------------------- Movimiento

  /** Pide un movimiento (teclado o gesto). Si hay uno animándose, se encola. */
  requestMove(dir: Direction): void {
    this.request(dir);
  }

  private request(dir: Direction): void {
    if (!this.board) return;
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
    else this.slide(this.shown, result, dir);
  }

  private settle(): void {
    this.animating = false;
    this.hooks.onSettled(this.shown);
    const queued = this.queued;
    this.queued = null;
    if (queued) this.perform(queued);
  }

  private slide(before: GameState, after: GameState, dir: Direction): void {
    const board = this.board!;
    const distance = Math.abs(after.player.x - before.player.x) + Math.abs(after.player.y - before.player.y);
    const duration = slideDurationMs(distance);
    const target = this.center(after.player.x, after.player.y);
    this.shown = after;
    this.animating = true;
    this.puff(this.penguin.x, this.penguin.y, dir);

    // Con 'Cubic.easeOut' la posición en el instante t es 1 - (1 - t)^3:
    // se invierte para saber cuándo pasa el pingüino por cada pieza recogida.
    for (const piece of board.pieces.slice(before.collected, after.collected)) {
      const d = Math.abs(piece.pos.x - before.player.x) + Math.abs(piece.pos.y - before.player.y);
      const t = 1 - Math.cbrt(1 - d / distance);
      this.time.delayedCall(t * duration, () => this.collect(piece));
    }

    this.tweens.add({
      targets: this.penguin,
      x: target.x,
      y: target.y,
      duration,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.squash(dir);
        this.settle();
      },
    });
  }

  private bump(dir: Direction): void {
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
    const wallAt = (x: number, y: number) => board.cells[y]?.[x] !== 'ice';
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
  }

  /** La cara del pingüino se gira hacia donde va. */
  private look(dir: Direction): void {
    const delta = DIRECTION_DELTA[dir];
    const r = TILE * 0.33;
    this.face.setPosition(delta.x * r * 0.22, delta.y * r * 0.12);
    this.face.setVisible(dir !== 'up');
  }
}
