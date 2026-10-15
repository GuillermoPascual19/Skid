// Dibujo del tablero: hielo, bloques de nieve y los elementos especiales
// (nieve blanda, agujeros, corrientes, teletransportes y hielo frágil).

import Phaser from 'phaser';
import type { Board, Direction, Pos } from '../../../common/logic/engine/board';
import { C, PORTAL_COLORS, TILE, tileCenter } from './palette';

/** Pseudoaleatorio estable por casilla, para decorar sin depender de la semilla. */
function cellHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Dibuja todas las casillas del tablero dentro de `layer`. */
export function drawBoard(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, board: Board): void {
  const g = scene.add.graphics();
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

  layer.add(g);

  // Elementos especiales, encima del hielo.
  const e = scene.add.graphics();
  layer.add(e);
  board.cells.forEach((row, y) =>
    row.forEach((cell, x) => {
      const { x: cx, y: cy } = tileCenter(x, y);
      if (cell === 'snow') drawSnow(e, cx, cy);
      else if (cell === 'hole') drawHole(e, cx, cy);
      else if (cell.startsWith('arrow-')) drawArrow(e, cx, cy, cell.slice('arrow-'.length) as Direction);
    }),
  );
  board.portals.forEach((pair, i) => {
    for (const p of pair) createPortal(scene, layer, p, PORTAL_COLORS[i % PORTAL_COLORS.length]);
  });
}

/** Montículo de nieve blanda. */
function drawSnow(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
  g.fillStyle(C.iceShadow, 0.18).fillEllipse(cx, cy + TILE * 0.22, TILE * 0.86, TILE * 0.3);
  g.fillStyle(C.snowFront, 1);
  g.fillCircle(cx - TILE * 0.2, cy + TILE * 0.1, TILE * 0.22).fillCircle(cx + TILE * 0.2, cy + TILE * 0.12, TILE * 0.2);
  g.fillStyle(C.snowTop, 1);
  g.fillCircle(cx - TILE * 0.2, cy + TILE * 0.06, TILE * 0.21).fillCircle(cx + TILE * 0.2, cy + TILE * 0.08, TILE * 0.19);
  g.fillCircle(cx, cy - TILE * 0.06, TILE * 0.27);
  g.fillStyle(C.snowSpeck, 1);
  g.fillCircle(cx - TILE * 0.08, cy - TILE * 0.12, TILE * 0.04).fillCircle(cx + TILE * 0.14, cy + TILE * 0.02, TILE * 0.03);
}

/** Hielo frágil: placa agrietada encima y, debajo, el agujero en que se convierte al romperse. */
export interface CrackView {
  readonly intact: Phaser.GameObjects.Graphics;
  readonly hole: Phaser.GameObjects.Graphics;
}

export function createCrack(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, pos: Pos): CrackView {
  const { x, y } = tileCenter(pos.x, pos.y);
  const hole = scene.add.graphics({ x, y });
  drawHole(hole, 0, 0);
  const intact = scene.add.graphics({ x, y });
  const half = TILE * 0.4;
  intact.fillStyle(C.crackIce, 1).fillRoundedRect(-half, -half, half * 2, half * 2, TILE * 0.1);
  intact.lineStyle(TILE * 0.03, C.crackLine, 0.6).strokeRoundedRect(-half, -half, half * 2, half * 2, TILE * 0.1);
  intact.lineStyle(TILE * 0.045, C.crackLine, 1);
  // Grietas que salen del centro, con alguna rama.
  const rays: [number, number][] = [
    [-0.2, -0.3],
    [0.3, -0.18],
    [0.22, 0.32],
    [-0.3, 0.18],
    [-0.04, 0.36],
  ];
  for (const [rx, ry] of rays) intact.lineBetween(0, 0, rx * TILE, ry * TILE);
  intact.lineStyle(TILE * 0.03, C.crackLine, 1);
  intact.lineBetween(-0.12 * TILE, -0.19 * TILE, -0.22 * TILE, -0.12 * TILE);
  intact.lineBetween(0.17 * TILE, -0.1 * TILE, 0.2 * TILE, 0.02 * TILE);
  intact.lineBetween(-0.18 * TILE, 0.11 * TILE, -0.15 * TILE, 0.23 * TILE);
  intact.fillStyle(C.crackLine, 1).fillCircle(0, 0, TILE * 0.05);
  layer.add([hole, intact]);
  return { intact, hole };
}

/** Pone el hielo frágil entero o roto, sin animar (al colocar un estado). */
export function setCrackBroken(view: CrackView, broken: boolean): void {
  view.intact.setVisible(!broken).setAlpha(1).setScale(1).setAngle(0);
  view.hole.setVisible(broken).setAlpha(1).setScale(1);
}

/** Agujero de agua con el borde de hielo roto. */
function drawHole(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
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
function drawArrow(g: Phaser.GameObjects.Graphics, cx: number, cy: number, dir: Direction): void {
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
function createPortal(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, pos: Pos, color: number): void {
  const { x, y } = tileCenter(pos.x, pos.y);
  const g = scene.add.graphics();
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
  const portal = scene.add.container(x, y, [g]);
  layer.add(portal);
  scene.tweens.add({ targets: portal, angle: 360, duration: 4000, repeat: -1 });
}
