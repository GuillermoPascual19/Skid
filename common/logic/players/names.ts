// Nombres de jugador: qué caracteres se admiten y cuándo dos nombres son "el
// mismo" (para que nadie se haga pasar por otro con un nombre que se ve igual).

export const NAME_MIN = 2;
export const NAME_MAX = 20;

/**
 * Letras del alfabeto latino (con tildes, ñ, ç…), números, espacios y . _ ' -,
 * empezando por letra o número. Fuera quedan, entre otros, los alfabetos cirílico
 * y griego, que tienen letras idénticas a las nuestras (la «а» cirílica y la «a»).
 */
const NAME_PATTERN = /^[\p{Script=Latin}\d][\p{Script=Latin}\d ._'-]*$/u;

/** null si el nombre vale; si no, por qué no. Se espera ya limpio de espacios de más. */
export function nameProblem(name: string): string | null {
  if (name.length < NAME_MIN || name.length > NAME_MAX) return `El nombre debe tener entre ${NAME_MIN} y ${NAME_MAX} caracteres`;
  if (!NAME_PATTERN.test(name)) return 'Usa solo letras, números, espacios y . _ \' - (empezando por letra o número)';
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
