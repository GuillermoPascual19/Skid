// El pingüino y sus gorros en SVG. Es la única fuente de los dibujos: la web los
// usa tal cual y el juego (Phaser) los convierte en textura (ver hatSvg).
//
// Coordenadas: las del pingüino, en una caja de 100 de ancho. El cuerpo es una
// elipse centrada en (50, 52) de radios 32 × 38, así que la cabeza acaba en y = 14.
// Los gorros pueden subir hasta y = -30.

export type HatId =
  | 'beanie'
  | 'earmuffs'
  | 'cap'
  | 'tophat'
  | 'viking'
  | 'party'
  | 'santa'
  | 'ushanka'
  | 'wizard'
  | 'crown'
  | 'headband'
  | 'knight'
  | 'propeller'
  | 'racing'
  | 'beret'
  | 'explorer'
  | 'hardhat'
  | 'laurel'
  // De temporada: uno por mes (ver common/logic/leagues/seasons.ts).
  | 'scarf'
  | 'hearts'
  | 'clover'
  | 'umbrella'
  | 'flowers'
  | 'visor'
  | 'straw'
  | 'goggles'
  | 'mortarboard'
  | 'pumpkin'
  | 'leaves'
  | 'star';

/** Los nombres de los gorros están en los diccionarios del juego (hats.<id>). */
export const HAT_IDS: readonly HatId[] = [
  'beanie',
  'earmuffs',
  'cap',
  'tophat',
  'viking',
  'party',
  'santa',
  'ushanka',
  'wizard',
  'crown',
  'headband',
  'knight',
  'propeller',
  'racing',
  'beret',
  'explorer',
  'hardhat',
  'laurel',
  'scarf',
  'hearts',
  'clover',
  'umbrella',
  'flowers',
  'visor',
  'straw',
  'goggles',
  'mortarboard',
  'pumpkin',
  'leaves',
  'star',
];

export function isHatId(value: unknown): value is HatId {
  return typeof value === 'string' && (HAT_IDS as readonly string[]).includes(value);
}

