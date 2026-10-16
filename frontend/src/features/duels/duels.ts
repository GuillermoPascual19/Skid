// Duelos: crear (contra un amigo o por enlace), rechazar, el resultado (con el
// fantasma y la revancha) y la tarjeta de la portada. La sala está en
// duel-room.ts y la partida en duel-play.ts.

import { cached } from '../../shared/cache';
import { penguinSvg } from '../../../../common/art/hats';
import { type DuelDifficulty } from '../../../../common/logic/duels/duels';
import { movesLabel } from '../../shared/result';
import { formatDuration, formatTime, h, openModal, share, svg, toast } from '../../shared/dom';
import { go } from '../../shared/router';
import { ensureName } from '../profile/profile';
import { type Duel, type Friend, createDuel, declineDuel, listDuels, listFriends } from './api';
import { playerName, t, tn } from '../../i18n/i18n';

const DIFFICULTY_ORDER: DuelDifficulty[] = ['easy', 'medium', 'hard'];

export const difficultyLabel = (d: DuelDifficulty) => t(`duels.difficulty.${d}`);

/** «Quedan 47 h», «Quedan 12 min». */
export function timeLeft(expiresAt: number): string {
  const minutes = Math.max(0, Math.round((expiresAt - Date.now()) / 60_000));
  return t('duels.timeLeft', { time: minutes >= 60 ? formatDuration(Math.floor(minutes / 60)) : formatDuration(0, minutes) });
}

export const avatar = (hat: Friend['hat']) => h('span', { class: 'avatar' }, svg(penguinSvg(hat)));

function duelLink(id: string): string {
  return `${location.origin}${location.pathname}?duelo=${encodeURIComponent(id)}`;
}

/** Comparte el enlace de un duelo abierto: quien lo abra primero será tu rival. */
export function shareDuel(duel: Pick<Duel, 'id' | 'difficulty'>): void {
  void share(`⚔️ ${t('duels.shareText', { difficulty: difficultyLabel(duel.difficulty) })}\n${duelLink(duel.id)}`);
}

/** A la sala del duelo: allí se espera al rival, empieza la partida y se ve el resultado. */
export function enterRoom(duel: Pick<Duel, 'id'>): void {
  go({ name: 'duelRoom', id: duel.id });
}

/**
 * Deja el duelo en la dirección (?duelo=): si el móvil recarga la página al
 * volver de WhatsApp, se vuelve a la sala y no a la portada.
 */
export function keepDuelInUrl(id: string): void {
  history.replaceState(null, '', `${location.pathname}?duelo=${encodeURIComponent(id)}`);
}

export function clearDuelUrl(): void {
  if (new URLSearchParams(location.search).has('duelo')) history.replaceState(null, '', location.pathname);
}

