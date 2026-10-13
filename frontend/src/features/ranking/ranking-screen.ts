// Ranking del reto diario por ligas de amigos. Una liga se comparte con un
// enlace (?join=CÓDIGO) o con su código de 6 caracteres.

import * as online from '../../shared/api';
import { penguinSvg } from '../../../../common/art/hats';
import { formatDay, formatTime, h, openModal, plural, previousDay, share, svg, toast } from '../../shared/dom';
import { monthRange, weekRange, type DayRange } from '../../../../common/logic/daily/daily';
import { golfLabel } from '../../../../common/logic/daily/score';
import { today } from '../daily/daily';
import { ensureName } from '../profile/profile';
import { go, type Screen } from '../../shared/router';
import { type League, type RankingRow, createLeague, joinLeague, leagueInvite, leagueRanking, leagueStandings, leaveLeague, myLeagues } from './api';

type Period = 'today' | 'yesterday' | 'week' | 'month';

/** Liga y pestaña que se estaban viendo (dura mientras la página esté abierta). */
const remembered: { selected: string | null; period: Period } = { selected: null, period: 'today' };

/** Fila del ranking que abre el perfil de ese jugador (con el dedo o con el teclado). */
function rowProps(row: { id: string; name: string; isMe: boolean }) {
  const open = () => go({ name: 'player', id: row.id });
  return {
    class: `rank-row ${row.isMe ? 'me' : ''}`,
    role: 'button',
    tabIndex: 0,
    'aria-label': `Ver el perfil de ${row.name}`,
    onclick: open,
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    },
  };
}

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

  const PERIODS: [Period, string][] = [
    ['today', 'Hoy'],
    ['yesterday', 'Ayer'],
    ['week', 'Semana'],
    ['month', 'Mes'],
  ];

  let leagues: League[] = [];
  // Al volver del perfil de un amigo se sigue en la misma liga y pestaña.
  let selected: string | null = remembered.selected;
  let period: Period = remembered.period;
  /** Cada consulta lleva su número: si el jugador cambia de pestaña, se descarta la respuesta vieja. */
  let requestId = 0;
  let disposed = false;

  async function load() {
    body.replaceChildren(h('p', { class: 'empty' }, 'Cargando…'));
    try {
      if (!(await ensureName())) return go({ name: 'home' });
      if (route.join) {
        // Un enlace de invitación no te une solo: primero ves a qué liga y decides.
        const code = route.join;
        route = {};
        history.replaceState(null, '', location.pathname);
        const joined = await confirmInvite(code);
        if (joined) {
          selected = joined.id;
          toast(`Te has unido a ${joined.name}`);
        }
      }
      leagues = await myLeagues();
      selected = leagues.find((l) => l.id === selected)?.id ?? leagues[0]?.id ?? null;
      if (!disposed) render();
    } catch (err) {
      body.replaceChildren(
        h('section', { class: 'card empty' }, h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: load }, 'Reintentar')),
      );
    }
  }

  /** Enseña la liga de un enlace de invitación y une al jugador solo si acepta. */
  async function confirmInvite(code: string): Promise<League | null> {
    const invite = await leagueInvite(code);
    if (invite.alreadyMember) return null;
    return new Promise((resolve) => {
      let joined: League | null = null;
      const accept = h('button', { class: 'btn' }, 'Unirme');
      const error = h('p', { class: 'error', hidden: true });
      const modal = openModal(
        [
          h('p', { class: 'eyebrow' }, 'Invitación a una liga'),
          h('h2', null, invite.name),
          h('p', { class: 'lead' }, `${plural(invite.members, 'miembro', 'miembros')}. Al unirte, los demás verán tus resultados del reto y tu perfil, y tú los suyos.`),
          error,
          h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => modal.close() }, 'No, gracias'), accept),
        ],
        { dismissable: true, onClose: () => resolve(joined) },
      );
      accept.addEventListener('click', async () => {
        accept.disabled = true;
        try {
          joined = await joinLeague(code);
          modal.close();
        } catch (err) {
          error.textContent = (err as Error).message;
          error.hidden = false;
          accept.disabled = false;
        }
      });
    });
  }

  /** Salir de una liga (con confirmación). */
  function confirmLeave(league: League) {
    const modal = openModal(
      [
        h('h2', null, `¿Salir de ${league.name}?`),
        h('p', { class: 'lead' }, 'Dejarás de ver a sus miembros y ellos a ti. Para volver necesitarás otra vez el código.'),
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
                  await leaveLeague(league.id);
                  toast(`Has salido de ${league.name}`);
                  selected = null;
                  await load();
                } catch (err) {
                  toast((err as Error).message);
                }
              },
            },
            'Salir',
          ),
        ),
      ],
      { dismissable: true },
    );
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
    remembered.selected = selected;
    remembered.period = period;
    const list = h('ol', { class: 'ranking' }, h('li', { class: 'empty', style: 'display:block' }, 'Cargando…'));
    const day = period === 'yesterday' ? previousDay(today()) : today();
    const range = period === 'week' ? weekRange(day) : period === 'month' ? monthRange(day) : null;

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
        ...PERIODS.map(([p, label]) =>
          h('button', { class: p === period ? 'active' : '', onclick: () => ((period = p), render()) }, label),
        ),
      ),
      h('p', { class: 'muted', style: 'text-align:center; margin-top:-6px' }, range ? formatRange(range, period === 'month') : formatDay(day)),
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
      h('button', { class: 'link-btn leave-league', onclick: () => confirmLeave(league) }, 'Salir de esta liga'),
    );

    if (range) void fillStandings(list, league.id, range);
    else void fillRanking(list, league.id, day);
  }

  /** Clasificación acumulada de la semana o el mes. */
  async function fillStandings(list: HTMLElement, leagueId: string, range: DayRange) {
    const id = ++requestId;
    try {
      const rows = await leagueStandings(leagueId, range.from, range.to);
      if (disposed || id !== requestId) return;
      list.replaceChildren(
        ...rows.map((row, i) =>
          h(
            'li',
            rowProps(row),
            h('span', { class: 'pos' }, row.days > 0 ? medal(i) : '·'),
            avatar(row.hat),
            h(
              'span',
              { class: 'who' },
              h('strong', null, row.name + (row.isMe ? ' (tú)' : '')),
              h(
                'small',
                null,
                row.days > 0
                  ? [plural(row.days, 'reto', 'retos'), row.wins > 0 ? `🏆 ${row.wins}` : null, `mejor ${row.best}`]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Sin retos en este periodo',
              ),
            ),
            row.days > 0 ? h('span', { class: 'pts' }, String(row.points)) : h('span', { class: 'pts none' }, '—'),
          ),
        ),
      );
    } catch (err) {
      if (id === requestId) list.replaceChildren(h('li', { class: 'empty', style: 'display:block' }, (err as Error).message));
    }
  }

  async function fillRanking(list: HTMLElement, leagueId: string, forDay: string) {
    const id = ++requestId;
    try {
      const rows = await leagueRanking(leagueId, forDay);
      if (disposed || id !== requestId) return;
      // Las partidas de los demás se pueden ver como fantasma cuando ya terminaste (o el día ya pasó).
      const canWatch = forDay < today() || rows.some((r) => r.isMe && r.status === 'finished');
      const ghostButton = (row: RankingRow) =>
        h(
          'button',
          {
            class: 'link-btn ghost-link',
            onclick: (e: Event) => {
              e.stopPropagation(); // La fila abre el perfil.
              go({ name: 'ghost', day: forDay, friendId: row.id });
            },
          },
          '👻 Ver su partida',
        );
      list.replaceChildren(
        ...rows.map((row, i) =>
          h(
            'li',
            rowProps(row),
            h('span', { class: 'pos' }, row.status === 'finished' ? medal(i) : '·'),
            avatar(row.hat),
            h(
              'span',
              { class: 'who' },
              h('strong', null, row.name + (row.isMe ? ' (tú)' : '')),
              h(
                'small',
                null,
                row.status === 'finished'
                  ? row.overPar !== null
                    ? `${row.moves} mov.${row.hints ? ` · 💡 ${row.hints}` : ''} · ⏱ ${formatTime(row.timeMs ?? 0)}`
                    : `${row.moves} mov. · ↺ ${row.retries}${row.hints ? ` · 💡 ${row.hints}` : ''} · ⏱ ${formatTime(row.timeMs ?? 0)}`
                  : row.status === 'playing'
                    ? 'Jugando…'
                    : 'Sin jugar',
              ),
              canWatch && !row.isMe && row.status === 'finished' ? ghostButton(row) : null,
            ),
            row.status === 'finished'
              ? row.overPar !== null
                ? h('span', { class: `pts golf${row.overPar === 0 ? ' par' : ''}`, title: `${row.score} puntos de liga` }, golfLabel(row.overPar))
                : h('span', { class: 'pts' }, String(row.score))
              : h('span', { class: 'pts none' }, '—'),
          ),
        ),
      );
    } catch (err) {
      if (id === requestId) list.replaceChildren(h('li', { class: 'empty', style: 'display:block' }, (err as Error).message));
    }
  }

  function openLeagueForms() {
    const codeInput = h('input', { class: 'field', placeholder: 'Código (p. ej. 4F9K2A)', maxLength: 6, autocapitalize: 'characters' });
    const nameInput = h('input', { class: 'field', placeholder: 'Nombre de la liga', maxLength: 30 });
    const error = h('p', { class: 'error', hidden: true });

    const run = async (button: HTMLButtonElement, action: () => Promise<League>) => {
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
              if (codeInput.value.trim()) void run(joinBtn, () => joinLeague(codeInput.value));
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
              if (nameInput.value.trim().length >= 2) void run(createBtn, () => createLeague(nameInput.value));
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

/** El pingüino de cada amigo, con su gorro. */
function avatar(hat: RankingRow['hat']): HTMLElement {
  return h('span', { class: 'avatar' }, svg(penguinSvg(hat)));
}

function medal(index: number): string {
  return ['🥇', '🥈', '🥉'][index] ?? String(index + 1);
}

/** "Semana del 5 al 11 de octubre" o "Octubre de 2026". */
function formatRange({ from, to }: DayRange, month: boolean): string {
  const date = (d: string) => new Date(`${d}T12:00:00Z`);
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: 'UTC' }).format(date(d));
  if (month) {
    const text = fmt(from, { month: 'long', year: 'numeric' });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return sameMonth
    ? `Semana del ${fmt(from, { day: 'numeric' })} al ${fmt(to, { day: 'numeric', month: 'long' })}`
    : `Semana del ${fmt(from, { day: 'numeric', month: 'long' })} al ${fmt(to, { day: 'numeric', month: 'long' })}`;
}
