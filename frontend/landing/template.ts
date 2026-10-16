// Página de presentación de un idioma (ver content.ts): HTML ya escrito, sin
// JavaScript, para que la lean los buscadores y cargue al instante. Enlaza con
// sus versiones en los demás idiomas (hreflang) y lleva los datos del juego
// para buscadores (schema.org VideoGame).

import { LOCALES, LOCALE_NAMES, type Locale } from '../../common/i18n/locales.ts';
import { penguinSvg } from '../../common/art/hats.ts';
import { LANDING, SITE } from './content.ts';

/** Tamaño de las capturas (las de frontend/public/landing/, hechas a 375 × 812 y a doble resolución). */
const SHOT = { width: 375, height: 812 };

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Dirección de la presentación de un idioma. */
export const landingPath = (locale: Locale) => `/${locale}/`;

export function landingPage(locale: Locale): string {
  const c = LANDING[locale];
  const url = `${SITE}${landingPath(locale)}`;
  const alternates = LOCALES.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${landingPath(l)}" />`).join('\n    ');
  const data = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: 'Skid',
    url: SITE,
    description: c.description,
    genre: ['Puzzle'],
    inLanguage: [...LOCALES],
    image: `${SITE}/og-image.jpg`,
    gamePlatform: ['Web browser', 'Android', 'iOS', 'Windows', 'macOS'],
    applicationCategory: 'Game',
    operatingSystem: 'Any',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  };
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escape(c.title)}</title>
    <meta name="description" content="${escape(c.description)}" />
    <link rel="canonical" href="${url}" />
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${SITE}${landingPath('en')}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${escape(c.title)}" />
    <meta property="og:description" content="${escape(c.description)}" />
    <meta property="og:image" content="${SITE}/og-image.jpg" />
    <meta property="og:locale" content="${locale}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="theme-color" content="#1c6aa5" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="preload" href="/fonts/baloo2-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/fonts.css" />
    <link rel="stylesheet" href="/static.css" />
    <link rel="stylesheet" href="/landing.css" />
    <script type="application/ld+json">${JSON.stringify(data)}</script>
  </head>
  <body class="landing">
    <header class="hero">
      <div class="hero-penguin" aria-hidden="true">${penguinSvg('beanie')}</div>
      <p class="brand">Skid</p>
      <h1>${escape(c.h1)}</h1>
      <p class="lead">${escape(c.intro)}</p>
      <p class="cta"><a class="btn big" href="/">${escape(c.play)}</a> <a class="link" href="#como">${escape(c.howLink)}</a></p>
    </header>

    <section class="shots" aria-label="${escape(c.shots[0])}">
      ${c.shots
        .map(
          (alt, i) =>
            `<img src="/landing/${locale}-${i + 1}.webp" width="${SHOT.width}" height="${SHOT.height}" alt="${escape(alt)}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" />`,
        )
        .join('\n      ')}
    </section>

    <main>
      <section>
        <h2>${escape(c.featuresTitle)}</h2>
        <ul class="features">
          ${c.features.map(([icon, title, text]) => `<li><span class="icon" aria-hidden="true">${icon}</span><h3>${escape(title)}</h3><p>${escape(text)}</p></li>`).join('\n          ')}
        </ul>
      </section>

      <section id="como">
        <h2>${escape(c.howTitle)}</h2>
        <ol class="steps">
          ${c.steps.map((step) => `<li>${escape(step)}</li>`).join('\n          ')}
        </ol>
      </section>

      <section>
        <h2>${escape(c.faqTitle)}</h2>
        ${c.faq.map(([q, a]) => `<details><summary>${escape(q)}</summary><p>${escape(a)}</p></details>`).join('\n        ')}
      </section>

      <section class="final">
        <h2>${escape(c.finalTitle)}</h2>
        <p>${escape(c.finalText)}</p>
        <p><a class="btn big" href="/">${escape(c.play)}</a></p>
      </section>
    </main>

    <footer class="landing-footer">
      <nav aria-label="${escape(c.languages)}">${LOCALES.map((l) => (l === locale ? `<strong>${LOCALE_NAMES[l]}</strong>` : `<a href="${landingPath(l)}" hreflang="${l}" lang="${l}">${LOCALE_NAMES[l]}</a>`)).join(' · ')}</nav>
      <nav><a href="/legal/privacidad.html">${escape(c.legal[0])}</a> · <a href="/legal/terminos.html">${escape(c.legal[1])}</a> · <a href="/legal/aviso-legal.html">${escape(c.legal[2])}</a></nav>
    </footer>
  </body>
</html>
`;
}
