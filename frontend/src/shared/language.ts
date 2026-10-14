// Selector de idioma de la portada: un botón con el idioma actual que abre la lista.

import { LOCALES, LOCALE_NAMES } from '../../../common/i18n/locales';
import { locale, setLocale, t } from '../i18n/i18n';
import { h, openModal } from './dom';

export function languageButton(): HTMLButtonElement {
  const current = locale();
  return h(
    'button',
    {
      class: 'audio-btn lang-btn',
      title: t('language.title'),
      'aria-label': t('language.change', { language: LOCALE_NAMES[current] }),
      onclick: () => {
        const modal = openModal(
          [
            h('h2', null, t('language.title')),
            h(
              'div',
              { class: 'lang-list' },
              ...LOCALES.map((code) =>
                h(
                  'button',
                  {
                    class: `lang-option ${code === current ? 'selected' : ''}`,
                    lang: code,
                    'aria-current': code === current ? 'true' : undefined,
                    onclick: () => (code === current ? modal.close() : setLocale(code)),
                  },
                  h('strong', null, LOCALE_NAMES[code]),
                  h('span', null, code.toUpperCase()),
                ),
              ),
            ),
          ],
          { dismissable: true },
        );
      },
    },
    current.toUpperCase(),
  );
}
