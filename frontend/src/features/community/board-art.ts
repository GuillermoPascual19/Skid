// Dibujos de tableros en la interfaz (fuera de Phaser): la miniatura de los
// niveles de la comunidad y las casillas del editor.

import { doorSvg, elementSvg } from '../../../../common/art/elements';
import { PORTAL_CHARS } from '../../../../common/logic/engine/board';

/** Color de cada pareja de teletransportes (los mismos que en BoardScene). */
export const PORTAL_COLORS = ['#a78bfa', '#ff8fa3', '#2bb673', '#ff9f1c', '#2b8fd6'];

const ARROW_ANGLE: Record<string, number> = { '>': 0, v: 90, '<': 180, '^': 270 };
const ONEWAY_ANGLE: Record<string, number> = { R: 0, D: 90, L: 180, U: 270 };

/**
 * Miniatura de un tablero en SVG. Solo dibuja caracteres conocidos (cualquier
 * otro se ignora), así que es seguro aunque las filas vengan del servidor.
 */
export function boardThumb(rows: readonly string[]): string {
  const w = rows[0]?.length ?? 0;
  const parts: string[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const cx = x + 0.5;
      const cy = y + 0.5;
      // Hielo, nieve y piezas con las variables del CSS: cambian con el tema oscuro.
      parts.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${ch === '#' ? 'var(--snow)' : (x + y) % 2 ? 'var(--ice-alt)' : 'var(--ice)'}"/>`);
      if (ch === '@') parts.push(`<circle cx="${cx}" cy="${cy}" r=".36" fill="#1f2f45"/><circle cx="${cx}" cy="${cy + 0.08}" r=".2" fill="#fff"/>`);
      else if (/^[1-9]$/.test(ch))
        parts.push(`<circle cx="${cx}" cy="${cy}" r=".34" fill="${ch === '1' ? '#ffc93c' : 'var(--coin)'}" stroke="var(--coin-rim)" stroke-width=".06"/>`);
      else if (ch === '*') parts.push(`<circle cx="${cx}" cy="${cy}" r=".36" fill="#fff"/>`);
      else if (ch === 'O') parts.push(`<ellipse cx="${cx}" cy="${cy}" rx=".34" ry=".28" fill="#1d5f8a"/>`);
      else if (ch === 'x')
        parts.push(
          `<path d="M${cx - 0.3} ${cy - 0.25} L${cx} ${cy} L${cx + 0.3} ${cy - 0.15} M${cx} ${cy} L${cx - 0.1} ${cy + 0.32} M${cx} ${cy} L${cx + 0.25} ${cy + 0.25}" stroke="#5aa9d6" stroke-width=".09" stroke-linecap="round" fill="none"/>`,
        );
      else if (ch in ARROW_ANGLE) parts.push(`<path d="M-.25 -.3 L.25 0 L-.25 .3 Z" fill="#1f86c2" transform="translate(${cx} ${cy}) rotate(${ARROW_ANGLE[ch]})"/>`);
      else if (ch in ONEWAY_ANGLE)
        parts.push(`<path d="M-.3 -.12 L0 -.12 L0 -.28 L.3 0 L0 .28 L0 .12 L-.3 .12 Z" fill="#ff9f1c" transform="translate(${cx} ${cy}) rotate(${ONEWAY_ANGLE[ch]})"/>`);
      else if (ch === 'm' || ch === 'n')
        parts.push(
          `<path d="M${cx - 0.35} ${cy + (ch === 'm' ? 0.35 : -0.35)} L${cx + 0.35} ${cy + (ch === 'm' ? -0.35 : 0.35)}" stroke="#5aa9d6" stroke-width=".16" stroke-linecap="round"/>`,
        );
      else if (ch === 'S') parts.push(`<circle cx="${cx}" cy="${cy}" r=".3" fill="#e5484d"/>`);
      else if (ch === 'G') parts.push(`<rect x="${x + 0.12}" y="${y + 0.12}" width=".76" height=".76" rx=".1" fill="#5b6b8c"/>`);
      else if (ch === 'g') parts.push(`<rect x="${x + 0.12}" y="${y + 0.62}" width=".76" height=".18" rx=".06" fill="#5b6b8c"/>`);
      else if (ch === 'K') parts.push(`<rect x="${x + 0.12}" y="${y + 0.12}" width=".76" height=".76" rx=".14" fill="#bfe6fb" stroke="#5aa9d6" stroke-width=".06"/>`);
      else {
        const pair = PORTAL_CHARS.indexOf(ch as (typeof PORTAL_CHARS)[number]);
        if (pair >= 0) parts.push(`<circle cx="${cx}" cy="${cy}" r=".36" fill="${PORTAL_COLORS[pair]}"/><circle cx="${cx}" cy="${cy}" r=".2" fill="#2a1f4f"/>`);
      }
    }),
  );
  return `<svg viewBox="0 0 ${w} ${rows.length}" class="board-thumb" aria-hidden="true">${parts.join('')}</svg>`;
}

/** Contenido de una casilla del editor (SVG propio, nunca texto del usuario). */
export function cellArt(ch: string): string {
  if (ch === '*') return elementSvg('snow');
  if (ch === 'O') return elementSvg('hole');
  if (ch === 'x') return elementSvg('crack');
  if (ch === 'm') return elementSvg('mirror');
  if (ch === 'n') return elementSvg('mirror').replace('<svg ', '<svg style="transform: scaleX(-1)" ');
  if (ch in ONEWAY_ANGLE) return elementSvg('oneway').replace('<svg ', `<svg style="transform: rotate(${ONEWAY_ANGLE[ch]}deg)" `);
  if (ch === 'S') return elementSvg('switch');
  if (ch === 'G' || ch === 'g') return doorSvg(ch === 'g');
  if (ch === 'K') return elementSvg('block');
  if (ch in ARROW_ANGLE) return elementSvg('arrow').replace('<svg ', `<svg style="transform: rotate(${ARROW_ANGLE[ch]}deg)" `);
  const pair = PORTAL_CHARS.indexOf(ch as (typeof PORTAL_CHARS)[number]);
  if (pair >= 0) return elementSvg('portal').replaceAll('#a78bfa', PORTAL_COLORS[pair]);
  return '';
}
