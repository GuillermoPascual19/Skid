// "Cómo se juega": guía de pocas páginas con las reglas de cada modo. Se abre
// sola la primera vez que se juega y siempre desde la portada (y desde el reto).

import { penguinSvg } from '../../../../common/art/hats';
import { elementSvg } from '../../../../common/art/elements';
import { ELEMENTS } from '../../../../common/logic/engine/elements';
import { GOLF } from '../../../../common/logic/daily/score';
import { FREEZE_EVERY, MAX_FREEZES } from '../../../../common/logic/daily/streaks';
import * as online from '../../shared/api';
import { h, openModal, starSvg, svg } from '../../shared/dom';
import { read, write } from '../../shared/storage';
import { t, tn } from '../../i18n/i18n';

/** Sube cuando cambian las reglas o hay algo nuevo (ver NEWS): quien ya jugaba ve el aviso. */
export const GUIDE_VERSION = 6;
const GUIDE_SEEN_KEY = 'skid.guide.v1';

export type GuidePage = 'slide' | 'pieces' | 'free' | 'daily' | 'weekly' | 'duels' | 'leagues' | 'elements' | 'community';

/** Aviso de la portada para quien ya jugaba: lo último que ha cambiado (sube GUIDE_VERSION al cambiarlo). */
export const NEWS = {
  icon: '🧊',
  // El título y el texto están en los diccionarios: news.title y news.text.
  page: 'daily' as GuidePage,
};

interface Page {
  readonly id: GuidePage;
  body(): HTMLElement[];
}

const pageTitle = (id: GuidePage) => t(`guide.${id}.title`);

const rules = (...items: [string, string][]) =>
  h('ul', { class: 'rules' }, ...items.map(([icon, text]) => h('li', null, h('b', null, icon), h('span', null, text))));

type DemoCell = 'ice' | 'wall' | { coin: number; collect?: boolean };

/** Fila de casillas de hielo con el pingüino deslizando (animado con CSS) de `at` a `slideTo`. */
function demoRow(cells: DemoCell[], penguin: { at: number; slideTo?: number }): HTMLElement {
  const row = h('div', { class: 'guide-demo', style: `--cols:${cells.length}` });
  for (const c of cells) {
    row.append(
      typeof c === 'object'
        ? h('span', { class: 'cell ice' }, h('span', { class: `coin${c.coin === 1 ? ' next' : ''}${c.collect ? ' collect' : ''}` }, String(c.coin)))
        : h('span', { class: `cell ${c}` }),
    );
  }
  const p = h('span', { class: `guide-penguin${penguin.slideTo !== undefined ? ' sliding' : ''}` }, svg(penguinSvg()));
  p.style.setProperty('--from', String(penguin.at));
  p.style.setProperty('--to', String(penguin.slideTo ?? penguin.at));
  row.append(p);
  return row;
}

