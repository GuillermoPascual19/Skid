// Logros y gorros: pantalla para ver el progreso y elegir gorro, y celebración
// de los logros recién desbloqueados.

import { penguinSvg, type HatId } from '../../../../common/art/hats';
import { ACHIEVEMENT_MODES, ACHIEVEMENTS } from '../../../../common/logic/achievements/achievements';
import { SEASON_HATS, seasonOf, shiftSeason } from '../../../../common/logic/leagues/seasons';
import { today } from '../daily/daily';
import { monthName, seasonName } from '../ranking/season';
import * as online from '../../shared/api';
import { celebrate } from '../../shared/celebrate';
import { h, svg, toast } from '../../shared/dom';
import { setCachedHat } from '../profile/profile';
import { go, type Screen } from '../../shared/router';
import { type Achievements, type SeasonTitle, getAchievements, setHat } from './api';
import { markAchievementsSeen, seenAchievements } from './storage';
import { intlLocale, t } from '../../i18n/i18n';

export function achievementsScreen(): Screen {
  const subtitle = h('p');
  const body = h('div', { class: 'stats-body' }, h('p', { class: 'empty' }, t('common.loading')));
  const el = h(
    'div',
    { class: 'screen' },
    h(
      'header',
      { class: 'topbar' },
      h(
        'button',
        {
          class: 'icon-btn',
          'aria-label': t('common.back'),
          onclick: () => go({ name: 'home' }),
        },
        '←',
      ),
      h('div', { class: 'title' }, h('h1', null, t('nav.achievements')), subtitle),
    ),
    body,
  );

  let data: Achievements | null = null;
  let disposed = false;

  async function load() {
    if (!online.onlineEnabled) {
      body.replaceChildren(h('section', { class: 'card empty' }, t('achievementsScreen.needsOnline')));
      return;
    }
    try {
      data = await getAchievements();
      if (disposed) return;
      markAchievementsSeen(data.items.filter((i) => i.unlocked).map((i) => i.id)); // Ya los está viendo.
      render();
    } catch (err) {
      body.replaceChildren(
        h('section', { class: 'card empty' }, h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: load }, t('common.retry'))),
      );
    }
  }

  async function wear(hat: HatId | null) {
    if (!data) return;
    try {
      await setHat(hat);
      data = { ...data, hat };
      setCachedHat(hat);
      render();
      toast(hat ? t('achievementsScreen.wearing', { hat: t(`hats.${hat}`) }) : t('achievementsScreen.noHat'));
    } catch (err) {
      toast((err as Error).message);
    }
  }

  function render() {
    if (!data) return;
    const { hat, items, seasons } = data;
    const unlocked = items.filter((i) => i.unlocked).length;
    subtitle.textContent = t('achievementsScreen.unlocked', {
      n: unlocked,
      total: items.length,
    });

    body.replaceChildren(
      h(
        'section',
        { class: 'card wardrobe' },
        h('div', { class: 'wardrobe-penguin' }, svg(penguinSvg(hat))),
        h(
          'div',
          null,
          h('p', { class: 'eyebrow' }, t('achievementsScreen.yourPenguin')),
          h('h2', null, hat ? t(`hats.${hat}`) : t('achievementsScreen.noHat')),
          h('p', { class: 'muted' }, t('achievementsScreen.friendsSee')),
          hat ? h('button', { class: 'link-btn', onclick: () => wear(null) }, t('achievementsScreen.removeHat')) : null,
        ),
      ),
      ...ACHIEVEMENT_MODES.flatMap((mode) => [
        h('h2', { class: 'section-title' }, t(`achievementsScreen.mode.${mode}`)),
        h(
          'ul',
          { class: 'achievements' },
          ...ACHIEVEMENTS.filter((def) => def.mode === mode).map((def) => {
            const p = items.find((i) => i.id === def.id)!;
            return h(
              'li',
              {
                class: `card achievement ${p.unlocked ? 'unlocked' : 'locked'}`,
              },
              h('div', { class: 'achievement-penguin' }, svg(penguinSvg(def.hat, { locked: !p.unlocked }))),
              h(
                'div',
                { class: 'achievement-info' },
                h('strong', null, t(`achievements.${def.id}.name`)),
                h('span', { class: 'muted' }, t(`achievements.${def.id}.description`)),
                p.unlocked
                  ? h('small', null, `🎁 ${t(`hats.${def.hat}`)}`)
                  : h(
                      'div',
                      {
                        class: 'meter',
                        role: 'progressbar',
                        'aria-valuemin': 0,
                        'aria-valuemax': p.target,
                        'aria-valuenow': p.current,
                      },
                      h('div', {
                        class: 'meter-fill',
                        style: `width: ${(p.current / p.target) * 100}%`,
                      }),
                      h('span', null, `${p.current} / ${p.target}`),
                    ),
              ),
              p.unlocked
                ? wearButton(def.hat)
                : h(
                    'span',
                    {
                      class: 'lock',
                      'aria-label': t('achievementsScreen.locked'),
                    },
                    '🔒',
                  ),
            );
          }),
        ),
      ]),
      h('h2', { class: 'section-title' }, t('seasonHats.title')),
      h('p', { class: 'muted section-text' }, t('seasonHats.text')),
      h(
        'ul',
        { class: 'achievements' },
        ...SEASON_HATS.map((seasonHat, month) => {
          // Las veces que lo ganó (puede ser en varias ligas o años).
          const won = seasons.filter((s) => s.hat === seasonHat);
          return h(
            'li',
            { class: `card achievement ${won.length ? 'unlocked' : 'locked'}` },
            h('div', { class: 'achievement-penguin' }, svg(penguinSvg(seasonHat, { locked: won.length === 0 }))),
            h(
              'div',
              { class: 'achievement-info' },
              h('strong', null, t(`hats.${seasonHat}`)),
              won.length
                ? h('span', { class: 'muted season-titles' }, won.map((s) => `🏆 ${s.leagueName} · ${seasonName(s.season)}`).join('\n'))
                : h(
                    'span',
                    { class: 'muted' },
                    t('seasonHats.locked', {
                      month: monthName(`2026-${String(month + 1).padStart(2, '0')}`),
                    }),
                  ),
            ),
            won.length
              ? wearButton(seasonHat)
              : h(
                  'span',
                  {
                    class: 'lock',
                    'aria-label': t('achievementsScreen.locked'),
                  },
                  '🔒',
                ),
          );
        }),
      ),
    );

    function wearButton(item: HatId): HTMLElement {
      return hat === item
        ? h('span', { class: 'chip wearing' }, `✓ ${t('achievementsScreen.worn')}`)
        : h('button', { class: 'btn small secondary', onclick: () => wear(item) }, t('achievementsScreen.wear'));
    }
  }

  return {
    el,
    mount: () => void load(),
    dispose: () => {
      disposed = true;
    },
  };
}

