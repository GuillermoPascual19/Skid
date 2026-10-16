// Multijugador: niveles creados por los jugadores. Listado (mejor valorados,
// nuevos y los tuyos), acceso al editor y a jugar cada nivel.

import { elementSvg } from '../../../../common/art/elements';
import { penguinSvg } from '../../../../common/art/hats';
import { ELEMENTS } from '../../../../common/logic/engine/elements';
import * as online from '../../shared/api';
import { boardThumb } from './board-art';
import { h, openModal, share, svg, toast } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import { type CustomLevel, type CustomLevelSort, type ReportReason, deleteCustomLevel, getCustomLevel, listCustomLevels, reportCustomLevel } from './api';
import { loadEditorDraft } from './storage';
import { openLevelRanking } from './level-ranking';
import { playerName, t, tn } from '../../i18n/i18n';

const TABS: { id: CustomLevelSort }[] = [
  { id: 'top' },
  { id: 'new' },
  { id: 'mine' },
];

/** Pestaña que se estaba viendo (dura mientras la página esté abierta). */
let lastTab: CustomLevelSort = 'top';

/** Enlace que abre directamente un nivel (ver main.ts). */
export function levelLink(level: CustomLevel): string {
  return `${location.origin}${location.pathname}?nivel=${encodeURIComponent(level.id)}`;
}

/** Comparte un nivel (menú de compartir del móvil, o copiar el enlace). */
export function shareLevel(level: CustomLevel): void {
  const text = `🐧 ${level.mine ? t('levels.share.mine', { name: level.name }) : t('levels.share.theirs', { name: level.name, author: playerName(level.author) })}`;
  void share(`${text}\n${levelLink(level)}`);
}

const REPORT_REASONS: { id: ReportReason }[] = [
  { id: 'name' },
  { id: 'broken' },
  { id: 'other' },
];

/** Pide el motivo y denuncia el nivel. Se resuelve a true si se envió. */
export function reportLevel(level: CustomLevel): Promise<boolean> {
  return new Promise((resolve) => {
    let sent = false;
    const modal = openModal(
      [
        h('h2', null, t('levels.report.title')),
        h('p', { class: 'lead' }, t('levels.report.question')),
        ...REPORT_REASONS.map((r) =>
          h(
            'button',
            {
              class: 'btn secondary block',
              onclick: async () => {
                try {
                  await reportCustomLevel(level.id, r.id);
                  sent = true;
                  modal.close();
                  toast(t('levels.report.thanks'));
                } catch (err) {
                  toast((err as Error).message);
                }
              },
            },
            t(`levels.report.reasons.${r.id}`),
          ),
        ),
        h('button', { class: 'link-btn', onclick: () => modal.close() }, t('common.cancel')),
      ],
      { dismissable: true, onClose: () => resolve(sent) },
    );
  });
}

/**
 * `open`: id de un nivel que abrir nada más entrar (enlace compartido).
 */