const PAGES: Page[] = [
  {
    id: 'slide',
    body: () => [
      demoRow(['ice', 'ice', 'ice', 'ice', 'ice', 'wall'], { at: 0, slideTo: 4 }),
      rules(
        ['🐧', t('guide.slide.r1')],
        ['⌨️', t('guide.slide.r2')],
      ),
    ],
  },
  {
    id: 'pieces',
    body: () => [
      demoRow(['ice', { coin: 1, collect: true }, 'ice', { coin: 2 }, 'ice', { coin: 3 }], { at: 0, slideTo: 2 }),
      rules(
        ['🔢', t('guide.pieces.r1')],
        ['🪙', t('guide.pieces.r2')],
        ['🧊', t('guide.pieces.r3')],
      ),
    ],
  },
  {
    id: 'free',
    body: () => [
      h('div', { class: 'guide-stars' }, starSvg(true), starSvg(true), starSvg(true)),
      rules(
        ['⭐', t('guide.free.r1')],
        ['📈', t('guide.free.r2')],
        ['💡', t('guide.free.r3')],
      ),
    ],
  },
  {
    id: 'elements',
    body: () => [
      h(
        'div',
        { class: 'guide-elements' },
        ...ELEMENTS.map((e) =>
          h(
            'div',
            { class: 'guide-element' },
            h('span', { class: 'icon' }, svg(elementSvg(e.id))),
            h(
              'span',
              null,
              h('strong', null, t(`elements.${e.id}.name`)),
              h('small', null, t('guide.elements.fromLevel', { n: e.level })),
              h('span', null, t(`elements.${e.id}.description`)),
            ),
          ),
        ),
      ),
    ],
  },
  {
    id: 'daily',
    body: () => [
      h(
        'div',
        { class: 'guide-result' },
        h('div', null, h('span', null, t('guide.daily.optimal')), h('strong', null, tn('common.moves', 12))),
        h('div', null, h('span', null, t('guide.daily.doneIn', { n: 12 })), h('strong', { class: 'perfect' }, `${t('common.movesShort', { n: 12 })} 🎯`)),
        h('div', null, h('span', null, t('guide.daily.doneIn', { n: 14 })), h('strong', null, t('common.movesShort', { n: 14 }))),
        h('div', null, h('span', null, t('guide.daily.withHint', { n: 12 })), h('strong', null, t('common.movesShort', { n: 13 }))),
      ),
      rules(
        ['🎯', t('guide.daily.r1')],
        ['↺', t('guide.daily.r2')],
        ['💡', t('guide.daily.r3')],
        ['⏱', t('guide.daily.r4')],
        ['👀', t('guide.daily.r5')],
      ),
    ],
  },
  {
    id: 'weekly',
    body: () => [
      rules(
        ['🗺️', t('guide.weekly.r1')],
        ['↺', t('guide.weekly.r2')],
        ['🚫', t('guide.weekly.r3')],
        ['🏆', t('guide.weekly.r4')],
      ),
    ],
  },
  {
    id: 'duels',
    body: () => [
      rules(
        ['⚔️', t('guide.duels.r1')],
        ['🗺️', t('guide.duels.r2')],
        ['↺', t('guide.duels.r3')],
        ['🙈', t('guide.duels.r4')],
        ['🏆', t('guide.duels.r5')],
      ),
    ],
  },
  {
    id: 'leagues',
    body: () => [
      rules(
        ['🏆', t('guide.leagues.r1')],
        ['📅', t('guide.leagues.r2', { par: GOLF.parPoints, stroke: GOLF.perStroke })],
        ['🎃', t('guide.leagues.r6')],
        ['👏', t('guide.leagues.r7')],
        ['🔥', t('guide.leagues.r3')],
        ['🛡️', t('guide.leagues.r4', { every: FREEZE_EVERY, max: MAX_FREEZES })],
        ['🎩', t('guide.leagues.r5')],
      ),
    ],
  },
  {
    id: 'community',
    body: () => [
      rules(
        ['✏️', t('guide.community.r1')],
        ['✅', t('guide.community.r2')],
        ['⭐', t('guide.community.r3')],
        ['🔗', t('guide.community.r4')],
      ),
    ],
  },
];

/** Las páginas que tienen sentido aquí (sin servidor no hay reto semanal, ligas ni niveles de jugadores). */
function pages(): Page[] {
  return PAGES.filter((p) => online.onlineEnabled || !['weekly', 'duels', 'leagues', 'community'].includes(p.id));
}

/** Abre la guía, en la página indicada. */
export function openGuide(start: GuidePage = 'slide'): void {
  write(GUIDE_SEEN_KEY, GUIDE_VERSION);
  const list = pages();
  let index = Math.max(0, list.findIndex((p) => p.id === start));

  const eyebrow = h('p', { class: 'eyebrow' });
  const title = h('h2');
  const content = h('div', { class: 'guide-page' });
  const dots = h('div', { class: 'guide-dots' }, ...list.map((p, i) => h('button', { 'aria-label': pageTitle(p.id), onclick: () => show(i) })));
  const back = h('button', { class: 'btn ghost', onclick: () => show(index - 1) }, t('guide.back'));
  const next = h('button', { class: 'btn', onclick: () => (index === list.length - 1 ? modal.close() : show(index + 1)) });

  function show(i: number) {
    index = Math.min(list.length - 1, Math.max(0, i));
    const page = list[index];
    eyebrow.textContent = t('guide.eyebrow', { n: index + 1, total: list.length });
    title.textContent = pageTitle(page.id);
    content.replaceChildren(...page.body());
    [...dots.children].forEach((d, j) => d.classList.toggle('on', j === index));
    back.disabled = index === 0;
    next.textContent = index === list.length - 1 ? t('guide.letsPlay') : t('free.next');
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') show(index + 1);
    if (e.key === 'ArrowLeft') show(index - 1);
  };
  document.addEventListener('keydown', onKey);
  const modal = openModal([eyebrow, title, content, dots, h('div', { class: 'row' }, back, next)], {
    dismissable: true,
    onClose: () => document.removeEventListener('keydown', onKey),
  });
  modal.el.classList.add('guide');
  show(index);
}

/** Qué hacer al entrar en la portada: guía completa la primera vez, aviso si hay reglas nuevas. */
export function guideStatus(isNewPlayer: boolean): 'first' | 'news' | 'seen' {
  const seen = read<number>(GUIDE_SEEN_KEY);
  if (seen === null) return isNewPlayer ? 'first' : 'news';
  return seen < GUIDE_VERSION ? 'news' : 'seen';
}

/** Marca la guía como vista sin abrirla (al cerrar el aviso de novedades). */
export function dismissGuideNews(): void {
  write(GUIDE_SEEN_KEY, GUIDE_VERSION);
}
