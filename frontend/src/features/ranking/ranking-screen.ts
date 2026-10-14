// Ranking del reto diario por ligas de amigos. Una liga se comparte con un
// enlace (?join=CÓDIGO) o con su código de 6 caracteres.

import * as online from '../../shared/api';
import { penguinSvg } from '../../../../common/art/hats';
import { formatDay, formatTime, h, openModal, previousDay, share, svg, toast } from '../../shared/dom';
import { weekRange, type DayRange } from '../../../../common/logic/daily/daily';
import { seasonOf, seasonRange } from '../../../../common/logic/leagues/seasons';
import { golfLabel } from '../../../../common/logic/daily/score';
import { today } from '../daily/daily';
import { ensureName } from '../profile/profile';
import { go, type Screen } from '../../shared/router';
import {
  type League,
  type RankingRow,
  createLeague,
  joinLeague,
  leagueInvite,
  leagueRanking,
  leagueSeason,
  leagueStandings,
  leaveLeague,
  myLeagues,
} from './api';
import { previousSeasonCard, seasonCard } from './season';
import { reactionsLine } from './reactions';
import { intlLocale, t, tn } from '../../i18n/i18n';

type Period = 'today' | 'yesterday' | 'week' | 'season';

/** Liga y pestaña que se estaban viendo (dura mientras la página esté abierta). */
const remembered: { selected: string | null; period: Period } = { selected: null, period: 'today' };

