// Ranking del reto diario por ligas de amigos. Una liga se comparte con un
// enlace (?join=CÓDIGO) o con su código de 6 caracteres.

import * as online from '../services/online';
import { formatDay, formatTime, h, openModal, plural, previousDay, share, toast } from './dom';
import { today } from './daily';
import { ensureName } from './profile';
import { go, type Screen } from './router';

export function rankingScreen(route: { join?: string }): Screen {
  const body = h('div', { class: 'row', style: 'flex-direction: column; gap: 14px' });
  const el = h(
    'div',
    { class: 'screen' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: () => go({ name: 'home' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, 'Ranking'), h('p', null, 'Reto diario con tus amigos')),
    ),
    body,
  );

  if (!online.onlineEnabled) {
    body.append(
      h(
        'section',
        { class: 'card' },
        h('p', { class: 'eyebrow' }, 'Próximamente'),
        h('h2', null, 'El ranking online aún no está activado'),
        h(
          'p',
          { class: 'muted', style: 'margin-top: 8px' },
          'Mientras tanto, termina el reto y pulsa Compartir para mandar tu resultado a tus amigos.',
        ),
      ),
    );
    return { el };
  }

  let leagues: online.League[] = [];
  let selected: string | null = null;
  let day = today();
  let disposed = false;

  async function load() {
    body.replaceChildren(h('p', { class: 'empty' }, 'Cargando…'));
    try {
      if (!(await ensureName())) return go({ name: 'home' });
      if (route.join) {
        const league = await online.joinLeague(route.join);
        selected = league.id;
        toast(`Te has unido a ${league.name}`);
        route = {};
        history.replaceState(null, '', location.pathname);
      }
      leagues = await online.myLeagues();
      selected = leagues.find((l) => l.id === selected)?.id ?? leagues[0]?.id ?? null;
      if (!disposed) render();
    } catch (err) {
      body.replaceChildren(
        h('section', { class: 'card empty' }, h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: load }, 'Reintentar')),
      );
    }
  }

  function render() {
    if (leagues.length === 0) {
      body.replaceChildren(
        h(
          'section',
          { class: 'card empty' },
          h('div', { style: 'font-size: 48px' }, '🏆'),
          h('h2', null, 'Aún no estás en ninguna liga'),
          h('p', { class: 'muted', style: 'margin: 6px 0 14px' }, 'Crea una y comparte el enlace con tus amigos, o únete con su código.'),
          h('button', { class: 'btn big block', onclick: openLeagueForms }, 'Crear o unirse a una liga'),
        ),
      );
      return;
    }

    const league = leagues.find((l) => l.id === selected)!;
    const list = h('ol', { class: 'ranking' }, h('li', { class: 'empty', style: 'display:block' }, 'Cargando…'));
    const isToday = day === today();

    body.replaceChildren(
      h(
        'nav',
        { class: 'tabs' },
        ...leagues.map((l) =>
          h(
            'button',
            {
              class: `tab ${l.id === selected ? 'active' : ''}`,
              onclick: () => {
                selected = l.id;
                render();
              },
            },
            l.name,
          ),
        ),
        h('button', { class: 'tab', 'aria-label': 'Crear o unirse a una liga', onclick: openLeagueForms }, '＋'),
      ),
      h(
        'div',
        { class: 'segmented' },
        h('button', { class: isToday ? 'active' : '', onclick: () => ((day = today()), render()) }, 'Hoy'),
        h('button', { class: isToday ? '' : 'active', onclick: () => ((day = previousDay(today())), render()) }, 'Ayer'),
      ),
      h('p', { class: 'muted', style: 'text-align:center; margin-top:-6px' }, formatDay(day)),
      list,
      h(
        'section',
        { class: 'card invite' },
        h(
          'div',
          { style: 'flex:1' },
          h('p', { class: 'eyebrow' }, `Invita a ${league.name}`),
          h('div', { class: 'code' }, league.code),
          h('small', { class: 'muted' }, plural(league.members ?? 1, 'miembro', 'miembros')),
        ),
        h(
          'button',
          {
            class: 'btn secondary',
            onclick: () =>
              share(`¡Únete a mi liga de Skid "${league.name}" y compite en el reto diario!\n${location.origin}${location.pathname}?join=${league.code}`),
          },
          'Invitar',
        ),
      ),
    );

    void fillRanking(list, league.id, day);
  }

  async function fillRanking(list: HTMLElement, leagueId: string, forDay: string) {
    try {
      const rows = await online.leagueRanking(leagueId, forDay);
      if (disposed || leagueId !== selected || forDay !== day) return;
      list.replaceChildren(
        ...rows.map((row, i) =>
          h(
            'li',
            { class: row.isMe ? 'me' : '' },
            h('span', { class: 'pos' }, row.status === 'finished' ? (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : String(i + 1)) : '·'),
            h(
              'span',
              { class: 'who' },
              h('strong', null, row.name + (row.isMe ? ' (tú)' : '')),
              h(
                'small',
                null,
                row.status === 'finished'
                  ? `${row.moves} mov. · ↺ ${row.retries}${row.hints ? ` · 💡 ${row.hints}` : ''} · ⏱ ${formatTime(row.timeMs ?? 0)}`
                  : row.status === 'playing'
                    ? 'Jugando…'
                    : 'Sin jugar',
              ),
            ),
            row.status === 'finished'
              ? h('span', { class: 'pts' }, String(row.score))
              : h('span', { class: 'pts none' }, '—'),
          ),
        ),
      );
    } catch (err) {
      list.replaceChildren(h('li', { class: 'empty', style: 'display:block' }, (err as Error).message));
    }
  }

  function openLeagueForms() {
    const codeInput = h('input', { class: 'field', placeholder: 'Código (p. ej. 4F9K2A)', maxLength: 6, autocapitalize: 'characters' });
    const nameInput = h('input', { class: 'field', placeholder: 'Nombre de la liga', maxLength: 30 });
    const error = h('p', { class: 'error', hidden: true });

    const run = async (button: HTMLButtonElement, action: () => Promise<online.League>) => {
      button.disabled = true;
      error.hidden = true;
      try {
        const league = await action();
        selected = league.id;
        modal.close();
        await load();
      } catch (err) {
        error.textContent = (err as Error).message;
        error.hidden = false;
        button.disabled = false;
      }
    };

    const joinBtn: HTMLButtonElement = h('button', { class: 'btn secondary', type: 'submit' }, 'Unirme');
    const createBtn: HTMLButtonElement = h('button', { class: 'btn', type: 'submit' }, 'Crear');

    const modal = openModal(
      [
        h('h2', null, 'Ligas'),
        h('p', { class: 'eyebrow' }, 'Unirse con un código'),
        h(
          'form',
          {
            class: 'row',
            onsubmit: (e: Event) => {
              e.preventDefault();
              if (codeInput.value.trim()) void run(joinBtn, () => online.joinLeague(codeInput.value));
            },
          },
          codeInput,
          joinBtn,
        ),
        h('p', { class: 'eyebrow' }, 'Crear una liga nueva'),
        h(
          'form',
          {
            class: 'row',
            onsubmit: (e: Event) => {
              e.preventDefault();
              if (nameInput.value.trim().length >= 2) void run(createBtn, () => online.createLeague(nameInput.value));
            },
          },
          nameInput,
          createBtn,
        ),
        error,
        h('button', { class: 'link-btn', onclick: () => modal.close() }, 'Cerrar'),
      ],
      { dismissable: true },
    );
  }

  return {
    el,
    mount() {
      void load();
    },
    dispose() {
      disposed = true;
    },
  };
}
