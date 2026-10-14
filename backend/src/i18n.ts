// Idioma de cada petición y mensajes de error traducidos. El juego manda su idioma
// en la cabecera X-Skid-Lang; si no, se usa Accept-Language.

import { isLocale, matchLocale, parseAcceptLanguage, type Locale } from '../../common/i18n/locales';
import { formatMessage, type MessageParams } from '../../common/i18n/format';
import { errors as de } from '../../common/i18n/errors/de';
import { errors as en } from '../../common/i18n/errors/en';
import { errors as es, type ErrorKey, type ErrorMessages } from '../../common/i18n/errors/es';
import { errors as fr } from '../../common/i18n/errors/fr';
import { errors as it } from '../../common/i18n/errors/it';
import { errors as pt } from '../../common/i18n/errors/pt';
import { errors as ru } from '../../common/i18n/errors/ru';

const MESSAGES: Record<Locale, ErrorMessages> = { es, en, de, fr, pt, it, ru };

export function requestLocale(req: Request): Locale {
  const chosen = req.headers.get('X-Skid-Lang');
  if (isLocale(chosen)) return chosen;
  return matchLocale(parseAcceptLanguage(req.headers.get('Accept-Language')));
}

export function errorMessage(locale: Locale, key: ErrorKey, params?: MessageParams): string {
  return formatMessage(MESSAGES[locale][key] ?? es[key], params);
}
