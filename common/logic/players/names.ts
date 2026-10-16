// Nombres de jugador: qué caracteres se admiten y cuándo dos nombres son "el
// mismo" (para que nadie se haga pasar por otro con un nombre que se ve igual).

import { isOffensive } from './offensive';

export const NAME_MIN = 2;
export const NAME_MAX = 20;

/**
 * Letras del alfabeto latino (con tildes, ñ, ç…), números, espacios y . _ ' -,
 * empezando por letra o número. Fuera quedan, entre otros, los alfabetos cirílico
 * y griego, que tienen letras idénticas a las nuestras (la «а» cirílica y la «a»).
 */
const NAME_PATTERN = /^[\p{Script=Latin}\d][\p{Script=Latin}\d ._'-]*$/u;

/** Por qué no vale un nombre (cada lado lo traduce): longitud, caracteres o un insulto. */
export type NameProblem = 'length' | 'chars' | 'offensive';

/** La clave de error que corresponde a cada problema. */
export const NAME_ERRORS = { length: 'nameLength', chars: 'nameChars', offensive: 'nameOffensive' } as const;

/** null si el nombre vale; si no, por qué no. Se espera ya limpio de espacios de más. */
export function nameProblem(name: string): NameProblem | null {
  if (name.length < NAME_MIN || name.length > NAME_MAX) return 'length';
  if (!NAME_PATTERN.test(name)) return 'chars';
  if (isOffensive(name)) return 'offensive';
  return null;
}

/**
 * Clave para comparar nombres: sin tildes, en minúsculas y sin separadores.
 * «José_Luis», «jose luis» y «JOSELUIS» tienen la misma clave, así que solo
 * puede haber uno de ellos.
 */
export function nameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\s._'-]/g, '');
}
