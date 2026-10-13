// Efectos de partículas del tablero: destellos al recoger una pieza, polvo de
// nieve al arrancar y salpicaduras al caer al agua. Se crean y se destruyen solos.

import Phaser from 'phaser';
import { DIRECTION_DELTA, type Direction } from '../../../common/logic/engine/board';
import { C, TILE } from './palette';

/** Estrellitas que salen en todas direcciones. */
export function sparkle(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number): void {
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.3;
    const reach = TILE * (0.55 + Math.random() * 0.35);
    const dot = scene.add.star(x, y, 4, TILE * 0.04, TILE * 0.1, C.spark);
    layer.add(dot);
    scene.tweens.add({
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

/** Polvo de nieve al arrancar a deslizarse (por debajo de `below`, el pingüino). */
export function puff(
  scene: Phaser.Scene,
  layer: Phaser.GameObjects.Container,
  below: Phaser.GameObjects.GameObject,
  x: number,
  y: number,
  dir: Direction,
): void {
  const delta = DIRECTION_DELTA[dir];
  for (let i = 0; i < 4; i++) {
    const p = scene.add.circle(x - delta.x * TILE * 0.2, y + TILE * 0.2, TILE * (0.06 + Math.random() * 0.05), 0xffffff, 0.9);
    layer.addAt(p, layer.getIndex(below));
    scene.tweens.add({
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

/** Ondas y gotas al caer al agua. */
export function splash(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number): void {
  for (let i = 0; i < 3; i++) {
    const ring = scene.add.ellipse(x, y, TILE * 0.3, TILE * 0.2).setStrokeStyle(TILE * 0.03, C.ripple, 0.9);
    layer.add(ring);
    scene.tweens.add({
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
    const drop = scene.add.circle(x, y, TILE * 0.04, C.ripple);
    layer.add(drop);
    const angle = -Math.PI * (0.15 + 0.7 * (i / 5));
    scene.tweens.add({
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
