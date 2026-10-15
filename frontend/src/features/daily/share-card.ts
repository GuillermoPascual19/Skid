// Tarjeta del resultado del reto diario como imagen (PNG cuadrado), para
// compartirla como foto. Se dibuja aquí, en un canvas: el tablero del día (sin
// el recorrido, para no destripar la solución), el pingüino con su gorro y el
// resultado.

import { penguinSvg, type HatId } from '../../../../common/art/hats';
import { dailyLevel } from '../../../../common/logic/daily/daily';
import { boardThumb } from '../community/board-art';
import { formatDay, formatTime } from '../../shared/dom';
import { t, tn } from '../../i18n/i18n';
import type { DailyResult } from './storage';

const SIZE = 1080;
const FONT = '"Baloo 2", "Trebuchet MS", sans-serif';

/** Colores del tablero en la tarjeta: los del tema claro (en una imagen no hay variables de CSS). */
const THUMB_COLORS: Record<string, string> = {
  'var(--snow)': '#ffffff',
  'var(--ice)': '#a6e1f5',
  'var(--ice-alt)': '#9bdaf1',
  'var(--coin)': '#ffffff',
  'var(--coin-rim)': '#8fb0cc',
};

/** Un SVG como imagen (le hace falta el espacio de nombres y un tamaño). */
function svgImage(svg: string, width: number, height: number): Promise<HTMLImageElement> {
  const full = svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `);
  return new Promise((resolve, reject) => {
    const img = new Image(width, height);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('svg'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(full)}`;
  });
}

/** Texto centrado en `x`, encogiendo la letra si no cabe en `maxWidth`. */
function centered(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, weight: number, color: string, maxWidth: number): void {
  let px = size;
  do {
    ctx.font = `${weight} ${px}px ${FONT}`;
    px -= 2;
  } while (ctx.measureText(text).width > maxWidth && px > 12);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

/** Tarjeta del reto `day` con el resultado `r` y el gorro `hat`. */
export async function dailyCard(day: string, r: DailyResult, hat: HatId | null): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  await Promise.all(['600', '800'].map((w) => document.fonts.load(`${w} 40px ${FONT}`))).catch(() => {});

  // Fondo de noche polar con copos.
  const sky = ctx.createLinearGradient(0, 0, 0, SIZE);
  sky.addColorStop(0, '#0f2236');
  sky.addColorStop(1, '#1f4468');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 70; i++) {
    const x = (i * 397) % SIZE;
    const y = (i * 613 + 211) % SIZE;
    ctx.globalAlpha = 0.25 + ((i * 37) % 50) / 100;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  centered(ctx, 'Skid', SIZE / 2, 128, 110, 800, '#ffffff', 600);
  centered(ctx, `${t('home.daily.eyebrow')} · ${formatDay(day)}`, SIZE / 2, 188, 40, 600, '#9fc3e3', SIZE - 120);

  // El tablero del día, a la izquierda, en un marco de nieve.
  const rows = dailyLevel(day).rows;
  const cols = rows[0].length;
  const cell = Math.min(500 / cols, 560 / rows.length);
  const boardW = cell * cols;
  const boardH = cell * rows.length;
  const bx = 60 + (520 - boardW) / 2;
  const by = 250 + (600 - boardH) / 2;
  ctx.fillStyle = '#7fb8de';
  ctx.beginPath();
  ctx.roundRect(bx - 14, by - 14, boardW + 28, boardH + 28, 26);
  ctx.fill();
  let thumb = boardThumb(rows);
  for (const [variable, color] of Object.entries(THUMB_COLORS)) thumb = thumb.replaceAll(variable, color);
  ctx.drawImage(await svgImage(thumb, boardW, boardH), bx, by, boardW, boardH);

  // A la derecha, el pingüino y el resultado.
  const col = 820;
  // Halo de luz detrás del pingüino, para que no se pierda en el fondo oscuro.
  const halo = ctx.createRadialGradient(col, 400, 20, col, 400, 200);
  halo.addColorStop(0, 'rgba(166, 225, 245, 0.45)');
  halo.addColorStop(1, 'rgba(166, 225, 245, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(col - 220, 180, 440, 440);
  const penguin = await svgImage(penguinSvg(hat), 240, 290);
  ctx.drawImage(penguin, col - 120, 240, 240, 290);

  const over = r.overPar ?? null;
  const strokes = over !== null ? r.optimal + over : null;
  if (strokes !== null) {
    centered(ctx, String(strokes), col, 680, 170, 800, '#ffc93c', 420);
    centered(ctx, t('common.movesUnit'), col, 735, 44, 700, '#ffffff', 420);
    centered(ctx, `${t('stats.optimal')} ${r.optimal}${over === 0 ? ' 🎯' : ''}`, col, 800, 40, 600, '#9fc3e3', 420);
  } else {
    centered(ctx, String(r.score), col, 680, 170, 800, '#ffc93c', 420);
    centered(ctx, t('common.pts'), col, 735, 44, 700, '#ffffff', 420);
  }

  const facts = [`⏱ ${formatTime(r.timeMs)}`, r.hints ? `💡 ${r.hints}` : null, r.streak && r.streak > 1 ? `🔥 ${tn('common.days', r.streak)}` : null].filter(Boolean).join('   ·   ');
  centered(ctx, facts, SIZE / 2, 935, 44, 700, '#ffffff', SIZE - 120);
  centered(ctx, location.host, SIZE / 2, 1022, 32, 600, '#7fa6c9', SIZE - 120);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png'));
}
