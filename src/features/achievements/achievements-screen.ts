// Logros y gorros: pantalla para ver el progreso y elegir gorro, y celebración
// de los logros recién desbloqueados.

import { HAT_NAMES, penguinSvg, type HatId } from '../../art/hats';
import { ACHIEVEMENTS } from '../../logic/achievements/achievements';
import * as online from '../../shared/api';
import { markAchievementsSeen, seenAchievements } from '../../shared/storage';
import { celebrate } from '../../shared/celebrate';
import { h, svg, toast } from '../../shared/dom';
import { setCachedHat } from '../profile/profile';
import { go, type Screen } from '../../shared/router';

export function achievementsScreen(): Screen {
  const subtitle = h('p');
  const body = h('div', { class: 'stats-body' }, h('p', { class: 'empty' }, 'Cargando…'));
  const el = h(
    'div',
    { class: 'screen' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: () => go({ name: 'home' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, 'Logros'), subtitle),
    ),
    body,
  );

  let data: online.Achievements | null = null;
  let disposed = false;

  async function load() {
    if (!online.onlineEnabled) {
      body.replaceChildren(h('section', { class: 'card empty' }, 'Los logros necesitan el ranking online.'));
      return;
    }
    try {
      data = await online.getAchievements();
      if (disposed) return;
      markAchievementsSeen(data.items.filter((i) => i.unlocked).map((i) => i.id)); // Ya los está viendo.
      render();
    } catch (err) {
      body.replaceChildren(
        h('section', { class: 'card empty' }, h('p', { class: 'error' }, (err as Error).message), h('button', { class: 'btn', onclick: load }, 'Reintentar')),
      );
    }
  }

  async function wear(hat: HatId | null) {
    if (!data) return;
    try {
      await online.setHat(hat);
      data = { ...data, hat };
      setCachedHat(hat);
      render();
      toast(hat ? `¡${HAT_NAMES[hat]} puesto!` : 'Sin gorro');
    } catch (err) {
      toast((err as Error).message);
    }
  }

  function render() {
    if (!data) return;
    const { hat, items } = data;
    const unlocked = items.filter((i) => i.unlocked).length;
    subtitle.textContent = `${unlocked} de ${items.length} desbloqueados`;

    body.replaceChildren(
      h(
        'section',
        { class: 'card wardrobe' },
        h('div', { class: 'wardrobe-penguin' }, svg(penguinSvg(hat))),
        h(
          'div',
          null,
          h('p', { class: 'eyebrow' }, 'Tu pingüino'),
          h('h2', null, hat ? HAT_NAMES[hat] : 'Sin gorro'),
          h('p', { class: 'muted' }, 'Tus amigos lo ven en el ranking.'),
          hat ? h('button', { class: 'link-btn', onclick: () => wear(null) }, 'Quitar gorro') : null,
        ),
      ),
      h(
        'ul',
        { class: 'achievements' },
        ...ACHIEVEMENTS.map((def) => {
          const p = items.find((i) => i.id === def.id)!;
          const wearing = hat === def.hat;
          return h(
            'li',
            { class: `card achievement ${p.unlocked ? 'unlocked' : 'locked'}` },
            h('div', { class: 'achievement-penguin' }, svg(penguinSvg(def.hat, { locked: !p.unlocked }))),
            h(
              'div',
              { class: 'achievement-info' },
              h('strong', null, def.name),
              h('span', { class: 'muted' }, def.description),
              p.unlocked
                ? h('small', null, `🎁 ${HAT_NAMES[def.hat]}`)
                : h(
                    'div',
                    { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': p.target, 'aria-valuenow': p.current },
                    h('div', { class: 'meter-fill', style: `width: ${(p.current / p.target) * 100}%` }),
                    h('span', null, `${p.current} / ${p.target}`),
                  ),
            ),
            p.unlocked
              ? wearing
                ? h('span', { class: 'chip wearing' }, '✓ Puesto')
                : h('button', { class: 'btn small secondary', onclick: () => wear(def.hat) }, 'Ponérmelo')
              : h('span', { class: 'lock', 'aria-label': 'Bloqueado' }, '🔒'),
          );
        }),
      ),
    );
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
  const { items } = await online.getAchievements();
  const seen = seenAchievements();
  const fresh = ACHIEVEMENTS.filter((def) => items.find((i) => i.id === def.id)?.unlocked && !seen.has(def.id));
  if (fresh.length === 0 || document.querySelector('.overlay')) return;
  markAchievementsSeen(fresh.map((d) => d.id));

  if (fresh.length > 2) {
    const goToAchievements = await celebrate({
      icon: '🎁',
      iconSvg: penguinSvg(fresh.at(-1)!.hat),
      eyebrow: '¡Logros nuevos!',
      title: `Has desbloqueado ${fresh.length} gorros`,
      text: fresh.map((d) => d.name).join(' · '),
      button: 'Ver mis gorros',
    });
    if (goToAchievements) go({ name: 'achievements' });
    return;
  }

  for (const def of fresh) {
    const wantsIt = await celebrate({
      icon: '🎁',
      iconSvg: penguinSvg(def.hat),
      eyebrow: '¡Logro nuevo!',
      title: def.name,
      text: `${def.description} Has desbloqueado: ${HAT_NAMES[def.hat]}.`,
      button: 'Ponérmelo',
    });
    if (wantsIt) {
      try {
        await online.setHat(def.hat);
        setCachedHat(def.hat);
        onHat(def.hat);
      } catch (err) {
        toast((err as Error).message);
      }
    }
  }
}
