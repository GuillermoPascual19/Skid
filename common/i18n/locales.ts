// Idiomas del juego. El juego elige uno (el guardado o el del navegador) y se lo
// dice al servidor en cada petición para que los mensajes de error lleguen en ese idioma.

export const LOCALES = ['es', 'en', 'de', 'fr', 'pt', 'it'] as const;

export type Locale = (typeof LOCALES)[number];

/** Si el navegador no pide ninguno de los nuestros. */
export const DEFAULT_LOCALE: Locale = 'en';

/** Nombre de cada idioma en su propio idioma (para el selector). */
export const LOCALE_NAMES: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  pt: 'Português',
  it: 'Italiano',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** El primero de la lista de preferencias («pt-BR», «en-US»…) que tengamos; si no, el de por defecto. */
export function matchLocale(preferences: readonly string[]): Locale {
  for (const tag of preferences) {
    const base = tag.trim().toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/** Idiomas de una cabecera Accept-Language, en orden de preferencia. */
export function parseAcceptLanguage(header: string | null): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = Number(params.find((p) => p.trim().startsWith('q='))?.split('=')[1] ?? 1);
      return { tag, q: Number.isNaN(q) ? 0 : q };
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag);
}
