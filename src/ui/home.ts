// Portada: reto del día, modo niveles y acceso al ranking.

import { DAILY_TIME_ZONE, dailyLevel } from '../core/daily';
import * as online from '../services/online';
import { claimWinCelebration, loadDaily, saveDaily, startingProgress } from '../services/storage';
import { celebrate } from './celebrate';
import { openDaily, resultFromServer, shareText, showDailyResult, today } from './daily';
import { formatDay, formatTime, h, PENGUIN_SVG, plural, previousDay, share, svg, untilMidnight } from './dom';
import { askName, currentName } from './profile';
import { go, type Screen } from './router';

export function homeScreen(): Screen {
  const day = today();
  const dailyCard = h('section', { class: 'card daily-card' });
  const playerLine = h('p', { class: 'player-line' });
  let ticker = 0;
  let disposed = false;

  function renderDaily() {
    const record = loadDaily(day);
    const result = record?.result;
    dailyCard.replaceChildren(h('p', { class: 'eyebrow' }, 'Reto diario'), h('h2', null, formatDay(day)));

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
      const name = await currentName();
      renderPlayer(name);
      void celebrateYesterday(name);
      // El reto pudo jugarse en otro dispositivo.
      const server = await online.getDaily(day);
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
      const wins = await online.dailyWins(yesterday);
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

  function renderPlayer(name: string | null) {
    playerLine.replaceChildren(
      name ? `Juegas como ${name} · ` : '',
      h(
        'button',
        {
          class: 'link-btn',
          onclick: async () => renderPlayer((await askName(name ?? '')) ?? name),
        },
        name ? 'cambiar nombre' : 'elige tu nombre',
      ),
    );
  }

  const level = startingProgress().level;
  const el = h(
    'div',
    { class: 'screen' },
    h(
      'header',
      { class: 'logo' },
      svg(PENGUIN_SVG),
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
    h('button', { class: 'btn ghost big block', onclick: () => go({ name: 'ranking' }) }, '🏆 Ranking con amigos'),
    online.onlineEnabled ? playerLine : null,
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
    },
  };
}
