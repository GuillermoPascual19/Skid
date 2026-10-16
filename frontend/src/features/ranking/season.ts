// Temporada de una liga en el ranking: el premio del mes, cuánto queda y el
// podio de la temporada anterior.

import { penguinSvg } from '../../../../common/art/hats';
import { DAILY_TIME_ZONE, dayKey } from '../../../../common/logic/daily/daily';
import { h, svg, untilMidnight } from '../../shared/dom';
import { intlLocale, playerName, t, tn } from '../../i18n/i18n';
import type { LeagueSeason, SeasonPlace } from './api';

const date = (season: string) => new Date(`${season}-15T12:00:00Z`);

/** "Octubre de 2026", en el idioma del jugador. */
export function seasonName(season: string): string {
  const text = new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date(season));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Solo el mes ("octubre"), como se escribe dentro de una frase. */
export function monthName(season: string): string {
  return new Intl.DateTimeFormat(intlLocale(), { month: 'long', timeZone: 'UTC' }).format(date(season));
}

/** "Quedan 18 días" o, el último día, "Termina en 3 h 20 min". */
export function seasonLeft(ends: string): string {
  const days = Math.round((Date.parse(ends) - Date.parse(dayKey(new Date()))) / 86_400_000);
  return days <= 0 ? t('weekly.endsIn', { time: untilMidnight(DAILY_TIME_ZONE) }) : t('weekly.left', { days: tn('common.days', days + 1) });
}

/** Tarjeta de la temporada en curso: premio, cuánto queda y cómo se gana. */
export function seasonCard(s: LeagueSeason): HTMLElement {
  return h(
    'section',
    { class: 'card season-card' },
    h('div', { class: 'season-prize' }, svg(penguinSvg(s.hat))),
    h(
      'div',
      { class: 'season-info' },
      h('p', { class: 'eyebrow' }, `${t('ranking.period.season')} · ${seasonLeft(s.ends)}`),
      h('h2', null, seasonName(s.season)),
      h('p', null, t('season.prize', { hat: t(`hats.${s.hat}`) })),
      h('small', { class: 'muted' }, t('season.rule')),
    ),
  );
}

/** Podio de la temporada pasada (o que nadie la ganó). */
export function previousSeasonCard(previous: NonNullable<LeagueSeason['previous']>): HTMLElement {
  return h(
    'section',
    { class: 'card season-prev' },
    h('p', { class: 'eyebrow' }, t('season.previous')),
    h('h2', null, seasonName(previous.season)),
    previous.podium.length === 0
      ? h('p', { class: 'muted' }, t('season.noChampion'))
      : h('ol', { class: 'season-podium' }, ...previous.podium.map((p) => podiumRow(p, previous.hat))),
  );
}

function podiumRow(p: SeasonPlace, prize: LeagueSeason['hat']): HTMLElement {
  const champion = p.position === 1;
  const name = playerName(p.name);
  return h(
    'li',
    { class: `${champion ? 'champion' : ''} ${p.isMe ? 'me' : ''}` },
    h('span', { class: 'pos' }, ['🥇', '🥈', '🥉'][p.position - 1] ?? String(p.position)),
    // El campeón sale con el gorro que ganó; los demás, con el suyo.
    h('span', { class: 'avatar' }, svg(penguinSvg(champion ? prize : p.hat))),
    h('strong', null, p.isMe ? t('ranking.me', { name }) : name),
    h('span', { class: 'pts' }, String(p.points)),
  );
}
