// Pestaña Hoy (la portada): el reto del día y los retos de la semana (semanal y
// contrarreloj), con las reacciones de tus amigos y las celebraciones.

import { DAILY_TIME_ZONE } from '../../../../common/logic/daily/daily';
import * as online from '../../shared/api';
import { celebrate } from '../../shared/celebrate';
import { adoptServerResult, canImprove, improveDaily, openDaily, shareText, showDailyResult, today } from '../daily/daily';
import { movesBig } from '../../shared/result';
import { penguinSvg } from '../../../../common/art/hats';
import { getFriendsOverview } from '../friends/api';
import { celebrateNewAchievements } from '../achievements/achievements-screen';
import { formatDay, formatTime, h, previousDay, share, svg, untilMidnight } from '../../shared/dom';
import { go, type Screen } from '../../shared/router';
import { setFriendRequests, withTabs } from '../../shared/tabs';
import { recall, remember } from '../../shared/cache';
import { currentMe } from '../profile/profile';
import { startingProgress } from '../free-play/storage';
import { dailyWins, getDaily, getStats } from '../daily/api';
import { claimWinCelebration, loadDaily, saveDaily } from '../daily/storage';
import type { Me } from '../profile/api';
import { NEWS, dismissGuideNews, guideStatus, openGuide } from '../guide/guide';
import { weeklyCard } from '../weekly/weekly';
import { timeAttackCard } from '../timeattack/timeattack';
import { reactionsCard } from '../ranking/reactions';
import { t, tn } from '../../i18n/i18n';

