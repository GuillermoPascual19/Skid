// Portada: reto del día, modo niveles y acceso al ranking.

import { DAILY_TIME_ZONE, dailyLevel } from '../../logic/daily/daily';
import * as online from '../../shared/api';
import { celebrate } from '../../shared/celebrate';
import { openDaily, resultFromServer, shareText, showDailyResult, today } from '../daily/daily';
import { penguinSvg } from '../../art/hats';
import { celebrateNewAchievements } from '../achievements/achievements-screen';
import { audioToggles } from '../../audio/audio-controls';
import { formatDay, formatTime, h, openModal, plural, previousDay, share, svg, toast, untilMidnight } from '../../shared/dom';
import { renderGoogleButton, signOut } from '../profile/google';
import { askName, currentMe } from '../profile/profile';
import { go, type Screen } from '../../shared/router';
import { dailyWins, getDaily, getStats } from '../daily/api';
import { claimWinCelebration, loadDaily, saveDaily } from '../daily/storage';
import { startingProgress } from '../free-play/storage';
import type { Me } from '../profile/api';

export function homeScreen(): Screen {
  const day = today();
  const dailyCard = h('section', { class: 'card daily-card' });
  const account = h('div', { class: 'account' });
  const logoPenguin = h('div', { class: 'logo-penguin' }, svg(penguinSvg()));
  const wearHat = (hat: Me['hat']) => logoPenguin.replaceChildren(svg(penguinSvg(hat)));
  let ticker = 0;
  let disposed = false;
  /** Racha del servidor (null hasta que llega, o sin ranking online). */
  let streak: { current: number; playedToday: boolean } | null = null;

  function renderDaily() {
    const record = loadDaily(day);
    const result = record?.result;
    dailyCard.replaceChildren(
      h(
        'div',
        { class: 'daily-head' },
        h('p', { class: 'eyebrow' }, 'Reto diario'),
        streak && streak.current > 0 ? h('span', { class: 'streak-pill', title: 'Días seguidos' }, `🔥 ${streak.current}`) : null,
      ),
      h('h2', null, formatDay(day)),
    );
    if (streak && streak.current > 0 && !streak.playedToday && !result) {
      dailyCard.append(h('p', { class: 'streak-line' }, `¡No pierdas tu racha de ${plural(streak.current, 'día', 'días')}!`));
    }

    if (result) {
      dailyCard.append(
        h('div', { class: 'score-big' }, String(result.score), h('small', null, 'pts')),
        h(
          'div',
          { class: 'chips' },
          h('span', { class: 'chip' }, `🧊 ${result.moves} mov.`),
          h('span', { class: 'chip' }, `↺ ${result.retries}`),
          result.hints ? h('span', { class: 'chip' }, `💡 ${result.hints}`) : null,
          h('span', { class: 'chip' }, `⏱ ${formatTime(result.timeMs)}`),
        ),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', onclick: () => share(shareText(day, result)) }, 'Compartir'),
          h('button', { class: 'btn ghost', onclick: () => showDailyResult(day, result) }, 'Detalle'),
        ),
        h('p', { class: 'muted', 'data-countdown': '' }),
      );
    } else if (record) {
      dailyCard.append(
        h('p', { class: 'muted' }, 'En curso. El reloj sigue corriendo: ', h('strong', { 'data-elapsed': '' })),
        h('button', { class: 'btn big block', onclick: openDaily }, 'Continuar'),
      );
    } else {
      dailyCard.append(
        h('p', { class: 'muted' }, 'Un único intento. Tu puntuación sale de los movimientos, el tiempo y los reintentos.'),
        h('button', { class: 'btn big block', onclick: openDaily }, 'Jugar el reto'),
      );
    }
    tick();
  }

  function tick() {
    const record = loadDaily(day);
    dailyCard.querySelector('[data-elapsed]')?.replaceChildren(formatTime(Date.now() - (record?.startedAt ?? Date.now())));
    dailyCard.querySelector('[data-countdown]')?.replaceChildren(`Nuevo reto en ${untilMidnight(DAILY_TIME_ZONE)}`);
  }

  async function syncWithServer() {
    if (!online.onlineEnabled) return;
    try {
      const me = await currentMe();
      renderAccount(me);
      wearHat(me.hat);
      // Primero la victoria de ayer y después los logros nuevos, nunca dos a la vez.
      void celebrateYesterday(me.name)
        .then(() => (disposed || !me.name ? undefined : celebrateNewAchievements(wearHat)))
        .catch(() => {});
      void getStats()
        .then((s) => {
          streak = { current: s.currentStreak, playedToday: s.playedToday };
          if (!disposed) renderDaily();
        })
        .catch(() => {});
      // El reto pudo jugarse en otro dispositivo.
      const server = await getDaily(day);
      const record = loadDaily(day);
      if (server?.finishedAt && (!record?.result || record.pendingSubmit)) {
        const result = resultFromServer(server, dailyLevel(day).solution.length);
        saveDaily({ day, startedAt: server.startedAt, log: record?.log ?? '', result });
        renderDaily();
      } else if (server && !record) {
        saveDaily({ day, startedAt: server.startedAt, log: '' });
        renderDaily();
      }
    } catch {
      // Sin conexión: se muestra lo que hay en este navegador.
    }
  }

  /** Si ayer quedaste 1.º en alguna liga, celebración (una sola vez). */
  async function celebrateYesterday(name: string | null) {
    if (!online.onlineEnabled || !name) return;
    const yesterday = previousDay(day);
    try {
      const wins = await dailyWins(yesterday);
      if (disposed || wins.length === 0 || document.querySelector('.overlay')) return;
      if (!claimWinCelebration(yesterday)) return;
      const [first] = wins;
      const rivals = first.players - 1;
      await celebrate({
        icon: '🏆',
        eyebrow: `Reto de ayer · ${formatDay(yesterday)}`,
        title: `¡Primer puesto, ${name}!`,
        text:
          wins.length === 1
            ? `Ganaste en ${first.leagueName} con ${first.score} puntos, por delante de ${plural(rivals, 'amigo', 'amigos')}.`
            : `Ganaste en ${wins.length} ligas: ${wins.map((w) => w.leagueName).join(', ')}. ¡Con ${first.score} puntos!`,
        button: 'A por el de hoy',
      });
    } catch {
      // Sin conexión: se celebrará la próxima vez.
    }
  }

  /** Quién juega en este dispositivo y, si no está vinculado, la invitación a entrar con Google. */
  function renderAccount(me: Me) {
    const changeName = h(
      'button',
      {
        class: 'link-btn',
        onclick: async () => {
          const name = await askName(me.name ?? '');
          if (name) renderAccount({ ...me, name });
        },
      },
      me.name ? 'cambiar nombre' : 'elige tu nombre',
    );
    const who = h('p', { class: 'player-line' }, me.name ? `Juegas como ${me.name} · ` : '', changeName);

    if (me.email) {
      account.replaceChildren(
        who,
        h(
          'p',
          { class: 'player-line small' },
          `🔗 Cuenta de Google: ${me.email} · `,
          h('button', { class: 'link-btn', onclick: confirmSignOut }, 'cerrar sesión'),
        ),
      );
      return;
    }

    const slot = h('div', { class: 'google-slot' });
    const card = h(
      'section',
      { class: 'card account-card', hidden: true },
      h('p', { class: 'eyebrow' }, 'Todos tus dispositivos'),
      h('p', { class: 'muted' }, 'Entra con Google y tu nombre, tus ligas y tus puntos te seguirán en el móvil y en el ordenador.'),
      slot,
    );
    account.replaceChildren(who, card);
    void renderGoogleButton(slot, (result) => {
      if (result.switched) {
        toast(result.name ? `Has entrado como ${result.name}` : 'Has entrado con tu cuenta de Google');
        go({ name: 'home' }); // Otro jugador: se vuelve a cargar todo.
        return;
      }
      toast('Cuenta vinculada con Google');
      renderAccount({ name: result.name, email: result.email, hat: null });
    }).then((shown) => (card.hidden = !shown));
  }

  function confirmSignOut() {
    const modal = openModal(
      [
        h('h2', null, '¿Cerrar sesión?'),
        h('p', { class: 'lead' }, 'Saldrás en este dispositivo. Para volver a tu cuenta, entra otra vez con Google.'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => modal.close() }, 'Cancelar'),
          h(
            'button',
            {
              class: 'btn secondary',
              onclick: async () => {
                modal.close();
                try {
                  await signOut();
                  toast('Sesión cerrada');
                } catch (err) {
                  toast((err as Error).message);
                }
                go({ name: 'home' });
              },
            },
            'Cerrar sesión',
          ),
        ),
      ],
      { dismissable: true },
    );
  }

  const level = startingProgress().level;
  const audio = audioToggles();
  const el = h(
    'div',
    { class: 'screen home' },
    audio.el,
    h(
      'header',
      { class: 'logo' },
      logoPenguin,
      h('h1', null, 'Skid'),
      h('p', null, 'Desliza sobre el hielo. Recoge en orden.'),
    ),
    dailyCard,
    h(
      'section',
      { class: 'card levels-card' },
      h('div', { class: 'info' }, h('p', { class: 'eyebrow' }, 'Modo libre'), h('h2', null, `Nivel ${level}`), h('p', { class: 'muted' }, 'Cada nivel, un poco más difícil.')),
      h('button', { class: 'btn secondary', onclick: () => go({ name: 'levels' }) }, 'Jugar'),
    ),
    h(
      'nav',
      { class: 'nav-tiles' },
      navTile('🏆', 'Ranking', () => go({ name: 'ranking' })),
      online.onlineEnabled ? navTile('📊', 'Estadísticas', () => go({ name: 'stats' })) : null,
      online.onlineEnabled ? navTile('🎩', 'Logros', () => go({ name: 'achievements' })) : null,
    ),
    online.onlineEnabled
      ? h(
          'section',
          { class: 'card levels-card multiplayer-card' },
          h(
            'div',
            { class: 'info' },
            h('p', { class: 'eyebrow' }, 'Multijugador'),
            h('h2', null, 'Niveles de jugadores'),
            h('p', { class: 'muted' }, 'Juega y valora los de otros, o crea el tuyo.'),
          ),
          h('button', { class: 'btn secondary', onclick: () => go({ name: 'community' }) }, 'Entrar'),
        )
      : null,
    online.onlineEnabled ? account : null,
  );

  return {
    el,
    mount() {
      renderDaily();
      ticker = window.setInterval(tick, 1000);
      void syncWithServer();
    },
    dispose() {
      disposed = true;
      clearInterval(ticker);
      audio.dispose();
    },
  };
}

function navTile(icon: string, label: string, onclick: () => void): HTMLElement {
  return h('button', { class: 'nav-tile', onclick }, h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, icon), h('span', null, label));
}
