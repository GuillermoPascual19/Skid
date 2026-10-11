// Multijugador: niveles creados por los jugadores. Listado (mejor valorados,
// nuevos y los tuyos), acceso al editor y a jugar cada nivel.

import { elementSvg } from '../art/elements';
import { penguinSvg } from '../art/hats';
import { ELEMENTS } from '../core/elements';
import * as online from '../services/online';
import { loadEditorDraft } from '../services/storage';
import { boardThumb } from './board-art';
import { h, openModal, plural, svg, toast } from './dom';
import { go, type Screen } from './router';

const TABS: { id: online.CustomLevelSort; label: string }[] = [
  { id: 'top', label: 'Mejor valorados' },
  { id: 'new', label: 'Nuevos' },
  { id: 'mine', label: 'Mis niveles' },
];

/** Pestaña que se estaba viendo (dura mientras la página esté abierta). */
let lastTab: online.CustomLevelSort = 'top';

export function communityScreen(tab?: online.CustomLevelSort): Screen {
  let current = tab ?? lastTab;
  let levels: online.CustomLevel[] = [];
  let more = false;
  let loading = false;
  let disposed = false;

  const tabs = h('div', { class: 'segmented', role: 'tablist' });
  const list = h('div', { class: 'level-list' });
  const moreBtn = h('button', { class: 'btn secondary block', hidden: true, onclick: () => void load(true) }, 'Ver más');
  const draft = loadEditorDraft();

  const el = h(
    'div',
    { class: 'screen community' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: () => go({ name: 'home' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, 'Multijugador'), h('p', null, 'Niveles creados por los jugadores')),
    ),
    h(
      'section',
      { class: 'card create-card' },
      h(
        'div',
        { class: 'info' },
        h('h2', null, 'Crea tu nivel'),
        h('p', { class: 'muted' }, draft ? 'Tienes un nivel a medio hacer.' : 'Diséñalo, supéralo y publícalo para que lo jueguen todos.'),
      ),
      h('button', { class: 'btn', onclick: () => go({ name: 'editor' }) }, draft ? 'Seguir' : 'Crear nivel'),
    ),
    tabs,
    list,
    moreBtn,
  );

  function renderTabs() {
    tabs.replaceChildren(
      ...TABS.map((t) =>
        h(
          'button',
          {
            class: t.id === current ? 'active' : '',
            role: 'tab',
            'aria-selected': String(t.id === current),
            onclick: () => {
              if (t.id === current) return;
              current = lastTab = t.id;
              renderTabs();
              void load(false);
            },
          },
          t.label,
        ),
      ),
    );
  }

  async function load(append: boolean) {
    if (loading) return;
    loading = true;
    const tabAtStart = current;
    if (!append) list.replaceChildren(h('p', { class: 'empty' }, 'Cargando…'));
    try {
      const page = await online.listCustomLevels(current, append ? levels.length : 0);
      if (disposed || tabAtStart !== current) return;
      levels = append ? [...levels, ...page.levels] : page.levels;
      more = page.more;
      renderList();
    } catch (err) {
      list.replaceChildren(
        h('section', { class: 'card empty' }, h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: () => void load(false) }, 'Reintentar')),
      );
    } finally {
      loading = false;
    }
  }

  function renderList() {
    moreBtn.hidden = !more;
    if (levels.length === 0) {
      list.replaceChildren(
        h('p', { class: 'empty' }, current === 'mine' ? 'Aún no has publicado ningún nivel. ¡Crea el primero!' : 'Todavía no hay niveles. ¡Sé el primero en crear uno!'),
      );
      return;
    }
    list.replaceChildren(...levels.map(levelCard));
  }

  function levelCard(level: online.CustomLevel): HTMLElement {
    const rating = level.rating === null ? 'Sin valorar' : `★ ${level.rating.toFixed(1)} (${level.ratingCount})`;
    const icons = ELEMENTS.filter((e) => level.elements.includes(e.id)).map((e) => h('span', { class: 'mini-element', title: e.name }, svg(elementSvg(e.id))));
    return h(
      'article',
      { class: `card level-card ${level.myBest !== null && !level.mine ? 'done' : ''}` },
      h(
        'button',
        { class: 'level-open', 'aria-label': `Jugar ${level.name}`, onclick: () => go({ name: 'custom', level }) },
        h('div', { class: 'level-thumb' }, svg(boardThumb(level.rows))),
        h(
          'div',
          { class: 'level-info' },
          h('strong', { class: 'level-name' }, level.name),
          h('span', { class: 'level-author' }, h('span', { class: 'mini-penguin' }, svg(penguinSvg(level.authorHat))), level.mine ? 'Tú' : level.author),
          h(
            'span',
            { class: 'level-meta' },
            h('span', { class: level.rating === null ? 'muted' : 'rating' }, rating),
            h('span', null, `Óptimo ${level.optimal}`),
            h('span', null, plural(level.plays, 'jugador', 'jugadores')),
            ...icons,
          ),
        ),
        level.mine ? null : level.myBest !== null ? h('span', { class: 'done-badge', title: `Tu mejor marca: ${level.myBest}` }, '✓') : null,
      ),
      level.mine ? h('button', { class: 'link-btn danger', onclick: () => confirmDelete(level) }, 'Borrar') : null,
    );
  }

  function confirmDelete(level: online.CustomLevel) {
    const modal = openModal(
      [
        h('h2', null, '¿Borrar el nivel?'),
        h('p', { class: 'lead' }, `"${level.name}" desaparecerá para todos, con sus valoraciones.`),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => modal.close() }, 'Cancelar'),
          h(
            'button',
            {
              class: 'btn',
              onclick: async () => {
                modal.close();
                try {
                  await online.deleteCustomLevel(level.id);
                  levels = levels.filter((l) => l.id !== level.id);
                  renderList();
                  toast('Nivel borrado');
                } catch (err) {
                  toast((err as Error).message);
                }
              },
            },
            'Borrar',
          ),
        ),
      ],
      { dismissable: true },
    );
  }

  return {
    el,
    mount() {
      renderTabs();
      if (!online.onlineEnabled) {
        list.replaceChildren(h('section', { class: 'card empty' }, 'El multijugador necesita el ranking online.'));
        return;
      }
      void load(false);
    },
    dispose() {
      disposed = true;
    },
  };
}
