// Contrarreloj: la tarjeta de la portada, la presentación con las reglas (y
// empezar) y el ranking de la semana con tus amigos.

import { cached } from '../../shared/cache';
import { penguinSvg } from '../../../../common/art/hats';
import { TIME_ATTACK_MS, TIME_ATTACK_POINTS, TIME_ATTACK_SKIP_MS } from '../../../../common/logic/timeattack/timeattack';
import { h, openModal, svg } from '../../shared/dom';
import { go } from '../../shared/router';
import { ensureName } from '../profile/profile';
import { currentWeek, formatWeek, weekLeft } from '../weekly/weekly';
import { type TimeAttackSummary, getTimeAttack, startTimeAttack, timeAttackRanking } from './api';
import { intlLocale, playerName, t, tn } from '../../i18n/i18n';

/** «1.250», con los separadores del idioma del jugador. */
export const formatPoints = (n: number) => n.toLocaleString(intlLocale());

/** Las reglas y, al pulsar Empezar, a jugar. `previousBest` es tu mejor marca de la semana (para celebrar si la superas). */
export async function openTimeAttack(previousBest: number | null): Promise<void> {
  if (!(await ensureName())) return;
  const start = h('button', { class: 'btn big block' }, `⏱ ${t('daily.intro.start')}`);
  const error = h('p', { class: 'error', hidden: true });
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, `${t('timeattack.title')} · ${formatWeek(currentWeek())}`),
      h('h2', null, t('timeattack.intro.title', { minutes: TIME_ATTACK_MS / 60_000 })),
      h(
        'ul',
        { class: 'rules' },
        h('li', null, h('b', null, '🧊'), h('span', null, t('timeattack.intro.boards'))),
        h('li', null, h('b', null, '⭐'), h('span', null, t('timeattack.intro.points', { base: TIME_ATTACK_POINTS.base, perfect: TIME_ATTACK_POINTS.perfect }))),
        h('li', null, h('b', null, '⏭'), h('span', null, t('timeattack.intro.skip', { seconds: TIME_ATTACK_SKIP_MS / 1000 }))),
        h('li', null, h('b', null, '🏆'), h('span', null, t('timeattack.intro.week'))),
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
      const started = await startTimeAttack(currentWeek());
      modal.close();
      go({ name: 'timeAttack', start: started, previousBest });
    } catch (err) {
      error.textContent = (err as Error).message;
      error.hidden = false;
      start.disabled = false;
    }
  });
}

const medal = (position: number) => ['🥇', '🥈', '🥉'][position - 1] ?? String(position);

/** El ranking de la semana con tus amigos (su mejor partida). */
export async function openTimeAttackRanking(week = currentWeek()): Promise<void> {
  const list = h('ol', { class: 'ranking' }, h('li', { class: 'empty', style: 'display:block' }, t('common.loading')));
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, `${t('timeattack.title')} · ${formatWeek(week)}`),
      h('h2', null, t('weekly.ranking.title')),
      list,
      h('button', { class: 'link-btn', onclick: () => modal.close() }, t('common.close')),
    ],
    { dismissable: true },
  );
  try {
    const rows = await timeAttackRanking(week);
    list.replaceChildren(
      ...(rows.length
        ? rows.map((r) =>
            h(
              'li',
              { class: `rank-row ${r.isMe ? 'me' : ''}` },
              h('span', { class: 'pos' }, medal(r.position)),
              h('span', { class: 'avatar' }, svg(penguinSvg(r.hat))),
              h(
                'span',
                { class: 'who' },
                h('strong', null, r.isMe ? t('ranking.me', { name: playerName(r.name) }) : playerName(r.name)),
                h('small', null, [tn('timeattack.boards', r.boards), r.perfect ? `🎯 ${r.perfect}` : null].filter(Boolean).join(' · ')),
              ),
              h('span', { class: 'pts' }, formatPoints(r.score)),
            ),
          )
        : [h('li', { class: 'empty', style: 'display:block' }, t('timeattack.ranking.empty'))]),
    );
  } catch (err) {
    list.replaceChildren(h('li', { class: 'empty', style: 'display:block' }, (err as Error).message));
  }
}

/** Tarjeta de la portada: tu mejor marca de la semana (o qué es) y botones para jugar y ver el ranking. */
export function timeAttackCard(): { el: HTMLElement; load(): Promise<void> } {
  const el = h('section', { class: 'card weekly-card timeattack-card' });
  const render = (summary: TimeAttackSummary | null) => {
    const best = summary?.best ?? null;
    el.replaceChildren(
      h('div', { class: 'daily-head' }, h('p', { class: 'eyebrow' }, `⏱ ${t('timeattack.title')}`), h('span', { class: 'week-left' }, weekLeft())),
      best
        ? h(
            'div',
            { class: 'weekly-best' },
            h('div', { class: 'score-big' }, formatPoints(best.score), h('small', null, t('common.pts'))),
            h(
              'span',
              { class: 'muted' },
              summary!.position !== null && summary!.total > 1
                ? t('weekly.place', { position: summary!.position, total: summary!.total })
                : tn('timeattack.boards', best.boards),
            ),
          )
        : h('h2', null, t('timeattack.card.title', { minutes: TIME_ATTACK_MS / 60_000 })),
      ...(best ? [] : [h('p', { class: 'muted' }, t('timeattack.card.text'))]),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => void openTimeAttack(best?.score ?? null) }, best ? `↺ ${t('timeattack.card.again')}` : t('common.play')),
        h('button', { class: 'btn ghost', onclick: () => void openTimeAttackRanking() }, t('nav.ranking')),
      ),
    );
  };
  render(null);
  return {
    el,
    async load() {
      const week = currentWeek();
      // Sin conexión (y sin nada guardado): se queda la invitación a jugar.
      await cached(
        `timeattack:${week}`,
        () => getTimeAttack(week),
        render,
        () => {},
      );
    },
  };
}
