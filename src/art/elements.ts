// Dibujos de los elementos del tablero en SVG, sobre una casilla de hielo: para
// presentarlos al desbloquearlos y para la paleta del editor. Imitan cómo los
// dibuja el juego (BoardScene), en una caja de 100 × 100.

import type { ElementId } from '../core/elements';

const ICE = '<rect x="4" y="4" width="92" height="92" rx="18" fill="#a6e1f5"/><path d="M24 64 L46 40 M36 74 L52 58" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".5"/>';

const DRAWINGS: Record<ElementId, string> = {
  snow: `
    <ellipse cx="50" cy="72" rx="41" ry="14" fill="#2a6f99" opacity=".18"/>
    <circle cx="30" cy="60" r="21" fill="#c4dcef"/><circle cx="70" cy="62" r="19" fill="#c4dcef"/>
    <circle cx="30" cy="56" r="20" fill="#f6fbff"/><circle cx="70" cy="58" r="18" fill="#f6fbff"/>
    <circle cx="50" cy="44" r="26" fill="#f6fbff"/>
    <circle cx="42" cy="38" r="4" fill="#d9ecfa"/><circle cx="64" cy="52" r="3" fill="#d9ecfa"/>`,
  arrow: `
    <circle cx="50" cy="50" r="36" fill="#fff" opacity=".35"/>
    <path d="M16 24 L36 24 L56 50 L36 76 L16 76 L36 50 Z" fill="#1f86c2" opacity=".45"/>
    <path d="M42 24 L62 24 L82 50 L62 76 L42 76 L62 50 Z" fill="#1f86c2"/>`,
  portal: `
    <circle cx="50" cy="54" r="38" fill="#2a6f99" opacity=".2"/>
    <circle cx="50" cy="50" r="37" fill="#a78bfa"/>
    <circle cx="50" cy="50" r="27" fill="#2a1f4f"/>
    <path d="M66 50 A16 16 0 0 1 40 62 M42 36 A16 16 0 0 1 64 42 M38 58 A16 16 0 0 1 40 38" fill="none" stroke="#a78bfa" stroke-width="5" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="5" fill="#fff"/>`,
  hole: `
    <path d="M90 50 L80 66 L71 81 L50 81 L30 81 L20 66 L10 50 L20 34 L30 19 L50 19 L71 19 L80 34 Z" fill="#e6f6fd"/>
    <ellipse cx="50" cy="50" rx="30" ry="25" fill="#1d5f8a"/>
    <ellipse cx="50" cy="54" rx="20" ry="15" fill="#123f5e"/>
    <ellipse cx="44" cy="44" rx="14" ry="7" fill="none" stroke="#8fd3f7" stroke-width="2.5" opacity=".6"/>`,
};

export function elementSvg(id: ElementId): string {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${ICE}${DRAWINGS[id]}</svg>`;
}
