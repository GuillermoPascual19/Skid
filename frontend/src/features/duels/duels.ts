// Duelos: crear (contra un amigo o por enlace), aceptar una invitación, jugar,
// ver el resultado (con el fantasma y la revancha) y la partida en sí.

import { penguinSvg } from '../../../../common/art/hats';
import { DUEL_DIFFICULTIES, type DuelDifficulty } from '../../../../common/logic/duels/duels';
import { golfLabel } from '../../../../common/logic/daily/score';
import { attemptScreen } from '../../play/attempt-screen';
import { formatTime, h, openModal, share, svg, toast } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import { ensureName } from '../profile/profile';
import { type Duel, type DuelInvite, type Friend, acceptDuel, createDuel, declineDuel, finishDuel, handInDuel, listDuels, listFriends, startDuel } from './api';

const DIFFICULTY_ORDER: DuelDifficulty[] = ['easy', 'medium', 'hard'];

export const difficultyLabel = (d: DuelDifficulty) => DUEL_DIFFICULTIES[d]?.label ?? d;

/** «Quedan 47 h», «Quedan 12 min». */
export function timeLeft(expiresAt: number): string {
  const minutes = Math.max(0, Math.round((expiresAt - Date.now()) / 60_000));
  return minutes >= 60 ? `Quedan ${Math.floor(minutes / 60)} h` : `Quedan ${minutes} min`;
}

export const avatar = (hat: Friend['hat']) => h('span', { class: 'avatar' }, svg(penguinSvg(hat)));

function duelLink(id: string): string {
  return `${location.origin}${location.pathname}?duelo=${encodeURIComponent(id)}`;
}

/** Comparte el enlace de un duelo abierto: quien lo abra primero será tu rival. */
export function shareDuel(duel: Pick<Duel, 'id' | 'difficulty'>): void {
  void share(`⚔️ ¡Te reto a un duelo en Skid! Dificultad ${difficultyLabel(duel.difficulty).toLowerCase()}, 48 h para jugarlo.\n${duelLink(duel.id)}`);
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

  const friends = h('div', { class: 'duel-friends' }, h('p', { class: 'muted' }, 'Cargando tus amigos…'));
  const error = h('p', { class: 'error', hidden: true });
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, 'Nuevo duelo'),
      h('h2', null, '¿A quién retas?'),
      h('p', { class: 'muted' }, 'Un tablero nuevo que ninguno ha visto. Cada uno juega las veces que quiera y entrega su mejor marca; gana quien la tenga mejor (a igualdad, quien tardó menos). 48 h.'),
      difficulties,
      friends,
      error,
      h('button', { class: 'btn secondary block', onclick: () => void create(null) }, '🔗 Retar con un enlace'),
      h('button', { class: 'link-btn', onclick: () => modal.close() }, 'Cancelar'),
    ],
    { dismissable: true },
  );

  async function create(rival: Friend | null) {
    error.hidden = true;
    try {
      const duel = await createDuel(difficulty, rival?.id ?? null);
      modal.close();
      onCreated();
      if (rival) toast(`Has retado a ${rival.name}`);
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
        : [h('p', { class: 'muted' }, 'Aún no tienes amigos en tus ligas: reta a alguien con un enlace.')]),
    );
  } catch (err) {
    friends.replaceChildren(h('p', { class: 'error' }, (err as Error).message));
  }
}

/** Invitación por enlace: quién reta y con qué dificultad. Al aceptar, a jugar. */
export async function openInvite(invite: DuelInvite, onAccepted: (duel: Duel) => void): Promise<void> {
  const accept = h('button', { class: 'btn' }, 'Aceptar');
  const error = h('p', { class: 'error', hidden: true });
  const modal = openModal(
    [
      h('div', { class: 'duel-invite-penguin' }, svg(penguinSvg(invite.challenger.hat))),
      h('p', { class: 'eyebrow' }, `Duelo · ${difficultyLabel(invite.difficulty)}`),
      h('h2', null, `${invite.challenger.name} te reta`),
      h('p', { class: 'lead' }, `Un tablero nuevo para los dos. ${timeLeft(invite.expiresAt)} para jugarlo: gana quien lo haga en menos golpes.`),
      error,
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => modal.close() }, 'Ahora no'), accept),
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
      h('h2', null, '¿Rechazar el duelo?'),
      h('p', { class: 'lead' }, `${duel.rival?.name ?? 'Tu rival'} verá que lo has rechazado. El duelo termina sin ganador.`),
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
                await declineDuel(duel.id);
                onDone();
              } catch (err) {
                toast((err as Error).message);
              }
            },
          },
          'Rechazar',
        ),
      ),
    ],
    { dismissable: true },
  );
}