const HATS: Record<HatId, string> = {
  beanie: `
    <path d="M26 31 C26 9 74 9 74 31 Z" fill="#e5484d"/>
    <path d="M38 14 L38 30 M50 11 L50 30 M62 14 L62 30" stroke="#c93a40" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="23" y="26" width="54" height="10" rx="5" fill="#f6f7f9"/>
    <circle cx="50" cy="9" r="7.5" fill="#f6f7f9"/>`,
  earmuffs: `
    <path d="M20 40 C20 4 80 4 80 40" fill="none" stroke="#5b6b8c" stroke-width="5" stroke-linecap="round"/>
    <circle cx="19" cy="42" r="10.5" fill="#ff8fa3"/><circle cx="81" cy="42" r="10.5" fill="#ff8fa3"/>
    <circle cx="16" cy="39" r="4" fill="#ffc2cd"/><circle cx="78" cy="39" r="4" fill="#ffc2cd"/>`,
  cap: `
    <path d="M27 29 C27 7 73 7 73 29 Z" fill="#2b8fd6"/>
    <path d="M50 8 L50 28" stroke="#1c6aa5" stroke-width="2"/>
    <circle cx="50" cy="9" r="3" fill="#1c6aa5"/>
    <ellipse cx="50" cy="29" rx="28" ry="5.5" fill="#1c6aa5"/>`,
  tophat: `
    <rect x="34" y="-16" width="32" height="37" rx="3" fill="#22252b"/>
    <rect x="34" y="9" width="32" height="6" fill="#e5484d"/>
    <rect x="38" y="-12" width="4" height="20" rx="2" fill="#ffffff" opacity=".18"/>
    <ellipse cx="50" cy="21" rx="26" ry="5.5" fill="#22252b"/>`,
  viking: `
    <path d="M28 25 C14 23 7 10 11 -4 C16 9 22 14 31 16 Z" fill="#f4ead2" stroke="#d8c9a3" stroke-width="1.5"/>
    <path d="M72 25 C86 23 93 10 89 -4 C84 9 78 14 69 16 Z" fill="#f4ead2" stroke="#d8c9a3" stroke-width="1.5"/>
    <path d="M26 31 C26 7 74 7 74 31 Z" fill="#9aa7b6"/>
    <path d="M50 7 L50 28" stroke="#7a8796" stroke-width="4"/>
    <rect x="24" y="25" width="52" height="8" rx="4" fill="#7a8796"/>
    <circle cx="33" cy="29" r="1.6" fill="#d7dee6"/><circle cx="50" cy="29" r="1.6" fill="#d7dee6"/><circle cx="67" cy="29" r="1.6" fill="#d7dee6"/>`,
  party: `
    <path d="M50 -16 L34 25 L66 25 Z" fill="#a78bfa"/>
    <path d="M42.4 4 L57.6 4 L59.9 10 L40.1 10 Z" fill="#ffc93c"/>
    <path d="M38.1 15 L61.9 15 L64 20.5 L36 20.5 Z" fill="#ff8fa3"/>
    <circle cx="50" cy="-16" r="5" fill="#ffc93c"/>`,
  santa: `
    <path d="M26 29 C26 10 42 1 57 3 C70 5 79 13 83 22 L72 29 Z" fill="#e5484d"/>
    <rect x="23" y="25" width="54" height="10" rx="5" fill="#f6f7f9"/>
    <circle cx="84" cy="24" r="6.5" fill="#f6f7f9"/>`,
  ushanka: `
    <path d="M14 32 C10 46 13 58 20 61 C26 59 28 48 27 34 Z" fill="#8a5a3b"/>
    <path d="M86 32 C90 46 87 58 80 61 C74 59 72 48 73 34 Z" fill="#8a5a3b"/>
    <path d="M27 27 C27 3 73 3 73 27 Z" fill="#6b4226"/>
    <rect x="19" y="22" width="62" height="13" rx="6.5" fill="#e8dcc4"/>
    <path d="M50 24.5 L51.8 28 L55.6 28.4 L52.8 31 L53.6 34.7 L50 32.8 L46.4 34.7 L47.2 31 L44.4 28.4 L48.2 28 Z" fill="#e5484d"/>`,
  wizard: `
    <path d="M31 26 L48 -6 Q54 -18 71 -19 Q60 -12 59 -1 L69 26 Z" fill="#4f46e5"/>
    <path d="M49 3 L50.6 6.6 L54.5 7 L51.6 9.6 L52.4 13.4 L49 11.4 L45.6 13.4 L46.4 9.6 L43.5 7 L47.4 6.6 Z" fill="#ffc93c"/>
    <circle cx="58" cy="17" r="1.8" fill="#ffc93c"/><circle cx="41" cy="18" r="1.4" fill="#ffc93c"/><circle cx="54" cy="-1" r="1.3" fill="#ffc93c"/>
    <ellipse cx="50" cy="26" rx="31" ry="6" fill="#3730a3"/>`,
  crown: `
    <path d="M30 25 L30 4 L40 14 L50 -1 L60 14 L70 4 L70 25 Z" fill="#ffc93c" stroke="#e48f0c" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="30" cy="4" r="3" fill="#ffc93c" stroke="#e48f0c" stroke-width="1.5"/>
    <circle cx="50" cy="-1" r="3" fill="#ffc93c" stroke="#e48f0c" stroke-width="1.5"/>
    <circle cx="70" cy="4" r="3" fill="#ffc93c" stroke="#e48f0c" stroke-width="1.5"/>
    <circle cx="40" cy="20" r="2.6" fill="#e5484d"/><circle cx="50" cy="19" r="3" fill="#2b8fd6"/><circle cx="60" cy="20" r="2.6" fill="#2bb673"/>`,
  // De los logros de los demás modos.
  headband: `
    <path d="M80 31 Q90 26 96 33 Q89 34 84 38 Z" fill="#e5484d"/>
    <path d="M79 35 Q87 40 89 50 Q83 46 78 41 Z" fill="#c93a40"/>
    <path d="M22 31 Q50 21 78 31 L78 40 Q50 30 22 40 Z" fill="#e5484d"/>
    <path d="M22.5 35.5 Q50 25.5 77.5 35.5" stroke="#f6f7f9" stroke-width="2.2" fill="none"/>`,
  knight: `
    <path d="M50 8 Q45 -10 58 -19 Q56 -9 63 -5 Q56 -1 55 8 Z" fill="#e5484d"/>
    <path d="M24 33 C24 1 76 1 76 33 Z" fill="#9aa7b6"/>
    <path d="M35 13 Q42 8 50 8" stroke="#d7dee6" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <rect x="22" y="27" width="56" height="8" rx="4" fill="#ffc93c"/>
    <rect x="47" y="31" width="6" height="13" rx="3" fill="#7a8796"/>
    <circle cx="31" cy="31" r="1.6" fill="#e48f0c"/><circle cx="69" cy="31" r="1.6" fill="#e48f0c"/>`,
  propeller: `
    <path d="M26 31 C26 18 37 14.5 50 14.5 L50 31 Z" fill="#2b8fd6"/>
    <path d="M74 31 C74 18 63 14.5 50 14.5 L50 31 Z" fill="#e5484d"/>
    <ellipse cx="50" cy="31" rx="26" ry="4.5" fill="#2bb673"/>
    <path d="M50 15 L50 2" stroke="#5b6b8c" stroke-width="2.5"/>
    <path d="M50 1 Q38 -7 29 -2 Q38 4 50 1 Z" fill="#ffc93c"/>
    <path d="M50 1 Q62 9 71 4 Q62 -2 50 1 Z" fill="#ffc93c"/>
    <circle cx="50" cy="1" r="2.8" fill="#e48f0c"/>`,
  racing: `
    <path d="M26 28 C26 6 74 6 74 28 Z" fill="#e5484d"/>
    ${checkers(29, 16.5, 7, 2, 6, 3.6)}
    <path d="M36 11 Q42 8.5 48 8.5" stroke="#fff" stroke-width="2" opacity=".5" fill="none" stroke-linecap="round"/>
    <ellipse cx="50" cy="28" rx="28" ry="5" fill="#22252b"/>`,
  beret: `
    <ellipse cx="46" cy="20" rx="31" ry="11" fill="#3b4a8c" transform="rotate(-8 46 20)"/>
    <path d="M27 28 Q50 34 73 25" stroke="#2a3670" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M44 10 L45 4" stroke="#2a3670" stroke-width="3" stroke-linecap="round"/>
    <path d="M30 17 Q38 11 48 11" stroke="#5b6bb0" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  explorer: `
    <ellipse cx="50" cy="27" rx="37" ry="6.5" fill="#b8a27a"/>
    <path d="M28 26 C28 2 72 2 72 26 Z" fill="#d9c49a"/>
    <path d="M28.6 19 L71.4 19 L72 25 L28 25 Z" fill="#8a5a3b"/>
    <path d="M50 8 L50 19" stroke="#c4ad82" stroke-width="2"/>
    <circle cx="50" cy="8" r="2.6" fill="#c4ad82"/>`,
  hardhat: `
    <path d="M27 28 C27 4 73 4 73 28 Z" fill="#ffc93c"/>
    <rect x="45.5" y="10" width="9" height="18" rx="3" fill="#f2b51f"/>
    <path d="M19 28 Q50 21 81 28 L81 33 Q50 26 19 33 Z" fill="#e48f0c"/>
    <path d="M33 17 Q36 12 42 11" stroke="#fff" stroke-width="2" opacity=".6" fill="none" stroke-linecap="round"/>`,
  laurel: `
    ${laurel()}
    <path d="M50 3 L52.35 8.76 L58.56 9.22 L53.8 13.24 L55.29 19.28 L50 16 L44.71 19.28 L46.2 13.24 L41.44 9.22 L47.65 8.76 Z" fill="#ffc93c" stroke="#e48f0c" stroke-width="1.5" stroke-linejoin="round"/>`,
  // De temporada, de enero a diciembre. La bufanda va al cuello (bajo el pico).
  scarf: `
    <path d="M19 57 Q50 66 81 57 L81 66 Q50 75 19 66 Z" fill="#e5484d"/>
    <path d="M19.5 61 Q50 70 80.5 61" stroke="#f6f7f9" stroke-width="2.2" fill="none"/>
    <path d="M62 66 L70 65 L73 86 L63 87 Z" fill="#e5484d"/>
    <path d="M62.8 72 L70.9 71.2 M63.6 78 L71.8 77.2" stroke="#f6f7f9" stroke-width="2.2"/>
    <path d="M63.5 87 L63.5 91 M66.5 86.8 L66.5 90.8 M69.5 86.5 L69.5 90.5 M72.5 86.2 L72.5 90.2" stroke="#c93a40" stroke-width="1.6" stroke-linecap="round"/>`,
  hearts: `
    <path d="M38 17 Q33 8 34 0 M62 17 Q67 8 66 0" fill="none" stroke="#22252b" stroke-width="2"/>
    <path d="M24 32 C24 10 76 10 76 32" fill="none" stroke="#ff8fa3" stroke-width="5" stroke-linecap="round"/>
    <path d="M34 1 C22 -6 29 -16 34 -9 C39 -16 46 -6 34 1 Z" fill="#e5484d"/>
    <path d="M66 1 C54 -6 61 -16 66 -9 C71 -16 78 -6 66 1 Z" fill="#e5484d"/>
    <circle cx="30.5" cy="-8.5" r="1.6" fill="#fff" opacity=".7"/><circle cx="62.5" cy="-8.5" r="1.6" fill="#fff" opacity=".7"/>`,
  clover: `
    <path d="M35 24 L38 -8 L62 -8 L65 24 Z" fill="#2bb673"/>
    <rect x="36.3" y="11" width="27.4" height="7" fill="#22252b"/>
    <rect x="46" y="10" width="8" height="9" rx="1" fill="none" stroke="#ffc93c" stroke-width="2"/>
    <ellipse cx="50" cy="25" rx="27" ry="5.5" fill="#1f8a55"/>
    <path d="M66 3 Q68 8 72 10" stroke="#7ee0a8" stroke-width="1.8" fill="none"/>
    <g fill="#7ee0a8"><circle cx="66" cy="-2" r="3.6"/><circle cx="62.6" cy="3.4" r="3.6"/><circle cx="69.4" cy="3.4" r="3.6"/></g>`,
  umbrella: `
    <path d="M50 4 L50 25" stroke="#5b6b8c" stroke-width="2.5"/>
    <path d="M17 6 C17 -24 83 -24 83 6 Q74.75 0 66.5 6 Q58.25 0 50 6 Q41.75 0 33.5 6 Q25.25 0 17 6 Z" fill="#2b8fd6"/>
    <path d="M33.5 6 Q41.75 0 50 6 L50 -16.5 C41 -16.5 34.5 -8 33.5 6 Z M66.5 6 Q74.75 0 83 6 C83 -6 76 -14 67 -16 C69 -8 68 -1 66.5 6 Z" fill="#7cc4f5"/>
    <circle cx="50" cy="-18" r="2.5" fill="#5b6b8c"/>
    <rect x="26" y="23" width="48" height="6" rx="3" fill="#5b6b8c"/>`,
  flowers: `
    <path d="M24 32 C24 14 76 14 76 32" stroke="#2bb673" stroke-width="4" fill="none"/>
    ${flower(28, 24, '#ff8fa3')}${flower(38.5, 18.5, '#f6f7f9')}${flower(50, 16.5, '#a78bfa')}${flower(61.5, 18.5, '#f6f7f9')}${flower(72, 24, '#ff8fa3')}`,
  visor: `
    <path d="M27 21 Q50 13 73 21 L74 26 Q50 18 26 26 Z" fill="#f6f7f9"/>
    <path d="M27 25 Q50 17 73 25 L80 31 Q50 40 20 31 Z" fill="#2bb673" opacity=".8"/>
    <path d="M27 25 Q50 17 73 25" stroke="#1f8a55" stroke-width="2" fill="none"/>
    <path d="M20 31 Q50 40 80 31" stroke="#1f8a55" stroke-width="1.5" fill="none"/>`,
  straw: `
    <ellipse cx="50" cy="24" rx="41" ry="8" fill="#e9c46a"/>
    <path d="M31 24 C31 -2 69 -2 69 24 Z" fill="#f2d48a"/>
    <path d="M31.4 15 L68.6 15 L69 22 L31 22 Z" fill="#e5484d"/>
    <path d="M14 26 Q50 36 86 26" stroke="#d4a944" stroke-width="1.5" fill="none"/>
    <ellipse cx="50" cy="24" rx="41" ry="8" fill="none" stroke="#d4a944" stroke-width="1.5"/>`,
  goggles: `
    <path d="M76 30 L76 -6 Q76 -13 69 -13" fill="none" stroke="#ffc93c" stroke-width="5" stroke-linecap="round"/>
    <path d="M76 1 L76 6" stroke="#e48f0c" stroke-width="5"/>
    <path d="M22 28 C22 12 78 12 78 28" fill="none" stroke="#22252b" stroke-width="4"/>
    <rect x="32" y="9" width="36" height="18" rx="8" fill="#ff9f1c"/>
    <rect x="36" y="12" width="28" height="12" rx="5.5" fill="#7cc4f5"/>
    <path d="M39.5 15 L46 15" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".85"/>`,
  mortarboard: `
    <path d="M30 28 L30 15 Q50 21 70 15 L70 28 Q50 34 30 28 Z" fill="#22252b"/>
    <path d="M50 -1 L89 9 L50 19 L11 9 Z" fill="#2f343d" stroke="#454c58" stroke-width="1"/>
    <path d="M50 9 L81 12 L81 30" stroke="#ffc93c" stroke-width="1.8" fill="none"/>
    <circle cx="50" cy="9" r="2.4" fill="#ffc93c"/>
    <path d="M78.5 29 L83.5 29 L85 39 L77 39 Z" fill="#ffc93c"/>`,
  pumpkin: `
    <ellipse cx="50" cy="12" rx="27" ry="18" fill="#ff8a1c"/>
    <path d="M38 -4 Q31 12 38 29 M62 -4 Q69 12 62 29" stroke="#e06d0c" stroke-width="2" fill="none" opacity=".7"/>
    <path d="M38 8 L44 8 L41 2 Z M56 8 L62 8 L59 2 Z" fill="#7a3a00"/>
    <path d="M39 16 L42.7 19 L46.3 16 L50 19 L53.7 16 L57.3 19 L61 16" stroke="#7a3a00" stroke-width="2" fill="none" stroke-linejoin="round"/>
    <path d="M47 -5 L48 -13 Q50 -16 54 -14 L53 -5 Z" fill="#5c8a2e"/>
    <path d="M54 -11 Q62 -16 65 -8 Q58 -11 54 -11 Z" fill="#2bb673"/>`,
  leaves: `
    ${leaf(42, 4, -32, '#e5484d', '#a8282d')}${leaf(58, 4, 30, '#ffc93c', '#e48f0c')}${leaf(50, -1, 0, '#ff8a1c', '#c9600c')}
    <path d="M26 31 C26 9 74 9 74 31 Z" fill="#a0612b"/>
    <path d="M38 14 L38 30 M50 11 L50 30 M62 14 L62 30" stroke="#8a5022" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="23" y="26" width="54" height="10" rx="5" fill="#e9c46a"/>`,
  star: `
    <path d="M24 32 C24 10 76 10 76 32" fill="none" stroke="#2bb673" stroke-width="5" stroke-linecap="round"/>
    <circle cx="30" cy="20.5" r="2.4" fill="#e5484d"/><circle cx="40" cy="15.5" r="2.4" fill="#2b8fd6"/>
    <circle cx="60" cy="15.5" r="2.4" fill="#ffc93c"/><circle cx="70" cy="20.5" r="2.4" fill="#a78bfa"/>
    <path d="M50 15 L50 3" stroke="#c9ccd1" stroke-width="2.5"/>
    <path d="M50 -22 L53.53 -12.85 L63.32 -12.33 L55.71 -6.15 L58.23 3.33 L50 -2 L41.77 3.33 L44.29 -6.15 L36.68 -12.33 L46.47 -12.85 Z" fill="#ffc93c" stroke="#e48f0c" stroke-width="1.8" stroke-linejoin="round"/>`,
};

/** Cuadros de bandera de meta: `cols` × `rows` a partir de (x, y), alternando blanco y negro. */
function checkers(x: number, y: number, cols: number, rows: number, w: number, hgt: number): string {
  let out = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out += `<rect x="${(x + c * w).toFixed(2)}" y="${(y + r * hgt).toFixed(2)}" width="${w}" height="${hgt}" fill="${(r + c) % 2 ? '#f6f7f9' : '#22252b'}"/>`;
    }
  }
  return out;
}

/** Corona de laurel: dos ramas de hojas que suben por los lados de la cabeza. */
function laurel(): string {
  let out = '<path d="M23 36 A28 28 0 0 1 77 36" fill="none" stroke="#1f8a55" stroke-width="2"/>';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const deg = 270 + side * (20 + i * 13);
      const rad = (deg * Math.PI) / 180;
      const x = (50 + 28 * Math.cos(rad)).toFixed(1);
      const y = (40 + 28 * Math.sin(rad)).toFixed(1);
      const along = deg - side * 90; // Hacia arriba por la rama.
      for (const tilt of [-30, 30]) {
        out += `<ellipse cx="${x}" cy="${y}" rx="5" ry="2.3" fill="${tilt * side < 0 ? '#2bb673' : '#7ee0a8'}" transform="rotate(${along + tilt} ${x} ${y}) translate(3 0)"/>`;
      }
    }
  }
  return out;
}

/** Flor de cinco pétalos para la corona de flores. */
function flower(x: number, y: number, color: string): string {
  const petals = [0, 72, 144, 216, 288]
    .map((deg) => {
      const rad = ((deg - 90) * Math.PI) / 180;
      return `<circle cx="${(x + 3.4 * Math.cos(rad)).toFixed(1)}" cy="${(y + 3.4 * Math.sin(rad)).toFixed(1)}" r="3"/>`;
    })
    .join('');
  return `<g fill="${color}">${petals}</g><circle cx="${x}" cy="${y}" r="2" fill="#ffc93c"/>`;
}

/** Hoja de otoño (con su nervio) girada `deg` grados. */
function leaf(x: number, y: number, deg: number, color: string, vein: string): string {
  return `<g transform="translate(${x} ${y}) rotate(${deg})"><path d="M0 -10 Q8 -2 0 10 Q-8 -2 0 -10 Z" fill="${color}"/><path d="M0 -8 L0 9" stroke="${vein}" stroke-width="1.2"/></g>`;
}

const PENGUIN_BODY = `
  <ellipse cx="50" cy="93" rx="26" ry="5" fill="#2a6f99" opacity=".2"/>
  <ellipse cx="38" cy="89" rx="9" ry="5" fill="#ff9f1c"/><ellipse cx="62" cy="89" rx="9" ry="5" fill="#ff9f1c"/>
  <ellipse cx="20" cy="56" rx="7" ry="17" fill="#1f2f45" transform="rotate(18 20 56)"/>
  <ellipse cx="80" cy="56" rx="7" ry="17" fill="#1f2f45" transform="rotate(-18 80 56)"/>
  <ellipse cx="50" cy="52" rx="32" ry="38" fill="#1f2f45"/>
  <ellipse cx="50" cy="60" rx="21" ry="25" fill="#fff"/>
  <circle cx="41" cy="40" r="11" fill="#fff"/><circle cx="59" cy="40" r="11" fill="#fff"/>
  <circle cx="42" cy="40" r="4.5" fill="#1f2f45"/><circle cx="58" cy="40" r="4.5" fill="#1f2f45"/>
  <circle cx="43.5" cy="38.5" r="1.6" fill="#fff"/><circle cx="59.5" cy="38.5" r="1.6" fill="#fff"/>
  <ellipse cx="33" cy="51" rx="4.5" ry="2.6" fill="#ff8fa3" opacity=".7"/><ellipse cx="67" cy="51" rx="4.5" ry="2.6" fill="#ff8fa3" opacity=".7"/>
  <path d="M44 47 L56 47 L50 55 Z" fill="#ff9f1c"/>`;

/** Pingüino con (o sin) gorro. Con gorro la caja crece por arriba para que quepa. */
export function penguinSvg(hat: HatId | null = null, { locked = false }: { locked?: boolean } = {}): string {
  const top = hat ? -22 : 0;
  const style = locked ? ' style="filter: grayscale(1); opacity: .45"' : '';
  return `<svg viewBox="0 ${top} 100 ${100 - top}" aria-hidden="true"${style}>${PENGUIN_BODY}${hat ? HATS[hat] : ''}</svg>`;
}

/**
 * Solo el gorro, como SVG independiente para hacer una textura en el juego.
 * Caja: x 0..100, y -30..100 (130 de alto) en coordenadas del pingüino.
 */
export const HAT_BOX = { top: -30, height: 130 };

export function hatSvg(hat: HatId, scale = 3): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${HAT_BOX.top} 100 ${HAT_BOX.height}" width="${100 * scale}" height="${HAT_BOX.height * scale}">${HATS[hat]}</svg>`;
}
