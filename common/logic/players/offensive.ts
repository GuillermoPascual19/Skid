// Filtro de insultos y palabrotas para los nombres que ven otros jugadores (el
// del jugador, los de los niveles y los de las ligas), en los siete idiomas del
// juego. Detecta los trucos habituales: tildes, mayúsculas, números por letras
// (`pu7a`), letras repetidas (`fuuuck`) y letras sueltas (`p.u.t.a`).
//
// Dos listas, para no bloquear palabras inocentes que contienen una mala
// (`computadora` lleva «puta»; `cálculo`, «culo»):
// - WORDS solo cuenta si es una palabra entera (con o sin plural en -s/-es).
// - ROOTS cuenta en cualquier parte, también pegada a otras palabras: solo
//   raíces que no aparecen dentro de palabras normales.

const WORDS = [
  // Español
  'puta', 'puto', 'putita', 'marica', 'culo', 'polla', 'zorra', 'verga', 'follar', 'mamon', 'mamona', 'imbecil', 'idiota', 'retrasado', 'mongolo', 'pajero',
  'mamada', 'cojones', 'chupala', 'pedo', 'hdp', 'ptm', 'huevon', 'tetas', 'putero',
  // English
  'cunt', 'dick', 'cock', 'pussy', 'slut', 'retard', 'rape', 'twat', 'porn', 'porno', 'penis', 'vagina', 'sex', 'nazi', 'kkk', 'shit', 'wank', 'fick', 'ass', 'tits',
  'boobs', 'fag', 'stfu', 'wtf', 'milf', 'fck', 'fuk',
  // Deutsch
  'arsch', 'hure', 'spast', 'neger', 'titten', 'nutte',
  // Français
  'pute', 'pede', 'fdp', 'ntm', 'conne', 'nique', 'niquer', 'chier', 'batard', 'connard',
  // Português
  'foder', 'porra', 'viado', 'otario', 'vsf', 'pqp', 'bosta', 'piroca', 'cuzao',
  // Italiano
  'troia', 'figa', 'cazzi', 'zoccola', 'culattone',
  // Русский (y su transliteración)
  'сука', 'суки', 'сучка', 'педик', 'дебил', 'жопа', 'ебал', 'suka', 'khuy', 'pidor', 'pidar', 'ebat', 'eban', 'zhopa', 'blya', 'blyat', 'blyad',
];

const ROOTS = [
  // Español
  'hijoputa', 'hijaputa', 'hijodeputa', 'hijadeputa', 'puticlub', 'gilipolla', 'maricon', 'pendejo', 'pendeja', 'cabron', 'mierda', 'joder', 'jodete', 'chinga',
  'culero', 'subnormal', 'malparido', 'comepolla', 'chupapolla', 'mamaverga', 'violador', 'pedofil', 'zoofil', 'putamadre', 'tuputa', 'tumadre', 'gonorrea',
  // English
  'fuck', 'asshole', 'bitch', 'bullshit', 'shithead', 'shitty', 'nigger', 'nigga', 'faggot', 'wanker', 'cocksuck', 'dickhead', 'whore', 'bastard',
  'rapist', 'jizz', 'pedophil', 'hitler', 'siegheil', 'heilhitler', 'whitepower', 'dumbass', 'jackass', 'dipshit',
  // Deutsch
  'arschloch', 'fotze', 'votze', 'wichser', 'wixer', 'hurensohn', 'schlampe', 'scheiss', 'scheis', 'missgeburt', 'schwuchtel', 'ficken', 'ficker', 'fickt',
  'mistkerl', 'drecksau', 'kanake',
  // Français
  'putain', 'salope', 'connasse', 'encule', 'filsdepute', 'niquetamere', 'tamere', 'merde', 'couille', 'enfoire', 'pouffiasse',
  // Português
  'caralho', 'foda', 'buceta', 'cabrao', 'arrombado', 'punheta', 'filhodaputa', 'filhadaputa', 'merda', 'desgracado', 'babaca',
  // Italiano
  'cazzo', 'vaffanculo', 'fanculo', 'stronzo', 'stronza', 'puttana', 'coglion', 'minchia', 'frocio', 'porcodio', 'dioporco', 'mignotta', 'porcamadonna',
  'figlioditroia', 'bastardo',
  // Русский (y su transliteración)
  'хуй', 'хуе', 'хуя', 'хую', 'пизд', 'ебан', 'ебать', 'ебало', 'ебала', 'еблан', 'заеб', 'выеб', 'долбоеб', 'бляд', 'блят', 'мудак', 'мудил', 'пидор', 'пидар', 'гандон', 'залуп',
  'шлюх', 'уебок', 'уебан', 'pizd', 'mudak', 'gandon', 'zaeb', 'dolboeb', 'nahuy', 'pohuy',
];

/** Números y símbolos que se usan en lugar de letras. */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '€': 'e', 'ß': 'ss' };

/** Sin tildes, en minúsculas y con los números y símbolos cambiados por letras (`one`: lo que vale el 1, «i» o «l»). */
function normalize(text: string, one = 'i'): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[0-9@$!€ß]/g, (c) => (c === '1' ? one : (LEET[c] ?? c)));
}

/** Cada letra puede repetirse: «fuck» también encuentra «fuuuck». */
const stretch = (word: string) => [...normalize(word)].map((c) => `${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}+`).join('');

const WORD_PATTERN = new RegExp(`^(?:${WORDS.map(stretch).join('|')})(?:e?s+)?$`, 'u');
const ROOT_PATTERN = new RegExp(ROOTS.map(stretch).join('|'), 'u');

/** true si el texto contiene un insulto o una palabrota. */
export function isOffensive(text: string): boolean {
  return check(normalize(text)) || (text.includes('1') && check(normalize(text, 'l')));
}

function check(normalized: string): boolean {
  const words = normalized.split(/[^\p{L}]+/u).filter(Boolean);
  // Las letras sueltas seguidas se leen juntas: «p u t a», «f.u.c.k».
  const candidates = [...words];
  let run = '';
  for (const w of [...words, '']) {
    if (w.length === 1) run += w;
    else {
      if (run.length > 1) candidates.push(run);
      run = '';
    }
  }
  if (candidates.some((w) => WORD_PATTERN.test(w))) return true;
  return ROOT_PATTERN.test(words.join('')) || candidates.some((w) => ROOT_PATTERN.test(w));
}