export function homeScreen(): Screen {
  const day = today();
  const dailyCard = h('section', { class: 'card daily-card' });
  // El reto semanal necesita el servidor (el tablero y el ranking están allí).
  const weekly = online.onlineEnabled ? weeklyCard() : null;
  const timeAttack = online.onlineEnabled ? timeAttackCard() : null;
  const reactions = online.onlineEnabled ? reactionsCard() : null;
  // El gorro de la última vez, al instante (luego llega el del servidor).
  const logoPenguin = h('div', { class: 'logo-penguin' }, svg(penguinSvg(recall<Me>('me')?.hat ?? null)));
  const wearHat = (hat: Me['hat']) => logoPenguin.replaceChildren(svg(penguinSvg(hat)));
  let ticker = 0;
  let disposed = false;
  /** Racha del servidor (la de la última vez hasta que llega; null sin ranking online). */
  let streak: { current: number; playedToday: boolean; day?: string } | null = recall('streak');
  // La guardada es de otro día: «jugado hoy» ya no vale.
  if (streak && streak.day !== day) streak = { ...streak, playedToday: false };

  function renderDaily() {
    const record = loadDaily(day);
    const result = record?.result;
    dailyCard.replaceChildren(
      h(
        'div',
        { class: 'daily-head' },
        h('p', { class: 'eyebrow' }, t('home.daily.eyebrow')),
        streak && streak.current > 0 ? h('span', { class: 'streak-pill', title: t('home.daily.streakTitle') }, `🔥 ${streak.current}`) : null,
      ),
      h('h2', null, formatDay(day)),
    );
    if (streak && streak.current > 0 && !streak.playedToday && !result) {
      dailyCard.append(h('p', { class: 'streak-line' }, t('home.daily.keepStreak', { days: tn('common.days', streak.current) })));
    }

    if (result) {
      dailyCard.append(
        result.overPar != null
          ? movesBig(result.optimal + result.overPar, result.optimal)
          : h('div', { class: 'score-big' }, String(result.score), h('small', null, t('common.pts'))),
        h(
          'div',
          { class: 'chips' },
          // Con movimientos, el resultado ya está en grande: aquí, el óptimo.
          result.overPar != null
            ? h('span', { class: 'chip' }, `🎯 ${t('common.optimalN', { n: result.optimal })}`)
            : h('span', { class: 'chip' }, `🧊 ${t('common.movesShort', { n: result.moves })}`),
          result.overPar == null ? h('span', { class: 'chip' }, `↺ ${result.retries}`) : null,
          result.hints ? h('span', { class: 'chip' }, `💡 ${result.hints}`) : null,
          h('span', { class: 'chip' }, `⏱ ${formatTime(result.timeMs)}`),
        ),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn', onclick: () => share(shareText(day, result)) }, t('common.share')),
          h('button', { class: 'btn ghost', onclick: () => showDailyResult(day, result) }, t('home.daily.details')),
        ),
        ...(canImprove(day, result) ? [h('button', { class: 'btn secondary block', onclick: () => improveDaily(day) }, `↺ ${t('home.daily.improve')}`)] : []),
        h('p', { class: 'muted', 'data-countdown': '' }),
      );
    } else if (record) {
      dailyCard.append(
        h('p', { class: 'muted' }, t('home.daily.inProgress'), ' ', h('strong', { 'data-elapsed': '' })),
        h('button', { class: 'btn big block', onclick: openDaily }, t('play.continue')),
      );
    } else {
      dailyCard.append(
        h('p', { class: 'muted' }, t('home.daily.pitch')),
        h('button', { class: 'btn big block', onclick: openDaily }, t('home.daily.play')),
      );
    }
    tick();
  }

  function tick() {
    const record = loadDaily(day);
    dailyCard.querySelector('[data-elapsed]')?.replaceChildren(formatTime(Date.now() - (record?.startedAt ?? Date.now())));
    dailyCard.querySelector('[data-countdown]')?.replaceChildren(t('home.daily.nextIn', { time: untilMidnight(DAILY_TIME_ZONE) }));
  }

  async function syncWithServer() {
    if (!online.onlineEnabled) return;
    // Todo a la vez: nada de esto depende de lo demás.
    void getFriendsOverview()
      .then(({ incoming }) => setFriendRequests(incoming.length))
      .catch(() => {});
    void getStats()
      .then((s) => {
        streak = { current: s.currentStreak, playedToday: s.playedToday, day };
        remember('streak', streak);
        if (!disposed) renderDaily();
      })
      .catch(() => {});
    void currentMe()
      .then((me) => {
        remember('me', me);
        wearHat(me.hat);
        // Primero la victoria de ayer y después los logros nuevos, nunca dos a la vez.
        return celebrateYesterday(me.name).then(() => (disposed || !me.name ? undefined : celebrateNewAchievements(wearHat)));
      })
      .catch(() => {});
    try {
      // El reto pudo jugarse en otro dispositivo.
      const server = await getDaily(day);
      const record = loadDaily(day);
      if (server?.finishedAt && !record?.pendingSubmit) {
        adoptServerResult(day, server, record);
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
        eyebrow: t('home.win.eyebrow', { day: formatDay(yesterday) }),
        title: t('home.win.title', { name }),
        text:
          wins.length === 1
            ? t('home.win.one', { league: first.leagueName, points: first.score ?? 0, friends: tn('common.friends', rivals) })
            : t('home.win.many', { n: wins.length, leagues: wins.map((w) => w.leagueName).join(', '), points: first.score ?? 0 }),
        button: t('home.win.button'),
      });
    } catch {
      // Sin conexión: se celebrará la próxima vez.
    }
  }

  const level = startingProgress().level;
  const guide = guideStatus(level === 1 && !loadDaily(day));
  // Quien ya jugaba ve un aviso cuando cambian las reglas.
  const news =
    guide === 'news'
      ? h(
          'section',
          { class: 'card news-card' },
          h('span', { class: 'news-icon', 'aria-hidden': 'true' }, NEWS.icon),
          h(
            'div',
            { class: 'info' },
            h('p', { class: 'eyebrow' }, t('home.news.eyebrow')),
            h('p', null, h('strong', null, t('news.title')), ` ${t('news.text')}`),
            h(
              'button',
              {
                class: 'link-btn',
                onclick: () => {
                  news?.remove();
                  openGuide(NEWS.page);
                },
              },
              t('home.news.howItWorks'),
            ),
          ),
          h(
            'button',
            {
              class: 'icon-btn small',
              'aria-label': t('common.close'),
              onclick: () => {
                dismissGuideNews();
                news?.remove();
              },
            },
            '✕',
          ),
        )
      : null;
  const el = h(
    'div',
    { class: 'screen home tab-screen' },
    h('header', { class: 'logo compact' }, logoPenguin, h('div', null, h('h1', null, 'Skid'), h('p', null, t('home.tagline')))),
    news,
    dailyCard,
    reactions?.el ?? null,
    weekly?.el ?? null,
    timeAttack?.el ?? null,
  );

  return {
    el: withTabs(el, 'home'),
    mount() {
      // Primera vez: se aprende jugando (el tutorial), antes de nada.
      if (guide === 'first') return go({ name: 'tutorial' });
      renderDaily();
      ticker = window.setInterval(tick, 1000);
      void syncWithServer();
      void weekly?.load();
      void timeAttack?.load();
      void reactions?.load();
    },
    dispose() {
      disposed = true;
      clearInterval(ticker);
    },
  };
}
