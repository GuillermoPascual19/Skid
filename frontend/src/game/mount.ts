// Crea el juego de Phaser dentro de un elemento. Este módulo se carga bajo
// demanda (import()) para que la portada no tenga que descargar Phaser.

import Phaser from 'phaser';
import type { Board } from '../../../common/logic/engine/board';
import { BoardScene, type BoardHooks } from './BoardScene';
import { TILE, usePalette } from './palette';
import { isDark } from '../shared/theme';

export interface MountedBoard {
  readonly scene: BoardScene;
  destroy(): void;
}

export async function mountBoard(parent: HTMLElement, board: Board, hooks: BoardHooks): Promise<MountedBoard> {
  usePalette(isDark()); // De noche con el tema oscuro (se aplica al dibujar el tablero).
  const scene = new BoardScene(hooks);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: board.width * TILE,
    height: board.height * TILE,
    transparent: true,
    banner: false,
    // El sonido lo genera src/audio; sin esto Phaser abriría otro contexto de audio.
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene],
  });
  await scene.ready;
  return { scene, destroy: () => game.destroy(true) };
}
