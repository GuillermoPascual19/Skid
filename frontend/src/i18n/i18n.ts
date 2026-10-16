// Idioma del juego: el elegido por el jugador (guardado) o el del navegador. Los
// textos están en locales/<idioma>.ts (es.ts es el de referencia: los demás tienen
// exactamente las mismas claves, y TypeScript avisa si falta alguna). Solo se
// descarga el idioma en uso.
//
//   t('home.daily.title')                 texto
//   t('daily.result.over', { n: 2 })      con huecos {n}
//   tn('common.moves', 5)                 plural: «5 movimientos», «1 movimiento»
//   te('nameTaken')                       mensajes de error compartidos con el servidor

import { formatMessage, type MessageParams } from '../../../common/i18n/format';
import { isLocale, matchLocale, type Locale } from '../../../common/i18n/locales';
import type { ErrorKey, ErrorMessages } from '../../../common/i18n/errors/es';
import { read, write } from '../shared/storage';
import { messages as es } from './locales/es';

/** Formas del plural. El ruso usa también few (2–4) y many (5–20…); el resto, one y other. */
export interface Plural {
  readonly one: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
}

/** La forma de un diccionario: la del español, con cualquier texto en cada hoja. */
export type Messages = Shape<typeof es>;
type Shape<T> = { [K in keyof T]: T[K] extends string ? string : T[K] extends Plural ? Plural : Shape<T[K]> };

/** Claves con punto ('home.daily.title') de las hojas de un tipo (textos o plurales). */
type Keys<T, Want, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Want ? `${P}${K}` : T[K] extends string | Plural ? never : Keys<T[K], Want, `${P}${K}.`>;
}[keyof T & string];

export type TextKey = Keys<typeof es, string>;
export type PluralKey = Keys<typeof es, Plural>;

const LOCALE_KEY = 'skid.lang.v1';

/** Etiqueta de Intl de cada idioma (fechas, números, plurales). */
const INTL: Record<Locale, string> = { es: 'es-ES', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', pt: 'pt-PT', it: 'it-IT', ru: 'ru-RU' };

/** Los textos del juego (el español va dentro del código principal). */
const MESSAGES: Record<Locale, () => Promise<Messages>> = {
  es: async () => es,
  en: async () => (await import('./locales/en')).messages,
  de: async () => (await import('./locales/de')).messages,
  fr: async () => (await import('./locales/fr')).messages,
  pt: async () => (await import('./locales/pt')).messages,
  it: async () => (await import('./locales/it')).messages,
  ru: async () => (await import('./locales/ru')).messages,
};

/** Los mensajes de error, aparte: no hacen falta para pintar la primera pantalla. */
const ERRORS: Record<Locale, () => Promise<ErrorMessages>> = {
  es: async () => (await import('../../../common/i18n/errors/es')).errors,
  en: async () => (await import('../../../common/i18n/errors/en')).errors,
  de: async () => (await import('../../../common/i18n/errors/de')).errors,
  fr: async () => (await import('../../../common/i18n/errors/fr')).errors,
  pt: async () => (await import('../../../common/i18n/errors/pt')).errors,
  it: async () => (await import('../../../common/i18n/errors/it')).errors,
  ru: async () => (await import('../../../common/i18n/errors/ru')).errors,
};

let current: Locale = 'es';
let dict: Messages = es;
let errorDict: ErrorMessages | null = null;
let pluralRules = new Intl.PluralRules(INTL.es);

/** El idioma guardado o, si no hay, el primero del navegador que tengamos. */
function chosenLocale(): Locale {
  const saved = read<string>(LOCALE_KEY);
  if (isLocale(saved)) return saved;
  return matchLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/** Carga el idioma antes de pintar nada (se llama al arrancar). */
export async function initI18n(): Promise<void> {
  current = chosenLocale();
  // Los errores se piden a la vez que los textos, pero no se esperan.
  void ERRORS[current]()
    .catch(() => ERRORS.es())
    .then((errors) => (errorDict = errors))
    .catch(() => {});
  dict = await MESSAGES[current]().catch(() => MESSAGES.es());
  pluralRules = new Intl.PluralRules(INTL[current]);
  document.documentElement.lang = current;
}

export function locale(): Locale {
  return current;
}

/** Etiqueta para Intl.DateTimeFormat y compañía. */
export function intlLocale(): string {
  return INTL[current];
}

/** Cambia de idioma: se guarda y se recarga la página para pintarlo todo de nuevo. */
export function setLocale(next: Locale): void {
  write(LOCALE_KEY, next);
  location.reload();
}

function lookup(tree: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), tree);
}

export function t(key: TextKey, params?: MessageParams): string {
  const text = lookup(dict, key) ?? lookup(es, key);
  return formatMessage(typeof text === 'string' ? text : key, params);
}

/** Plural según las reglas del idioma; {n} es el número (también se puede usar en el texto). */
export function tn(key: PluralKey, n: number, params?: MessageParams): string {
  const forms = (lookup(dict, key) ?? lookup(es, key)) as Plural | undefined;
  if (!forms) return key;
  const rule = pluralRules.select(n);
  const form = (rule === 'one' || rule === 'few' || rule === 'many' ? forms[rule] : undefined) ?? forms.other;
  return formatMessage(form, { n, ...params });
}

/** Mensajes de error compartidos con el servidor (tableros, nombres…). */
export function te(key: ErrorKey, params?: MessageParams): string {
  return formatMessage(errorDict?.[key] ?? key, params);
}

/** Nombre de un jugador, o «Anónimo» (en el idioma del jugador) si no eligió ninguno. */
export function playerName(name: string | null | undefined): string {
  return name ?? t('common.anonymous');
}