/**
 * Celebra los logros desbloqueados que este navegador aún no ha visto. Se llama
 * al abrir la portada: así también salen los que se ganan al acabar una semana.
 * `onHat` se llama si el jugador se pone el gorro nuevo desde la celebración.
 */
export async function celebrateNewAchievements(onHat: (hat: HatId) => void): Promise<void> {
  if (!online.onlineEnabled) return;
  const { items, seasons } = await getAchievements();
  await celebrateSeasons(seasons, onHat);
  const seen = seenAchievements();
  const fresh = ACHIEVEMENTS.filter((def) => items.find((i) => i.id === def.id)?.unlocked && !seen.has(def.id));
  if (fresh.length === 0 || document.querySelector('.overlay')) return;
  markAchievementsSeen(fresh.map((d) => d.id));

  if (fresh.length > 2) {
    const goToAchievements = await celebrate({
      icon: '🎁',
      iconSvg: penguinSvg(fresh.at(-1)!.hat),
      eyebrow: t('achievementsScreen.newMany'),
      title: t('achievementsScreen.unlockedHats', { n: fresh.length }),
      text: fresh.map((d) => t(`achievements.${d.id}.name`)).join(' · '),
      button: t('achievementsScreen.seeHats'),
    });
    if (goToAchievements) go({ name: 'achievements' });
    return;
  }

  for (const def of fresh) {
    const wantsIt = await celebrate({
      icon: '🎁',
      iconSvg: penguinSvg(def.hat),
      eyebrow: t('achievementsScreen.newOne'),
      title: t(`achievements.${def.id}.name`),
      text: t('achievementsScreen.newOneText', {
        description: t(`achievements.${def.id}.description`),
        hat: t(`hats.${def.hat}`),
      }),
      button: t('achievementsScreen.wear'),
    });
    if (wantsIt) {
      try {
        await setHat(def.hat);
        setCachedHat(def.hat);
        onHat(def.hat);
      } catch (err) {
        toast((err as Error).message);
      }
    }
  }
}

/**
 * Celebra las temporadas que el jugador acaba de ganar (solo las del mes pasado:
 * en un dispositivo nuevo no salen las de hace un año).
 */
async function celebrateSeasons(seasons: SeasonTitle[], onHat: (hat: HatId) => void): Promise<void> {
  const last = shiftSeason(seasonOf(today()), -1);
  const seen = seenAchievements();
  const fresh = seasons.filter((s) => s.season === last && !seen.has(`season:${s.leagueId}:${s.season}`));
  if (fresh.length === 0 || document.querySelector('.overlay')) return;
  markAchievementsSeen(fresh.map((s) => `season:${s.leagueId}:${s.season}`));
  const wantsIt = await celebrate({
    icon: '🏆',
    iconSvg: penguinSvg(fresh[0].hat),
    eyebrow: t('season.won.eyebrow', { season: seasonName(last) }),
    title: t('season.won.title', {
      league: fresh.map((s) => s.leagueName).join(' · '),
    }),
    text: t('season.won.text', {
      points: fresh[0].points.toLocaleString(intlLocale()),
      hat: t(`hats.${fresh[0].hat}`),
      month: monthName(last),
    }),
    button: t('achievementsScreen.wear'),
  });
  if (!wantsIt) return;
  try {
    await setHat(fresh[0].hat);
    setCachedHat(fresh[0].hat);
    onHat(fresh[0].hat);
  } catch (err) {
    toast((err as Error).message);
  }
}
