// Reto semanal: la tarjeta de la portada, la presentación con las reglas y el ranking.

import { dayKey, shiftDay, weekRange, DAILY_TIME_ZONE } from '../../../../common/logic/daily/daily';
import { golfLabel } from '../../../../common/logic/daily/score';
import { weekKey } from '../../../../common/logic/weekly/weekly';
import { h, openModal, plural, untilMidnight } from '../../shared/dom';
import { go } from '../../shared/router';
import { ensureName } from '../profile/profile';
import { openGolfRanking } from '../ranking/golf-ranking';
import { type WeeklyInfo, getWeekly, getWeeklyRanking, startWeekly } from './api';

export function currentWeek(): string {
  return weekKey(dayKey(new Date()));
}

/** "del 12 al 18 de octubre" (o "del 28 de septiembre al 4 de octubre"). */
export function formatWeek(week: string): string {
  const end = shiftDay(week, 6);
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
  const sameMonth = week.slice(5, 7) === end.slice(5, 7);
  return `del ${fmt(week, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' })} al ${fmt(end, { day: 'numeric', month: 'long' })}`;
}

/** Cuánto le queda a la semana: los días (contando hoy) o, el domingo, las horas. */
export function weekLeft(): string {
  const today = dayKey(new Date());
  const days = Math.round((Date.parse(weekRange(today).to) - Date.parse(today)) / 86_400_000);
  return days === 0 ? `Termina en ${untilMidnight(DAILY_TIME_ZONE)}` : `Quedan ${plural(days + 1, 'día', 'días')}`;
}

export function openWeeklyRanking(week: string): Promise<void> {
  return openGolfRanking({
    eyebrow: `Reto semanal · ${formatWeek(week)}`,
    title: 'Tus amigos',
    load: () => getWeeklyRanking(week),
    summary: (r) =>
      `Óptimo ${r.optimal} · ${plural(r.total, 'amigo lo ha terminado', 'amigos lo han terminado')} (contándote a ti). A igualdad, gana quien lo consiguió antes.`,
    empty: 'Ninguno de tus amigos lo ha terminado todavía. ¡Sé el primero!',
  });
}

/** Botón «Jugar»: la primera vez, las reglas; luego, directo a la partida. */
export async function openWeekly(info: WeeklyInfo): Promise<void> {
  if (info.run) return go({ name: 'weekly', info });
  if (!(await ensureName())) return;
  const start = h('button', { class: 'btn big block' }, 'Empezar');
  const error = h('p', { class: 'error', hidden: true });
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, 'Reto semanal'),
      h('h2', null, `Semana ${formatWeek(info.week)}`),
      h(
        'ul',
        { class: 'rules' },
        h('li', null, h('b', null, '🗺️'), h('span', null, `Un tablero grande para toda la semana, el mismo para todos. Óptimo: ${info.optimal} movimientos.`)),
        h('li', null, h('b', null, '↺'), h('span', null, 'Juega cuantas veces quieras hasta el domingo: cuenta tu mejor intento.')),
        h('li', null, h('b', null, '🚫'), h('span', null, 'Sin pistas: es el reto difícil.')),
        h('li', null, h('b', null, '🏆'), h('span', null, 'Ranking con tus amigos de todas tus ligas. A igualdad, gana quien lo consiguió antes.')),
      ),
      error,
      start,
      h('button', { class: 'link-btn', onclick: () => modal.close() }, 'Ahora no'),
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
  const el = h('section', { class: 'card weekly-card' }, h('p', { class: 'eyebrow' }, 'Reto semanal'), h('p', { class: 'muted' }, 'Cargando…'));
  const render = (info: WeeklyInfo) => {
    const best = info.run?.overPar ?? null;
    el.replaceChildren(
      h('div', { class: 'daily-head' }, h('p', { class: 'eyebrow' }, 'Reto semanal'), h('span', { class: 'week-left' }, weekLeft())),
      h('h2', null, `Semana ${formatWeek(info.week)}`),
      best !== null
        ? h(
            'div',
            { class: 'weekly-best' },
            h('span', { class: `score-big golf${best === 0 ? ' par' : ''}` }, golfLabel(best)),
            h(
              'span',
              { class: 'muted' },
              info.position !== null && info.total > 1 ? `Puesto ${info.position} de ${info.total} entre tus amigos` : `${info.run!.bestMoves} movimientos · óptimo ${info.optimal}`,
            ),
          )
        : h('p', { class: 'muted' }, 'Un tablero grande y difícil para toda la semana. Juega cuantas veces quieras: cuenta tu mejor intento.'),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          { class: 'btn', onclick: () => void openWeekly(info) },
          best === null ? (info.run ? 'Continuar' : 'Jugar') : best === 0 ? 'Jugar otra vez' : '↺ Mejorar',
        ),
        h('button', { class: 'btn ghost', onclick: () => void openWeeklyRanking(info.week) }, 'Ranking'),
      ),
    );
  };
  return {
    el,
    async load() {
      try {
        render(await getWeekly(currentWeek()));
      } catch (err) {
        el.replaceChildren(h('p', { class: 'eyebrow' }, 'Reto semanal'), h('p', { class: 'error' }, (err as Error).message));
      }
    },
  };
}