export function communityScreen(tab?: CustomLevelSort, open?: string): Screen {
  let current = tab ?? lastTab;
  let levels: CustomLevel[] = [];
  let more = false;
  let loading = false;
  let disposed = false;

  const tabs = h('div', { class: 'segmented', role: 'tablist' });
  const list = h('div', { class: 'level-list' });
  const moreBtn = h('button', { class: 'btn secondary block', hidden: true, onclick: () => void load(true) }, t('levels.list.more'));
  const draft = loadEditorDraft();

  const el = h(
    'div',
    { class: 'screen community' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': t('common.back'), onclick: () => go({ name: 'play' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, t('home.community.eyebrow')), h('p', null, t('levels.list.subtitle'))),
    ),
    h(
      'section',
      { class: 'card create-card' },
      h(
        'div',
        { class: 'info' },
        h('h2', null, t('levels.create.title')),
        h('p', { class: 'muted' }, draft ? t('levels.create.draft') : t('levels.create.text')),
      ),
      h('button', { class: 'btn', onclick: () => go({ name: 'editor' }) }, draft ? t('duels.screen.resume') : t('levels.create.button')),
    ),
    tabs,
    list,
    moreBtn,
  );

  function renderTabs() {
    tabs.replaceChildren(
      ...TABS.map((tab) =>
        h(
          'button',
          {
            class: tab.id === current ? 'active' : '',
            role: 'tab',
            'aria-selected': String(tab.id === current),
            onclick: () => {
              if (tab.id === current) return;
              current = lastTab = tab.id;
              renderTabs();
              void load(false);
            },
          },
          t(`levels.tabs.${tab.id}`),
        ),
      ),
    );
  }

  async function load(append: boolean) {
    if (loading) return;
    loading = true;
    const tabAtStart = current;
    if (!append) list.replaceChildren(h('p', { class: 'empty' }, t('common.loading')));
    try {
      const page = await listCustomLevels(current, append ? levels.length : 0);
      if (disposed || tabAtStart !== current) return;
      levels = append ? [...levels, ...page.levels] : page.levels;
      more = page.more;
      renderList();
    } catch (err) {
      list.replaceChildren(
        h('section', { class: 'card empty' }, h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: () => void load(false) }, t('common.retry'))),
      );
    } finally {
      loading = false;
    }
  }

  function renderList() {
    moreBtn.hidden = !more;
    if (levels.length === 0) {
      list.replaceChildren(
        h('p', { class: 'empty' }, current === 'mine' ? t('levels.list.emptyMine') : t('levels.list.empty')),
      );
      return;
    }
    list.replaceChildren(...levels.map(levelCard));
  }

  function levelCard(level: CustomLevel): HTMLElement {
    const rating = level.rating === null ? t('levels.card.unrated') : `★ ${level.rating.toFixed(1)} (${level.ratingCount})`;
    const icons = ELEMENTS.filter((e) => level.elements.includes(e.id)).map((e) => h('span', { class: 'mini-element', title: t(`elements.${e.id}.name`) }, svg(elementSvg(e.id))));
    return h(
      'article',
      { class: `card level-card ${level.myBest !== null && !level.mine ? 'done' : ''}` },
      h(
        'button',
        { class: 'level-open', 'aria-label': t('levels.card.play', { name: level.name }), onclick: () => go({ name: 'custom', level }) },
        h('div', { class: 'level-thumb' }, svg(boardThumb(level.rows))),
        h(
          'div',
          { class: 'level-info' },
          h('strong', { class: 'level-name' }, level.name),
          h('span', { class: 'level-author' }, h('span', { class: 'mini-penguin' }, svg(penguinSvg(level.authorHat))), level.mine ? t('ghost.you') : playerName(level.author)),
          h(
            'span',
            { class: 'level-meta' },
            h('span', { class: level.rating === null ? 'muted' : 'rating' }, rating),
            h('span', null, `${t('stats.optimal')} ${level.optimal}`),
            h('span', null, tn('levels.card.players', level.plays)),
            ...icons,
          ),
        ),
        level.mine ? null : level.myBest !== null ? h('span', { class: 'done-badge', title: t('levels.card.yourBest', { n: level.myBest }) }, '✓') : null,
      ),
      level.hidden ? h('p', { class: 'hidden-note' }, `🚫 ${t('levels.card.hidden')}`) : null,
      h(
        'div',
        { class: 'level-actions' },
        h('button', { class: 'link-btn', onclick: () => void openLevelRanking(level.id, level.name) }, `🏆 ${t('nav.ranking')}`),
        h('button', { class: 'link-btn', onclick: () => shareLevel(level) }, t('common.share')),
        level.mine
          ? h('button', { class: 'link-btn danger', onclick: () => confirmDelete(level) }, t('levels.card.delete'))
          : level.reported
            ? h('span', { class: 'muted reported' }, t('levels.card.reported'))
            : h(
                'button',
                {
                  class: 'link-btn danger',
                  onclick: async () => {
                    if (!(await reportLevel(level))) return;
                    levels = levels.filter((l) => l.id !== level.id); // Ya no te lo enseñamos.
                    renderList();
                  },
                },
                t('levels.card.report'),
              ),
      ),
    );
  }

  function confirmDelete(level: CustomLevel) {
    const modal = openModal(
      [
        h('h2', null, t('levels.delete.title')),
        h('p', { class: 'lead' }, t('levels.delete.text', { name: level.name })),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => modal.close() }, t('common.cancel')),
          h(
            'button',
            {
              class: 'btn',
              onclick: async () => {
                modal.close();
                try {
                  await deleteCustomLevel(level.id);
                  levels = levels.filter((l) => l.id !== level.id);
                  renderList();
                  toast(t('levels.delete.done'));
                } catch (err) {
                  toast((err as Error).message);
                }
              },
            },
            t('levels.card.delete'),
          ),
        ),
      ],
      { dismissable: true },
    );
  }

  /** Abre el nivel de un enlace compartido. */
  async function openShared(id: string) {
    try {
      const level = await getCustomLevel(id);
      if (!disposed) go({ name: 'custom', level });
    } catch (err) {
      toast((err as Error).message);
    }
  }

  return {
    el,
    mount() {
      renderTabs();
      if (!online.onlineEnabled) {
        list.replaceChildren(h('section', { class: 'card empty' }, t('levels.list.needsOnline')));
        return;
      }
      void load(false);
      if (open) void openShared(open);
    },
    dispose() {
      disposed = true;
    },
  };
}
