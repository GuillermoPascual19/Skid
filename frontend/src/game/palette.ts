// Medidas y colores del tablero en el canvas, compartidos por la escena, el
// dibujo de las casillas y los efectos.

import type { Pos } from '../../../common/logic/engine/board';

/** Tamaño de casilla en el canvas; Phaser escala el canvas para que quepa. */
export const TILE = 96;
export const FONT = '"Baloo 2", "Trebuchet MS", sans-serif';

/** Colores del tablero de día (tema claro). */
const DAY = {
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
  crackIce: 0xd3f0fb,
  crackLine: 0x5aa9d6,
  mirror: 0xe6f6fd,
  mirrorEdge: 0x5aa9d6,
  oneway: 0xff9f1c,
  onewayEdge: 0xe48f0c,
  post: 0x8a5a3b,
  switchBase: 0x5b6b8c,
  switchTop: 0xff6b70,
  switchSide: 0xe5484d,
  door: 0x5b6b8c,
  doorBar: 0xc4dcef,
  block: 0xbfe6fb,
  blockSide: 0x7cc4f5,
  blockEdge: 0x5aa9d6,
};

/** De noche (tema oscuro) cambian el hielo, la nieve y las piezas; el pingüino y el agua no. */
const NIGHT: Partial<typeof DAY> = {
  ice: 0x2f5f80,
  iceAlt: 0x2a5675,
  iceShine: 0x9fd0ee,
  iceShadow: 0x06111c,
  snowTop: 0xd3e1ec,
  snowSpeck: 0xb3c7d8,
  snowFront: 0x93adc3,
  snowFrontDark: 0x6f8aa2,
  coin: 0xe3edf6,
  coinRim: 0x7891a8,
  iceEdge: 0x3a6d90,
  crackIce: 0x4a7fa3,
  crackLine: 0xa9d8f2,
  mirror: 0x9fd0ee,
  block: 0x8cc3e6,
  blockSide: 0x5a9ccc,
};

/** Colores en uso: los de día, o los de noche tras usePalette(true). */
export const C = { ...DAY };

/** Elige la paleta antes de dibujar un tablero. */
export function usePalette(dark: boolean): void {
  Object.assign(C, DAY, dark ? NIGHT : {});
}

/** Color de cada pareja de teletransportes. */
export const PORTAL_COLORS = [0xa78bfa, 0xff8fa3, 0x2bb673, 0xff9f1c, 0x2b8fd6];

/** Centro de la casilla (x, y) en píxeles del canvas. */
export function tileCenter(x: number, y: number): Pos {
  return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
}
