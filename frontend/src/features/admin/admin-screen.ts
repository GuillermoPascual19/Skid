// Panel de administración: cifras, niveles denunciados, cualquier nivel y nombres
// de jugadores. Solo lo ve quien tiene acceso (el servidor lo comprueba en cada
// llamada). Los textos van en español y sin diccionario: es una herramienta
// interna que no ven los jugadores.

import { boardThumb } from '../community/board-art';
import { h, openModal, svg, toast } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import {
  type AdminLevel,
  type AdminPlayer,
  clearLevelReports,
  deleteAdminLevel,
  getAdminLevels,
  getAdminPlayers,
  getAdminSummary,
  resetPlayerName,
} from './api';

type Tab = 'summary' | 'reported' | 'levels' | 'players';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'summary', label: 'Resumen' },
  { id: 'reported', label: 'Denunciados' },
  { id: 'levels', label: 'Niveles' },
  { id: 'players', label: 'Jugadores' },
];

const REASONS: Record<string, string> = { name: 'nombre ofensivo', broken: 'no se puede jugar', other: 'otro motivo' };

/** Fecha corta: «15 oct 2026». */
function shortDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function adminScreen(): Screen {
  const tabs = h('div', { class: 'segmented', role: 'tablist' });
  const search = h('input', { class: 'field', type: 'search', placeholder: 'Buscar por nombre…', 'aria-label': 'Buscar', maxLength: 40 });
  const searchRow = h('form', { class: 'admin-search', hidden: true }, search, h('button', { class: 'btn small', type: 'submit' }, 'Buscar'));
  const body = h('div', { class: 'admin-body' });
  const el = h(
    'div',
    { class: 'screen' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: () => go({ name: 'me' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, 'Administración'), h('p', null, 'Moderación y cifras de Skid')),
    ),
    tabs,
    searchRow,
    body,
  );

  let current: Tab = 'summary';
  let levels: AdminLevel[] = [];
  let more = false;
  let request = 0;
  let disposed = false;

  searchRow.addEventListener('submit', (e) => {
    e.preventDefault();
    void load();
  });

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
              current = tab.id;
              search.value = '';
              renderTabs();
              void load();
            },
          },
          tab.label,
        ),
      ),
    );
    searchRow.hidden = current === 'summary' || current === 'reported';
  }

  /** Carga la pestaña actual; `append` añade la página siguiente de niveles. */
  async function load(append = false) {
    const id = ++request;
    if (!append) body.replaceChildren(h('p', { class: 'empty' }, 'Cargando…'));
    try {
      if (current === 'summary') {
        const s = await getAdminSummary();
        if (stale(id)) return;
        body.replaceChildren(summary(s));
      } else if (current === 'players') {
        const { players } = await getAdminPlayers(search.value.trim());
        if (stale(id)) return;
        body.replaceChildren(...(players.length ? players.map(playerCard) : [h('p', { class: 'empty' }, 'No hay jugadores con ese nombre.')]));
      } else {
        const page = await getAdminLevels(current === 'reported' ? 'reported' : 'all', search.value.trim(), append ? levels.length : 0);
        if (stale(id)) return;
        levels = append ? [...levels, ...page.levels] : page.levels;
        more = page.more;
        renderLevels();
      }
    } catch (err) {
      if (stale(id)) return;
      body.replaceChildren(
        h('section', { class: 'card empty' }, h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: () => void load() }, 'Reintentar')),
      );
    }
  }

  const stale = (id: number) => disposed || id !== request;

  function summary(s: Awaited<ReturnType<typeof getAdminSummary>>): HTMLElement {
    const stat = (label: string, value: number, warn = false) => h('div', { class: `stat ${warn && value > 0 ? 'warn' : ''}` }, h('span', null, label), h('strong', null, String(value)));
    return h(
      'div',
      { class: 'admin-grid' },
      stat('Jugadores', s.players.total),
      stat('Con nombre', s.players.named),
      stat('Con Google', s.players.google),
      stat('Nuevos (24 h)', s.players.newToday),
      stat(`Retos de hoy`, s.daily.finished),
      stat('Duelos (7 días)', s.duelsLastWeek),
      stat('Niveles', s.levels.total),
      stat('Denunciados', s.levels.reported, true),
      stat('Ocultos', s.levels.hidden, true),
      stat('Con notificaciones', s.pushPlayers),
    );
  }

  function renderLevels() {
    if (levels.length === 0) {
      body.replaceChildren(h('p', { class: 'empty' }, current === 'reported' ? 'No hay niveles denunciados. 🎉' : 'No hay niveles con ese nombre.'));
      return;
    }
    body.replaceChildren(
      ...levels.map(levelCard),
      ...(more ? [h('button', { class: 'btn secondary block', onclick: () => void load(true) }, 'Cargar más')] : []),
    );
  }

  function levelCard(level: AdminLevel): HTMLElement {
    const reasons = Object.entries(level.reasons).map(([reason, n]) => `${REASONS[reason] ?? reason} × ${n}`);
    return h(
      'article',
      { class: 'card level-card' },
      h(
        'div',
        { class: 'level-open' },
        h('div', { class: 'level-thumb' }, svg(boardThumb(level.rows))),
        h(
          'div',
          { class: 'level-info' },
          h('strong', { class: 'level-name' }, level.name),
          h('span', { class: 'level-author' }, `de ${level.author ?? '(sin nombre)'}`),
          h(
            'span',
            { class: 'level-meta' },
            h('span', null, shortDate(new Date(level.createdAt))),
            h('span', null, `óptimo ${level.optimal}`),
            h('span', null, `${level.plays} lo han jugado`),
          ),
        ),
      ),
      level.reports > 0 ? h('p', { class: 'hidden-note' }, `${level.hidden ? '🚫 Oculto · ' : '⚠️ '}${level.reports} ${level.reports === 1 ? 'denuncia' : 'denuncias'}: ${reasons.join(', ')}`) : null,
      h(
        'div',
        { class: 'level-actions' },
        level.reports > 0 ? h('button', { class: 'link-btn', onclick: () => confirmClear(level) }, '✓ Quitar denuncias') : null,
        h('button', { class: 'link-btn danger', onclick: () => confirmDelete(level) }, '🗑 Borrar nivel'),
      ),
    );
  }

  function playerCard(player: AdminPlayer): HTMLElement {
    const facts = [
      `desde ${shortDate(`${player.createdAt.replace(' ', 'T')}Z`)}`,
      player.google ? 'con Google' : 'anónimo',
      `${player.levels} niveles`,
      player.lastDaily ? `último reto ${shortDate(`${player.lastDaily}T12:00:00Z`)}` : 'sin retos',
    ];
    return h(
      'article',
      { class: 'card admin-player' },
      h('div', null, h('strong', null, player.name ?? '(sin nombre)'), h('span', { class: 'muted' }, facts.join(' · '))),
      player.name ? h('button', { class: 'btn small secondary', onclick: () => confirmResetName(player) }, 'Quitar nombre') : null,
    );
  }

  /** Diálogo de confirmación con un botón para hacerlo. */
  function confirm(title: string, text: string, button: string, action: () => Promise<void>, done: string) {
    const modal = openModal([
      h('h2', null, title),
      h('p', { class: 'lead' }, text),
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
                await action();
                toast(done);
                await load();
              } catch (err) {
                toast((err as Error).message);
              }
            },
          },
          button,
        ),
      ),
    ]);
  }

  function confirmDelete(level: AdminLevel) {
    confirm(
      `¿Borrar «${level.name}»?`,
      'Se borra para siempre, con sus partidas, valoraciones y denuncias.',
      'Borrar',
      () => deleteAdminLevel(level.id),
      'Nivel borrado',
    );
  }

  function confirmClear(level: AdminLevel) {
    confirm(
      `¿Quitar las denuncias de «${level.name}»?`,
      level.hidden ? 'Volverá a verse en la lista de niveles.' : 'El nivel se queda como está, sin denuncias.',
      'Quitar denuncias',
      () => clearLevelReports(level.id),
      'Denuncias quitadas',
    );
  }

  function confirmResetName(player: AdminPlayer) {
    confirm(
      `¿Quitar el nombre «${player.name}»?`,
      'El jugador deja de salir con ese nombre y tendrá que elegir otro la próxima vez que lo necesite. Su cuenta y sus partidas no se tocan.',
      'Quitar nombre',
      () => resetPlayerName(player.id),
      'Nombre quitado',
    );
  }

  renderTabs();
  return {
    el,
    mount: () => void load(),
    dispose: () => {
      disposed = true;
    },
  };
}
