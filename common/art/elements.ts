// Dibujos de los elementos del tablero en SVG, sobre una casilla de hielo: para
// presentarlos al desbloquearlos y para la paleta del editor. Imitan cómo los
// dibuja el juego (BoardScene), en una caja de 100 × 100.

import type { ElementId } from '../logic/engine/elements';

const ICE =
  '<rect x="4" y="4" width="92" height="92" rx="18" fill="#a6e1f5"/><path d="M24 64 L46 40 M36 74 L52 58" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".5"/>';

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
  crack: `
    <rect x="14" y="14" width="72" height="72" rx="12" fill="#d3f0fb" stroke="#8fd3f7" stroke-width="3"/>
    <path d="M50 50 L32 22 M50 50 L78 34 M50 50 L70 80 M50 50 L22 66 M50 50 L46 84" stroke="#5aa9d6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <path d="M38 31 L30 36 M66 41 L70 50 M60 66 L68 64 M34 59 L36 70" stroke="#5aa9d6" stroke-width="3" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="5" fill="#5aa9d6"/>`,
  mirror: `
    <path d="M14 76 L76 14 L86 24 L24 86 Z" fill="#dff4fd" stroke="#5aa9d6" stroke-width="4" stroke-linejoin="round"/>
    <path d="M26 70 L70 26" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".9"/>
    <path d="M50 30 L50 12 M62 18 L70 10" stroke="#ffc93c" stroke-width="4" stroke-linecap="round"/>
    <path d="M20 50 L36 50" stroke="#ffc93c" stroke-width="4" stroke-linecap="round"/>`,
  oneway: `
    <rect x="12" y="16" width="10" height="68" rx="4" fill="#8a5a3b"/><rect x="78" y="16" width="10" height="68" rx="4" fill="#8a5a3b"/>
    <path d="M28 38 L56 38 L56 24 L80 50 L56 76 L56 62 L28 62 Z" fill="#ff9f1c" stroke="#e48f0c" stroke-width="3" stroke-linejoin="round"/>`,
  switch: `
    <ellipse cx="50" cy="66" rx="34" ry="14" fill="#2a6f99" opacity=".2"/>
    <rect x="18" y="46" width="64" height="24" rx="12" fill="#5b6b8c"/>
    <ellipse cx="50" cy="48" rx="24" ry="12" fill="#e5484d"/>
    <ellipse cx="50" cy="42" rx="24" ry="12" fill="#ff6b70"/>
    <ellipse cx="43" cy="39" rx="8" ry="3.5" fill="#fff" opacity=".6"/>`,
  block: `
    <rect x="18" y="22" width="64" height="62" rx="10" fill="#7cc4f5"/>
    <rect x="18" y="16" width="64" height="56" rx="10" fill="#bfe6fb" stroke="#5aa9d6" stroke-width="3"/>
    <path d="M30 30 L46 30 M30 30 L30 44" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
    <path d="M60 56 L70 46" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>`,
};

/** Puerta de hielo, abierta (hundida en el suelo) o cerrada (un muro de barrotes). */
export function doorSvg(open: boolean): string {
  const bars = open
    ? '<rect x="16" y="64" width="68" height="14" rx="5" fill="#8fb0cc"/><path d="M28 66 L28 76 M42 66 L42 76 M58 66 L58 76 M72 66 L72 76" stroke="#5b6b8c" stroke-width="4" stroke-linecap="round"/>'
    : '<rect x="16" y="14" width="68" height="70" rx="8" fill="#5b6b8c"/><rect x="16" y="14" width="68" height="12" rx="6" fill="#8fb0cc"/><path d="M30 28 L30 82 M44 28 L44 82 M58 28 L58 82 M72 28 L72 82" stroke="#c4dcef" stroke-width="5" stroke-linecap="round"/>';
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${ICE}${bars}</svg>`;
}

export function elementSvg(id: ElementId): string {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">${ICE}${DRAWINGS[id]}</svg>`;
}