/** Has terminado y el rival aún juega: tu resultado y la animación de espera. */
export function waitingForRival(duel: Duel): HTMLElement[] {
  const mine = duel.me.moves !== null ? `${movesLabel(duel.me.moves)} · ⏱ ${formatTime(duel.me.timeMs ?? 0)}` : null;
  const items: (HTMLElement | null)[] = [
    h(
      'div',
      { class: 'duel-wait' },
      h('div', { class: 'duel-wait-penguin' }, svg(penguinSvg(duel.rival?.hat ?? null))),
      h('span', { class: 'duel-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    ),
    h('h2', null, t('duels.live.waitingRival', { name: rivalName(duel) })),
    mine ? h('p', { class: 'lead' }, t('duels.live.yourResult', { result: mine })) : null,
    h('p', { class: 'muted' }, timeLeft(duel.expiresAt)),
  ];
  return items.filter((el): el is HTMLElement => el !== null);
}

/** Nuevo duelo: dificultad y rival (un amigo de tus ligas o un enlace para cualquiera). */
export async function openNewDuel(onCreated: () => void, preset?: { difficulty: DuelDifficulty; rival: Friend }): Promise<void> {
  if (!(await ensureName())) return;
  let difficulty: DuelDifficulty = preset?.difficulty ?? 'medium';
  const difficulties = h('div', { class: 'segmented duel-difficulty' });
  const paintDifficulties = () =>
    difficulties.replaceChildren(
      ...DIFFICULTY_ORDER.map((d) =>
        h(
          'button',
          {
            class: d === difficulty ? 'active' : '',
            onclick: () => {
              difficulty = d;
              paintDifficulties();
            },
          },
          difficultyLabel(d),
        ),
      ),
    );
  paintDifficulties();

  const friends = h('div', { class: 'duel-friends' }, h('p', { class: 'muted' }, t('duels.new.loadingFriends')));
  const error = h('p', { class: 'error', hidden: true });
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, t('duels.new.eyebrow')),
      h('h2', null, t('duels.new.title')),
      h('p', { class: 'muted' }, t('duels.new.text')),
      difficulties,
      friends,
      error,
      h('button', { class: 'btn secondary block', onclick: () => void create(null) }, `🔗 ${t('duels.new.withLink')}`),
      h('button', { class: 'link-btn', onclick: () => modal.close() }, t('common.cancel')),
    ],
    { dismissable: true },
  );

  async function create(rival: Friend | null) {
    error.hidden = true;
    try {
      const duel = await createDuel(difficulty, rival?.id ?? null);
      modal.close();
      onCreated();
      // A la sala, a esperar al rival. Con enlace, además, a compartirlo.
      enterRoom(duel);
      if (rival) toast(t('duels.new.challenged', { name: rival.name }));
      else shareDuel(duel);
    } catch (err) {
      error.textContent = (err as Error).message;
      error.hidden = false;
    }
  }

  try {
    const list = await listFriends();
    friends.replaceChildren(
      ...(list.length
        ? list.map((f) =>
            h('button', { class: `duel-friend ${preset?.rival.id === f.id ? 'suggested' : ''}`, onclick: () => void create(f) }, avatar(f.hat), h('span', null, f.name), h('span', { class: 'go' }, '⚔️')),
          )
        : [h('p', { class: 'muted' }, t('duels.new.noFriends'))]),
    );
  } catch (err) {
    friends.replaceChildren(h('p', { class: 'error' }, (err as Error).message));
  }
}

/** Rechazar un duelo al que te han retado (antes de jugarlo). */
export function confirmDecline(duel: Duel, onDone: () => void): void {
  const modal = openModal(
    [
      h('h2', null, t('duels.decline.title')),
      h('p', { class: 'lead' }, t('duels.decline.text', { name: rivalName(duel) })),
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
                await declineDuel(duel.id);
                onDone();
              } catch (err) {
                toast((err as Error).message);
              }
            },
          },
          t('duels.decline.button'),
        ),
      ),
    ],
    { dismissable: true },
  );
}

/** El rival, por su nombre (o «tu rival» si aún no hay). */
export function rivalName(duel: Duel): string {
  return duel.rival ? playerName(duel.rival.name) : t('duels.yourRival');
}

/** Frase del resultado de un duelo terminado. */
export function outcomeText(duel: Duel): string {
  const name = rivalName(duel);
  if (duel.status === 'declined') return duel.role === 'opponent' ? t('duels.outcome.youDeclined') : t('duels.outcome.theyDeclined', { name });
  if (!duel.rival) return t('duels.outcome.nobody');
  if (duel.outcome === 'win') return duel.rival.finished ? t('duels.outcome.win') : t('duels.outcome.winNoShow', { name });
  if (duel.outcome === 'lose') return duel.me.finished ? t('ghost.theyWin', { name }) : t('duels.outcome.loseNoShow', { name });
  return duel.me.finished ? t('ghost.draw') : t('duels.outcome.noneFinished');
}

/** Qué decidió el duelo, si hace falta decirlo. */
function decidedText(duel: Duel): string | null {
  if (duel.decidedBy === 'moves') return t('duels.result.byMoves');
  if (duel.decidedBy === 'time') return t('duels.result.byTime');
  return null;
}

