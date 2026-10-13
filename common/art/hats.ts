// El pingüino y sus gorros en SVG. Es la única fuente de los dibujos: la web los
// usa tal cual y el juego (Phaser) los convierte en textura (ver hatSvg).
//
// Coordenadas: las del pingüino, en una caja de 100 de ancho. El cuerpo es una
// elipse centrada en (50, 52) de radios 32 × 38, así que la cabeza acaba en y = 14.
// Los gorros pueden subir hasta y = -30.

export type HatId = 'beanie' | 'earmuffs' | 'cap' | 'tophat' | 'viking' | 'party' | 'santa' | 'ushanka' | 'wizard' | 'crown';

export const HAT_NAMES: Record<HatId, string> = {
  beanie: 'Gorro de lana',
  earmuffs: 'Orejeras',
  cap: 'Gorra',
  tophat: 'Sombrero de copa',
  viking: 'Casco vikingo',
  party: 'Gorro de fiesta',
  santa: 'Gorro de Papá Noel',
  ushanka: 'Gorro polar',
  wizard: 'Gorro de mago',
  crown: 'Corona',
};

export function isHatId(value: unknown): value is HatId {
  return typeof value === 'string' && value in HAT_NAMES;
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
};

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
