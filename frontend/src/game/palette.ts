// Medidas y colores del tablero en el canvas, compartidos por la escena, el
// dibujo de las casillas y los efectos.

import type { Pos } from '../../../common/logic/engine/board';

/** Tamaño de casilla en el canvas; Phaser escala el canvas para que quepa. */
export const TILE = 96;
export const FONT = '"Baloo 2", "Trebuchet MS", sans-serif';

export const C = {
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
export const PORTAL_COLORS = [0xa78bfa, 0xff8fa3, 0x2bb673, 0xff9f1c, 0x2b8fd6];

/** Centro de la casilla (x, y) en píxeles del canvas. */
export function tileCenter(x: number, y: number): Pos {
  return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
}