/** Fila de un jugador en el resultado: movimientos y tiempo, con 🏆 si ganó. */
function sideRow(name: string, side: Duel['me'], winner: boolean): HTMLElement {
  return h(
    'div',
    { class: `duel-side ${winner ? 'winner' : ''}` },
    h('span', { class: 'duel-side-name' }, `${winner ? '🏆 ' : ''}${name}`),
    side.finished && side.moves !== null
      ? h('span', { class: 'duel-side-result' }, h('strong', null, movesLabel(side.moves)), ` · ⏱ ${formatTime(side.timeMs ?? 0)}`)
      : h('span', { class: 'duel-side-result muted' }, t('duels.result.notFinished')),
  );
}

/** El resultado de un duelo terminado: quién gana y por qué, las dos marcas, el fantasma y la revancha. */
export function duelResultContent(duel: Duel, opts: { onChange: () => void; close?: () => void }): HTMLElement[] {
  const rival = duel.rival;
  const finished = duel.status === 'finished';
  const decided = decidedText(duel);
  const items: (HTMLElement | null)[] = [
    h('p', { class: 'eyebrow' }, `${t('ghost.duelSubtitle', { difficulty: difficultyLabel(duel.difficulty) })} · ${t('common.optimalN', { n: duel.optimal })}`),
    h('h2', null, `${duel.outcome === 'win' ? '🏆 ' : ''}${outcomeText(duel)}`),
    decided ? h('p', { class: 'muted duel-decided' }, decided) : null,
    rival && finished
      ? h('div', { class: 'duel-sides' }, sideRow(t('ghost.you'), duel.me, duel.outcome === 'win'), sideRow(playerName(rival.name), rival, duel.outcome === 'lose'))
      : null,
    h(
      'div',
      { class: 'row' },
      rival?.finished && finished ? h('button', { class: 'btn secondary', onclick: () => (opts.close?.(), go({ name: 'duelGhost', duel })) }, `👻 ${t('duels.result.watch')}`) : null,
      rival
        ? h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                opts.close?.();
                void openNewDuel(opts.onChange, { difficulty: duel.difficulty, rival: { id: rival.id, name: playerName(rival.name), hat: rival.hat } });
              },
            },
            `⚔️ ${t('duels.result.rematch')}`,
          )
        : null,
    ),
  ];
  return items.filter((el): el is HTMLElement => el !== null);
}

/** El resultado en un modal (desde la lista de duelos). */
export function showDuelResult(duel: Duel, onChange: () => void): void {
  const modal = openModal(
    [...duelResultContent(duel, { onChange, close: () => modal.close() }), h('button', { class: 'link-btn', onclick: () => modal.close() }, t('common.close'))],
    { dismissable: true },
  );
}

/** Duelos que te esperan: entrar en la sala o terminar tu partida. */
export function myTurn(duels: Duel[]): Duel[] {
  return duels.filter((d) => d.status === 'waiting' || (d.status === 'playing' && !d.me.handedIn));
}


/** Tarjeta de la portada: cuántos duelos te esperan y botones para verlos o retar. */
export function duelsCard(): { el: HTMLElement; load(): Promise<void> } {
  const el = h('section', { class: 'card levels-card duels-card' });
  const render = (turn: number) =>
    el.replaceChildren(
      h(
        'div',
        { class: 'info' },
        h('p', { class: 'eyebrow' }, t('nav.duels')),
        h('h2', null, turn ? t('duels.card.turn', { duels: tn('duels.card.duels', turn) }) : t('duels.card.challenge')),
        h('p', { class: 'muted' }, turn ? t('duels.card.turnText') : t('duels.card.text')),
      ),
      h('button', { class: 'btn secondary', onclick: () => go({ name: 'duels' }) }, turn ? t('common.play') : `⚔️ ${t('duels.card.button')}`),
    );
  render(0);
  return {
    el,
    async load() {
      // Sin conexión (y sin nada guardado): se queda la invitación a retar.
      await cached('duels:turn', async () => myTurn(await listDuels()).length, render, () => {});
    },
  };
}