/** Fila del ranking que abre el perfil de ese jugador (con el dedo o con el teclado). */
function rowProps(row: { id: string; name: string; isMe: boolean }) {
  const open = () => go({ name: 'player', id: row.id });
  return {
    class: `rank-row ${row.isMe ? 'me' : ''}`,
    role: 'button',
    tabIndex: 0,
    'aria-label': t('ranking.profileOf', { name: row.name }),
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
      h('button', { class: 'icon-btn', 'aria-label': t('common.back'), onclick: () => go({ name: 'home' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, t('nav.ranking')), h('p', null, t('ranking.subtitle'))),
    ),
    body,
  );

  if (!online.onlineEnabled) {
    body.append(
      h(
        'section',
        { class: 'card' },
        h('p', { class: 'eyebrow' }, t('ranking.offline.eyebrow')),
        h('h2', null, t('ranking.offline.title')),
        h(
          'p',
          { class: 'muted', style: 'margin-top: 8px' },
          t('ranking.offline.text'),
        ),
      ),
    );
    return { el };
  }

  const PERIODS: [Period, string][] = [
    ['today', t('ranking.period.today')],
    ['yesterday', t('ranking.period.yesterday')],
    ['week', t('ranking.period.week')],
    ['season', t('ranking.period.season')],
  ];

  let leagues: League[] = [];
  // Al volver del perfil de un amigo se sigue en la misma liga y pestaña.
  let selected: string | null = remembered.selected;
  let period: Period = remembered.period;
  /** Cada consulta lleva su número: si el jugador cambia de pestaña, se descarta la respuesta vieja. */
  let requestId = 0;
  let disposed = false;

  async function load() {
    body.replaceChildren(h('p', { class: 'empty' }, t('common.loading')));
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
          toast(t('ranking.joined', { name: joined.name }));
        }
      }
      leagues = await myLeagues();
      selected = leagues.find((l) => l.id === selected)?.id ?? leagues[0]?.id ?? null;
      if (!disposed) render();
    } catch (err) {
      body.replaceChildren(
        h('section', { class: 'card empty' }, h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: load }, t('common.retry'))),
      );
    }
  }

  /** Enseña la liga de un enlace de invitación y une al jugador solo si acepta. */
  async function confirmInvite(code: string): Promise<League | null> {
    const invite = await leagueInvite(code);
    if (invite.alreadyMember) return null;
    return new Promise((resolve) => {
      let joined: League | null = null;
      const accept = h('button', { class: 'btn' }, t('ranking.join'));
      const error = h('p', { class: 'error', hidden: true });
      const modal = openModal(
        [
          h('p', { class: 'eyebrow' }, t('ranking.invite.eyebrow')),
          h('h2', null, invite.name),
          h('p', { class: 'lead' }, t('ranking.invite.text', { members: tn('ranking.members', invite.members) })),
          error,
          h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => modal.close() }, t('ranking.invite.decline')), accept),
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
        h('h2', null, t('ranking.leave.title', { name: league.name })),
        h('p', { class: 'lead' }, t('ranking.leave.text')),
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
                  await leaveLeague(league.id);
                  toast(t('ranking.leave.done', { name: league.name }));
                  selected = null;
                  await load();
                } catch (err) {
                  toast((err as Error).message);
                }
              },
            },
            t('ranking.leave.button'),
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
          h('h2', null, t('ranking.empty.title')),
          h('p', { class: 'muted', style: 'margin: 6px 0 14px' }, t('ranking.empty.text')),
          h('button', { class: 'btn big block', onclick: openLeagueForms }, t('ranking.createOrJoin')),
        ),
      );
      return;
    }

    const league = leagues.find((l) => l.id === selected)!;
    remembered.selected = selected;
    remembered.period = period;
    const list = h('ol', { class: 'ranking' }, h('li', { class: 'empty', style: 'display:block' }, t('common.loading')));
    const day = period === 'yesterday' ? previousDay(today()) : today();
    const range = period === 'week' ? weekRange(day) : period === 'season' ? seasonRange(seasonOf(day)) : null;
    // En la temporada, el premio va encima y el podio de la anterior debajo (se rellenan al llegar).
    const seasonTop = h('div', { class: 'season-slot' });
    const seasonBottom = h('div', { class: 'season-slot' });

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
        h('button', { class: 'tab', 'aria-label': t('ranking.createOrJoin'), onclick: openLeagueForms }, '＋'),
      ),
      h(
        'div',
        { class: 'segmented' },
        ...PERIODS.map(([p, label]) =>
          h('button', { class: p === period ? 'active' : '', onclick: () => ((period = p), render()) }, label),
        ),
      ),
      period === 'season'
        ? seasonTop
        : h('p', { class: 'muted', style: 'text-align:center; margin-top:-6px' }, range ? formatWeek(range) : formatDay(day)),
      list,
      seasonBottom,
      h(
        'section',
        { class: 'card invite' },
        h(
          'div',
          { style: 'flex:1' },
          h('p', { class: 'eyebrow' }, t('ranking.inviteTo', { name: league.name })),
          h('div', { class: 'code' }, league.code),
          h('small', { class: 'muted' }, tn('ranking.members', league.members ?? 1)),
        ),
        h(
          'button',
          {
            class: 'btn secondary',
            onclick: () =>
              share(`${t('ranking.shareInvite', { name: league.name })}\n${location.origin}${location.pathname}?join=${league.code}`),
          },
          t('ranking.invite.button'),
        ),
      ),
      h('button', { class: 'link-btn leave-league', onclick: () => confirmLeave(league) }, t('ranking.leave.link')),
    );

    if (range) void fillStandings(list, league.id, range);
    else void fillRanking(list, league.id, day);
    if (period === 'season') void fillSeason(seasonTop, seasonBottom, league.id);
  }

  /** Premio y cuenta atrás de la temporada, y el podio de la anterior. */
  async function fillSeason(top: HTMLElement, bottom: HTMLElement, leagueId: string) {
    const id = requestId; // fillStandings ya ha subido el número de esta pestaña.
    try {
      const season = await leagueSeason(leagueId);
      if (disposed || id !== requestId) return;
      top.replaceChildren(seasonCard(season));
      if (!season.previous) return;
      // Los primeros días del mes el podio recién cerrado va arriba, que es la noticia.
      const fresh = Number(today().slice(8, 10)) <= 7;
      (fresh ? top : bottom).append(previousSeasonCard(season.previous));
    } catch {
      // Sin la tarjeta se sigue viendo la clasificación.
    }
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
              h('strong', null, row.isMe ? t('ranking.me', { name: row.name }) : row.name),
              h(
                'small',
                null,
                row.days > 0
                  ? [tn('ranking.challenges', row.days), row.wins > 0 ? `🏆 ${row.wins}` : null, t('ranking.bestN', { n: row.best ?? 0 })]
                      .filter(Boolean)
                      .join(' · ')
                  : t('ranking.noChallenges'),
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
          `👻 ${t('ranking.watchGame')}`,
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
              h('strong', null, row.isMe ? t('ranking.me', { name: row.name }) : row.name),
              h(
                'small',
                null,
                row.status === 'finished'
                  ? row.overPar !== null
                    ? `${t('common.movesShort', { n: row.moves ?? 0 })}${row.hints ? ` · 💡 ${row.hints}` : ''} · ⏱ ${formatTime(row.timeMs ?? 0)}`
                    : `${t('common.movesShort', { n: row.moves ?? 0 })} · ↺ ${row.retries}${row.hints ? ` · 💡 ${row.hints}` : ''} · ⏱ ${formatTime(row.timeMs ?? 0)}`
                  : row.status === 'playing'
                    ? t('ranking.playing')
                    : t('ranking.notPlayed'),
              ),
              canWatch && !row.isMe && row.status === 'finished' ? ghostButton(row) : null,
              reactionsLine(row, forDay, () => void fillRanking(list, leagueId, forDay)),
            ),
            row.status === 'finished'
              ? row.overPar !== null
                ? h('span', { class: `pts golf${row.overPar === 0 ? ' par' : ''}`, title: t('ranking.leaguePoints', { n: row.score ?? 0 }) }, golfLabel(row.overPar))
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
    const codeInput = h('input', { class: 'field', placeholder: t('ranking.form.codePlaceholder'), maxLength: 6, autocapitalize: 'characters' });
    const nameInput = h('input', { class: 'field', placeholder: t('ranking.form.namePlaceholder'), maxLength: 30 });
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

    const joinBtn: HTMLButtonElement = h('button', { class: 'btn secondary', type: 'submit' }, t('ranking.join'));
    const createBtn: HTMLButtonElement = h('button', { class: 'btn', type: 'submit' }, t('ranking.form.create'));

    const modal = openModal(
      [
        h('h2', null, t('ranking.form.title')),
        h('p', { class: 'eyebrow' }, t('ranking.form.joinEyebrow')),
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
        h('p', { class: 'eyebrow' }, t('ranking.form.createEyebrow')),
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
        h('button', { class: 'link-btn', onclick: () => modal.close() }, t('common.close')),
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

/** "Semana 5–11 de octubre", en el idioma del jugador. */
function formatWeek({ from, to }: DayRange): string {
  const date = (d: string) => new Date(`${d}T12:00:00Z`);
  const range = new Intl.DateTimeFormat(intlLocale(), { day: 'numeric', month: 'long', timeZone: 'UTC' }).formatRange(date(from), date(to));
  return t('weekly.title', { range });
}
