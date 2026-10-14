// Duelos: crear (contra un amigo o por enlace), aceptar una invitación, jugar,
// ver el resultado (con el fantasma y la revancha) y la partida en sí.

import { penguinSvg } from '../../../../common/art/hats';
import { type DuelDifficulty } from '../../../../common/logic/duels/duels';
import { golfLabel } from '../../../../common/logic/daily/score';
import { attemptScreen } from '../../play/attempt-screen';
import { formatTime, h, openModal, share, svg, toast } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import { ensureName } from '../profile/profile';
import { type Duel, type DuelInvite, type Friend, acceptDuel, createDuel, declineDuel, finishDuel, handInDuel, listDuels, listFriends, startDuel } from './api';
import { playerName, t, tn } from '../../i18n/i18n';

const DIFFICULTY_ORDER: DuelDifficulty[] = ['easy', 'medium', 'hard'];

export const difficultyLabel = (d: DuelDifficulty) => t(`duels.difficulty.${d}`);

/** «Quedan 47 h», «Quedan 12 min». */
export function timeLeft(expiresAt: number): string {
  const minutes = Math.max(0, Math.round((expiresAt - Date.now()) / 60_000));
  return t('duels.timeLeft', { time: minutes >= 60 ? `${Math.floor(minutes / 60)} h` : `${minutes} min` });
}

export const avatar = (hat: Friend['hat']) => h('span', { class: 'avatar' }, svg(penguinSvg(hat)));

function duelLink(id: string): string {
  return `${location.origin}${location.pathname}?duelo=${encodeURIComponent(id)}`;
}

/** Comparte el enlace de un duelo abierto: quien lo abra primero será tu rival. */
export function shareDuel(duel: Pick<Duel, 'id' | 'difficulty'>): void {
  void share(`⚔️ ${t('duels.shareText', { difficulty: difficultyLabel(duel.difficulty) })}\n${duelLink(duel.id)}`);
}

/** Entra a jugar (la primera vez empieza a contar el tiempo en el servidor). */
export async function playDuel(duel: Duel): Promise<void> {
  try {
    const started = duel.me.started ? duel : await startDuel(duel.id);
    go({ name: 'duel', duel: started });
  } catch (err) {
    toast((err as Error).message);
  }
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

/** Invitación por enlace: quién reta y con qué dificultad. Al aceptar, a jugar. */
export async function openInvite(invite: DuelInvite, onAccepted: (duel: Duel) => void): Promise<void> {
  const accept = h('button', { class: 'btn' }, t('duels.invite.accept'));
  const error = h('p', { class: 'error', hidden: true });
  const modal = openModal(
    [
      h('div', { class: 'duel-invite-penguin' }, svg(penguinSvg(invite.challenger.hat))),
      h('p', { class: 'eyebrow' }, t('ghost.duelSubtitle', { difficulty: difficultyLabel(invite.difficulty) })),
      h('h2', null, t('duels.invite.title', { name: playerName(invite.challenger.name) })),
      h('p', { class: 'lead' }, t('duels.invite.text', { left: timeLeft(invite.expiresAt) })),
      error,
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => modal.close() }, t('common.notNow')), accept),
    ],
    { dismissable: true },
  );
  accept.addEventListener('click', async () => {
    accept.disabled = true;
    try {
      if (!(await ensureName())) return void (accept.disabled = false);
      const duel = await acceptDuel(invite.id);
      modal.close();
      onAccepted(duel);
    } catch (err) {
      error.textContent = (err as Error).message;
      error.hidden = false;
      accept.disabled = false;
    }
  });
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

const sideLine = (name: string, side: Duel['me']) =>
  h(
    'div',
    null,
    h('span', null, name),
    h('span', null, side.finished && side.moves !== null ? `${golfLabel(side.overPar ?? 0)} · ${t('common.movesShort', { n: side.moves })} · ⏱ ${formatTime(side.timeMs ?? 0)}` : t('duels.result.notFinished')),
  );

/** Resultado de un duelo terminado: quién gana, las dos marcas, el fantasma y la revancha. */
export function showDuelResult(duel: Duel, onChange: () => void): void {
  const rival = duel.rival;
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, `${t('ghost.duelSubtitle', { difficulty: difficultyLabel(duel.difficulty) })} · ${t('common.optimalN', { n: duel.optimal })}`),
      h('h2', null, outcomeText(duel)),
      rival && duel.status === 'finished' ? h('div', { class: 'breakdown' }, sideLine(t('ghost.you'), duel.me), sideLine(playerName(rival.name), rival)) : null,
      h(
        'div',
        { class: 'row' },
        rival?.finished && duel.status === 'finished'
          ? h('button', { class: 'btn secondary', onclick: () => (modal.close(), go({ name: 'duelGhost', duel })) }, `👻 ${t('duels.result.watch')}`)
          : null,
        rival
          ? h(
              'button',
              {
                class: 'btn',
                onclick: () => {
                  modal.close();
                  void openNewDuel(onChange, { difficulty: duel.difficulty, rival: { id: rival.id, name: playerName(rival.name), hat: rival.hat } });
                },
              },
              `⚔️ ${t('duels.result.rematch')}`,
            )
          : null,
      ),
      h('button', { class: 'link-btn', onclick: () => modal.close() }, t('common.close')),
    ],
    { dismissable: true },
  );
}

/** Qué cuenta el resultado tras jugar o entregar, según cómo esté el duelo. */
function duelOutcome(duel: Duel) {
  const rival = rivalName(duel);
  const best = duel.me.overPar;
  if (duel.status === 'finished') {
    return { bestOverPar: best, note: t('duels.play.yourMark', { mark: golfLabel(best ?? 0) }), highlight: `⚔️ ${outcomeText(duel)}`, closed: true };
  }
  if (duel.me.handedIn) {
    return { bestOverPar: best, note: t('duels.play.handedIn', { mark: golfLabel(best ?? 0), name: rival }), closed: true };
  }
  return {
    bestOverPar: best,
    note: t('duels.play.keepImproving', { mark: golfLabel(best ?? 0) }),
    highlight: duel.rival?.handedIn ? t('duels.play.rivalHandedIn', { name: rival }) : undefined,
  };
}

/** La partida de un duelo: al mejor intento, como el reto semanal, hasta que entregas tu marca. */
export function duelScreen(duel: Duel): Screen {
  const name = rivalName(duel);
  return attemptScreen({
    title: t('duels.play.title', { name }),
    subtitle: `${difficultyLabel(duel.difficulty)} · ${timeLeft(duel.expiresAt)}`,
    eyebrow: t('duels.play.title', { name }),
    rows: duel.rows,
    optimal: duel.optimal,
    bestOverPar: duel.me.overPar,
    secondary: { label: t('nav.duels'), onclick: () => go({ name: 'duels' }) },
    async submit(log) {
      return duelOutcome((await finishDuel(duel.id, log)).duel);
    },
    handIn: {
      label: `✅ ${t('duels.play.handIn')}`,
      run: async () => duelOutcome(await handInDuel(duel.id)),
    },
  });
}

/** Duelos en los que te toca jugar (no has entregado tu marca). */
export function myTurn(duels: Duel[]): Duel[] {
  return duels.filter((d) => d.status === 'playing' && !d.me.handedIn);
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
      try {
        render(myTurn(await listDuels()).length);
      } catch {
        // Sin conexión: se queda la invitación a retar.
      }
    },
  };
}
