// Reto semanal: la tarjeta de la portada, la presentación con las reglas y el ranking.

import { cached } from '../../shared/cache';
import { skeleton } from '../../shared/skeleton';
import { dayKey, shiftDay, weekRange, DAILY_TIME_ZONE } from '../../../../common/logic/daily/daily';
import { movesBig } from '../../shared/result';
import { weekKey } from '../../../../common/logic/weekly/weekly';
import { h, openModal, untilMidnight } from '../../shared/dom';
import { go } from '../../shared/router';
import { ensureName } from '../profile/profile';
import { openGolfRanking } from '../ranking/golf-ranking';
import { type WeeklyInfo, getWeekly, getWeeklyRanking, startWeekly } from './api';
import { intlLocale, t, tn } from '../../i18n/i18n';

export function currentWeek(): string {
  return weekKey(dayKey(new Date()));
}

/** "12–18 de octubre" (o "28 de septiembre – 4 de octubre"), en el idioma del jugador. */
export function formatWeek(week: string): string {
  const date = (d: string) => new Date(`${d}T12:00:00Z`);
  return new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'long', timeZone: 'UTC' }).formatRange(date(week), date(shiftDay(week, 6)));
}

/** «Semana 12–18 de octubre». */
export function weekTitle(week: string): string {
  return t('weekly.title', { range: formatWeek(week) });
}

/** Cuánto le queda a la semana: los días (contando hoy) o, el domingo, las horas. */
export function weekLeft(): string {
  const today = dayKey(new Date());
  const days = Math.round((Date.parse(weekRange(today).to) - Date.parse(today)) / 86_400_000);
  return days === 0 ? t('weekly.endsIn', { time: untilMidnight(DAILY_TIME_ZONE) }) : t('weekly.left', { days: tn('common.days', days + 1) });
}

export function openWeeklyRanking(week: string): Promise<void> {
  return openGolfRanking({
    eyebrow: `${t('weekly.eyebrow')} · ${formatWeek(week)}`,
    title: t('weekly.ranking.title'),
    load: () => getWeeklyRanking(week),
    summary: (r) =>
      t('weekly.ranking.summary', { optimal: r.optimal, finished: tn('weekly.ranking.finished', r.total) }),
    empty: t('weekly.ranking.empty'),
  });
}

/** Botón «Jugar»: la primera vez, las reglas; luego, directo a la partida. */
export async function openWeekly(info: WeeklyInfo): Promise<void> {
  if (info.run) return go({ name: 'weekly', info });
  if (!(await ensureName())) return;
  const start = h('button', { class: 'btn big block' }, t('daily.intro.start'));
  const error = h('p', { class: 'error', hidden: true });
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, t('weekly.eyebrow')),
      h('h2', null, weekTitle(info.week)),
      h(
        'ul',
        { class: 'rules' },
        h('li', null, h('b', null, '🗺️'), h('span', null, t('weekly.intro.board', { optimal: info.optimal }))),
        h('li', null, h('b', null, '↺'), h('span', null, t('weekly.intro.attempts'))),
        h('li', null, h('b', null, '🚫'), h('span', null, t('weekly.intro.noHints'))),
        h('li', null, h('b', null, '🏆'), h('span', null, t('weekly.intro.ranking'))),
      ),
      error,
      start,
      h('button', { class: 'link-btn', onclick: () => modal.close() }, t('common.notNow')),
    ],
    { dismissable: true },
  );
  start.addEventListener('click', async () => {
    start.disabled = true;
    try {
      const started = await startWeekly(info.week);
      modal.close();
      go({ name: 'weekly', info: started });
    } catch (err) {
      error.textContent = (err as Error).message;
      error.hidden = false;
      start.disabled = false;
    }
  });
}

/** Tarjeta de la portada. Se rellena cuando llega la semana del servidor. */
export function weeklyCard(): { el: HTMLElement; load(): Promise<void> } {
  const el = h('section', { class: 'card weekly-card' }, h('p', { class: 'eyebrow' }, t('weekly.eyebrow')), skeleton(3));
  const render = (info: WeeklyInfo) => {
    const best = info.run?.overPar ?? null;
    el.replaceChildren(
      h('div', { class: 'daily-head' }, h('p', { class: 'eyebrow' }, t('weekly.eyebrow')), h('span', { class: 'week-left' }, weekLeft())),
      h('h2', null, weekTitle(info.week)),
      best !== null
        ? h(
            'div',
            { class: 'weekly-best' },
            movesBig(info.optimal + best, info.optimal),
            h(
              'span',
              { class: 'muted' },
              info.position !== null && info.total > 1
                ? t('weekly.place', { position: info.position, total: info.total })
                : `${tn('common.moves', info.run!.bestMoves!)} · ${t('common.optimalN', { n: info.optimal })}`,
            ),
          )
        : h('p', { class: 'muted' }, t('weekly.pitch')),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          { class: 'btn', onclick: () => void openWeekly(info) },
          best === null ? (info.run ? t('play.continue') : t('common.play')) : best === 0 ? t('weekly.playAgain') : `↺ ${t('golf.improve')}`,
        ),
        h('button', { class: 'btn ghost', onclick: () => void openWeeklyRanking(info.week) }, t('nav.ranking')),
      ),
    );
  };
  const card = {
    el,
    async load() {
      const week = currentWeek();
      await cached(`weekly:${week}`, () => getWeekly(week), render, (err) =>
        el.replaceChildren(
          h('p', { class: 'eyebrow' }, t('weekly.eyebrow')),
          h('p', { class: 'error' }, err.message),
          h('button', { class: 'btn ghost', onclick: () => void card.load() }, t('common.retry')),
        ),
      );
    },
  };
  return card;
}