/** Frase del resultado de un duelo terminado. */
export function outcomeText(duel: Duel): string {
  const rival = duel.rival?.name ?? 'tu rival';
  if (duel.status === 'declined') return duel.role === 'opponent' ? 'Lo rechazaste' : `${rival} lo rechazó`;
  if (!duel.rival) return 'Nadie aceptó el reto';
  if (duel.outcome === 'win') return duel.rival.finished ? '¡Ganas!' : `¡Ganas! ${rival} no llegó a jugarlo`;
  if (duel.outcome === 'lose') return duel.me.finished ? `Gana ${rival}` : `Gana ${rival}: no llegaste a jugarlo`;
  return duel.me.finished ? '¡Empate!' : 'Ninguno lo terminó';
}

const sideLine = (name: string, side: Duel['me']) =>
  h(
    'div',
    null,
    h('span', null, name),
    h('span', null, side.finished && side.moves !== null ? `${golfLabel(side.overPar ?? 0)} · ${side.moves} mov. · ⏱ ${formatTime(side.timeMs ?? 0)}` : 'Sin terminar'),
  );

/** Resultado de un duelo terminado: quién gana, las dos marcas, el fantasma y la revancha. */
export function showDuelResult(duel: Duel, onChange: () => void): void {
  const rival = duel.rival;
  const modal = openModal(
    [
      h('p', { class: 'eyebrow' }, `Duelo · ${difficultyLabel(duel.difficulty)} · óptimo ${duel.optimal}`),
      h('h2', null, outcomeText(duel)),
      rival && duel.status === 'finished' ? h('div', { class: 'breakdown' }, sideLine('Tú', duel.me), sideLine(rival.name, rival)) : null,
      h(
        'div',
        { class: 'row' },
        rival?.finished && duel.status === 'finished'
          ? h('button', { class: 'btn secondary', onclick: () => (modal.close(), go({ name: 'duelGhost', duel })) }, '👻 Ver el duelo')
          : null,
        rival
          ? h(
              'button',
              {
                class: 'btn',
                onclick: () => {
                  modal.close();
                  void openNewDuel(onChange, { difficulty: duel.difficulty, rival: { id: rival.id, name: rival.name, hat: rival.hat } });
                },
              },
              '⚔️ Revancha',
            )
          : null,
      ),
      h('button', { class: 'link-btn', onclick: () => modal.close() }, 'Cerrar'),
    ],
    { dismissable: true },
  );
}

/** Qué cuenta el resultado tras jugar o entregar, según cómo esté el duelo. */
function duelOutcome(duel: Duel) {
  const rival = duel.rival?.name ?? 'tu rival';
  const best = duel.me.overPar;
  if (duel.status === 'finished') {
    return { bestOverPar: best, note: `Tu marca: ${golfLabel(best ?? 0)}.`, highlight: `⚔️ ${outcomeText(duel)}`, closed: true };
  }
  if (duel.me.handedIn) {
    return { bestOverPar: best, note: `Has entregado tu marca: ${golfLabel(best ?? 0)}. Cuando ${rival} entregue la suya (o pasen las 48 h) sabrás quién gana.`, closed: true };
  }
  return {
    bestOverPar: best,
    note: `Tu mejor marca: ${golfLabel(best ?? 0)}. Puedes seguir mejorándola; cuando te guste, entrégala.`,
    highlight: duel.rival?.handedIn ? `${rival} ya ha entregado su marca` : undefined,
  };
}

/** La partida de un duelo: al mejor intento, como el reto semanal, hasta que entregas tu marca. */
export function duelScreen(duel: Duel): Screen {
  const rivalName = duel.rival?.name ?? 'tu rival';
  return attemptScreen({
    title: `Duelo con ${rivalName}`,
    subtitle: `${difficultyLabel(duel.difficulty)} · ${timeLeft(duel.expiresAt).toLowerCase()}`,
    eyebrow: `Duelo con ${rivalName}`,
    rows: duel.rows,
    optimal: duel.optimal,
    bestOverPar: duel.me.overPar,
    secondary: { label: 'Duelos', onclick: () => go({ name: 'duels' }) },
    async submit(log) {
      return duelOutcome((await finishDuel(duel.id, log)).duel);
    },
    handIn: {
      label: '✅ Entregar mi marca',
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
        h('p', { class: 'eyebrow' }, 'Duelos'),
        h('h2', null, turn ? `Te toca en ${turn === 1 ? '1 duelo' : `${turn} duelos`}` : 'Reta a un amigo'),
        h('p', { class: 'muted' }, turn ? 'Juégalos antes de que pasen las 48 h.' : 'El mismo tablero para los dos: gana quien lo haga en menos golpes.'),
      ),
      h('button', { class: 'btn secondary', onclick: () => go({ name: 'duels' }) }, turn ? 'Jugar' : '⚔️ Retar'),
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
