import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, LOCALE_NAMES, isLocale, matchLocale, parseAcceptLanguage } from '../../../common/i18n/locales';

describe('idiomas', () => {
  it('cada idioma tiene su nombre', () => {
    expect(LOCALES.every((l) => LOCALE_NAMES[l].length > 0)).toBe(true);
    expect(LOCALE_NAMES.ru).toBe('Русский');
  });

  it('elige el primero de la lista que tengamos, sin fijarse en la región', () => {
    expect(matchLocale(['ru-RU', 'en-US'])).toBe('ru');
    expect(matchLocale(['ja-JP', 'pt-BR'])).toBe('pt');
    expect(matchLocale(['ja-JP'])).toBe(DEFAULT_LOCALE);
  });

  it('ordena Accept-Language por preferencia', () => {
    expect(parseAcceptLanguage('en;q=0.5, ru-RU, de;q=0.8')).toEqual(['ru-RU', 'de', 'en']);
    expect(parseAcceptLanguage(null)).toEqual([]);
  });

  it('solo valen los idiomas de la lista', () => {
    expect(isLocale('ru')).toBe(true);
    expect(isLocale('ja')).toBe(false);
  });
});
