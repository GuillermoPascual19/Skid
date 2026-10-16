// Ranking global: todos los jugadores por los puntos del reto diario, este mes
// o desde siempre. Quien no quiera salir se oculta desde la pestaña Tú.

import * as online from '../../shared/api';
import { penguinSvg, type HatId } from '../../../../common/art/hats';
import { h, svg, toast } from '../../shared/dom';
import { recall, remember } from '../../shared/cache';
import { go, type Screen } from '../../shared/router';
import { askName } from '../profile/profile';
import type { Me } from '../profile/api';
import { type GlobalEntry, type GlobalPeriod, type GlobalRanking, globalRanking, setGlobalVisible } from './api';
import { intlLocale, t, tn } from '../../i18n/i18n';

/** Pestaña que se estaba viendo (dura mientras la página esté abierta). */
let remembered: GlobalPeriod = 'month';

const medal = (position: number) => ['🥇', '🥈', '🥉'][position - 1] ?? String(position);
const avatar = (hat: HatId | null) => h('span', { class: 'avatar' }, svg(penguinSvg(hat)));

function row(entry: GlobalEntry): HTMLElement {
  return h(
    'li',
    { class: `rank-row ${entry.isMe ? 'me' : ''}` },
    h('span', { class: 'pos' }, medal(entry.position)),
    avatar(entry.hat),
    h(
      'span',
      { class: 'who' },
      h('strong', null, entry.isMe ? t('ranking.me', { name: entry.name }) : entry.name),
      h('small', null, `${tn('ranking.challenges', entry.days)} · ${t('ranking.bestN', { n: entry.best })}`),
    ),
    h('span', { class: 'pts' }, String(entry.points)),
  );
}

export function globalScreen(): Screen {
  const body = h('div', { class: 'row', style: 'flex-direction: column; gap: 14px' });
  const el = h(
    'div',
    { class: 'screen' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': t('common.back'), onclick: () => go({ name: 'friends' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, t('global.title')), h('p', null, t('global.subtitle'))),
    ),
    body,
  );

  if (!online.onlineEnabled) {
    body.append(h('section', { class: 'card empty' }, t('friends.needsOnline')));
    return { el };
  }

  let period = remembered;
  /** Cada consulta lleva su número: si el jugador cambia de pestaña, se descarta la respuesta vieja. */
  let requestId = 0;
  let disposed = false;

  function render() {
    remembered = period;
    const list = h('ol', { class: 'ranking global-ranking' }, h('li', { class: 'empty' }, t('common.loading')));
    const note = h('div');
    const caption = h('p', { class: 'muted', style: 'text-align:center; margin-top:-6px' });
    body.replaceChildren(
      h(
        'div',
        { class: 'segmented' },
        ...(
          [
            ['month', t('global.month')],
            ['all', t('global.all')],
          ] as const
        ).map(([p, label]) => h('button', { class: p === period ? 'active' : '', onclick: () => ((period = p), render()) }, label)),
      ),
      caption,
      note,
      list,
    );
    void fill(list, caption, note);
  }

  async function fill(list: HTMLElement, caption: HTMLElement, note: HTMLElement) {
    const id = ++requestId;
    try {
      const ranking = await globalRanking(period);
      if (disposed || id !== requestId) return;
      caption.textContent = describe(ranking);
      note.replaceChildren(...visibilityNote(ranking));
      const rows = ranking.top.map(row);
      // Si no estás entre los mejores, tu puesto va al final, separado.
      if (ranking.me) rows.push(h('li', { class: 'gap', 'aria-hidden': 'true' }, '⋯'), row(ranking.me));
      list.replaceChildren(...(rows.length ? rows : [h('li', { class: 'empty' }, t('global.empty'))]));
    } catch (err) {
      if (id === requestId) list.replaceChildren(h('li', { class: 'empty' }, (err as Error).message));
    }
  }

  /** «Octubre de 2026 · 120 jugadores» o «Desde el principio · 120 jugadores». */
  function describe(ranking: GlobalRanking): string {
    const when =
      ranking.period === 'month'
        ? new Intl.DateTimeFormat(intlLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ranking.from}T12:00:00Z`))
        : t('global.allTime');
    const capitalized = when.charAt(0).toLocaleUpperCase(intlLocale()) + when.slice(1);
    return ranking.total ? `${capitalized} · ${tn('global.players', ranking.total)}` : capitalized;
  }

  /** Por qué no sales (sin nombre u oculto) y cómo arreglarlo. */
  function visibilityNote(ranking: GlobalRanking): HTMLElement[] {
    if (!ranking.named) {
      return [
        h(
          'section',
          { class: 'card global-note' },
          h('p', { class: 'muted' }, t('global.noName')),
          h('button', { class: 'btn small', onclick: async () => (await askName()) && render() }, t('global.pickName')),
        ),
      ];
    }
    if (!ranking.hidden) return [];
    const show = h('button', { class: 'btn small' }, t('global.show'));
    show.addEventListener('click', async () => {
      show.disabled = true;
      try {
        await setGlobalVisible(true);
        const me = recall<Me>('me');
        if (me) remember('me', { ...me, globalRanking: true });
        render();
      } catch (err) {
        show.disabled = false;
        toast((err as Error).message);
      }
    });
    return [h('section', { class: 'card global-note' }, h('p', { class: 'muted' }, t('global.hidden')), show)];
  }

  return {
    el,
    mount: render,
    dispose: () => {
      disposed = true;
    },
  };
}
