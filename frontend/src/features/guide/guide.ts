// "Cómo se juega": guía de pocas páginas con las reglas de cada modo. Se abre
// sola la primera vez que se juega y siempre desde la portada (y desde el reto).

import { penguinSvg } from '../../../../common/art/hats';
import { elementSvg } from '../../../../common/art/elements';
import { ELEMENTS } from '../../../../common/logic/engine/elements';
import { GOLF } from '../../../../common/logic/daily/score';
import { FREEZE_EVERY, MAX_FREEZES } from '../../../../common/logic/daily/streaks';
import * as online from '../../shared/api';
import { h, openModal, starSvg, svg } from '../../shared/dom';
import { read, write } from '../../shared/storage';

/** Sube cuando cambian las reglas o hay algo nuevo (ver NEWS): quien ya jugaba ve el aviso. */
export const GUIDE_VERSION = 4;
const GUIDE_SEEN_KEY = 'skid.guide.v1';

export type GuidePage = 'slide' | 'pieces' | 'free' | 'daily' | 'weekly' | 'duels' | 'leagues' | 'elements' | 'community';

/** Aviso de la portada para quien ya jugaba: lo último que ha cambiado (sube GUIDE_VERSION al cambiarlo). */
export const NEWS = {
  icon: '⚔️',
  title: 'Nuevo: duelos.',
  text: 'Reta a un amigo (o a quien quieras con un enlace) al mismo tablero y gana quien lo haga en menos golpes.',
  page: 'duels' as GuidePage,
};

interface Page {
  readonly id: GuidePage;
  readonly title: string;
  body(): HTMLElement[];
}

const rules = (...items: [string, string][]) =>
  h('ul', { class: 'rules' }, ...items.map(([icon, text]) => h('li', null, h('b', null, icon), h('span', null, text))));

type DemoCell = 'ice' | 'wall' | { coin: number; collect?: boolean };

/** Fila de casillas de hielo con el pingüino deslizando (animado con CSS) de `at` a `slideTo`. */
function demoRow(cells: DemoCell[], penguin: { at: number; slideTo?: number }): HTMLElement {
  const row = h('div', { class: 'guide-demo', style: `--cols:${cells.length}` });
  for (const c of cells) {
    row.append(
      typeof c === 'object'
        ? h('span', { class: 'cell ice' }, h('span', { class: `coin${c.coin === 1 ? ' next' : ''}${c.collect ? ' collect' : ''}` }, String(c.coin)))
        : h('span', { class: `cell ${c}` }),
    );
  }
  const p = h('span', { class: `guide-penguin${penguin.slideTo !== undefined ? ' sliding' : ''}` }, svg(penguinSvg()));
  p.style.setProperty('--from', String(penguin.at));
  p.style.setProperty('--to', String(penguin.slideTo ?? penguin.at));
  row.append(p);
  return row;
}

const PAGES: Page[] = [
  {
    id: 'slide',
    title: 'Desliza sobre el hielo',
    body: () => [
      demoRow(['ice', 'ice', 'ice', 'ice', 'ice', 'wall'], { at: 0, slideTo: 4 }),
      rules(
        ['🐧', 'El pingüino no frena: sigue deslizando hasta chocar con la nieve o un muro.'],
        ['⌨️', 'Muévete con las flechas o WASD. En el móvil, desliza el dedo en cualquier parte.'],
      ),
    ],
  },
  {
    id: 'pieces',
    title: 'Recoge en orden',
    body: () => [
      demoRow(['ice', { coin: 1, collect: true }, 'ice', { coin: 2 }, 'ice', { coin: 3 }], { at: 0, slideTo: 2 }),
      rules(
        ['🔢', 'Recoge las piezas en orden: 1, 2, 3… La que toca brilla. Al cogerla sigues deslizando.'],
        ['🪙', 'Las piezas que aún no tocan hacen de muro: el pingüino choca y se para delante.'],
        ['🧊', 'Si te quedas sin salida, te avisamos: vuelve a empezar con ↺.'],
      ),
    ],
  },
  {
    id: 'free',
    title: 'Modo libre',
    body: () => [
      h('div', { class: 'guide-stars' }, starSvg(true), starSvg(true), starSvg(true)),
      rules(
        ['⭐', 'Tres estrellas si lo haces con los movimientos justos (el óptimo); dos si te pasas en 1 o 2; una si te pasas más.'],
        ['📈', 'Cada nivel es un poco más difícil, y cada cierto tiempo aparecen elementos nuevos.'],
        ['💡', 'Si te atascas, la bombilla te dice el siguiente movimiento.'],
      ),
    ],
  },
  {
    id: 'elements',
    title: 'Elementos del tablero',
    body: () => [
      h(
        'div',
        { class: 'guide-elements' },
        ...ELEMENTS.map((e) =>
          h(
            'div',
            { class: 'guide-element' },
            h('span', { class: 'icon' }, svg(elementSvg(e.id))),
            h('span', null, h('strong', null, e.name), h('small', null, `Desde el nivel ${e.level}`), h('span', null, e.description)),
          ),
        ),
      ),
    ],
  },
  {
    id: 'daily',
    title: 'Reto diario: estilo golf',
    body: () => [
      h(
        'div',
        { class: 'guide-golf' },
        h('div', null, h('span', null, 'Óptimo del día'), h('strong', null, '12 golpes')),
        h('div', null, h('span', null, 'Lo haces en 12'), h('strong', { class: 'par' }, 'Par')),
        h('div', null, h('span', null, 'Lo haces en 14'), h('strong', null, '+2')),
        h('div', null, h('span', null, 'En 12, con 1 pista'), h('strong', null, '+1')),
      ),
      rules(
        ['🎯', 'Un tablero nuevo cada día, el mismo para todos. Cada movimiento es un golpe.'],
        ['↺', 'Volver a empezar es gratis y cuenta tu mejor intento. Puedes mejorarlo todo el día.'],
        ['💡', 'Cada pista suma un golpe.'],
        ['⏱', 'El reloj no se para. A igualdad de golpes, gana quien tarda menos.'],
        ['👀', 'Al terminar puedes ver la solución, pero entonces ya no puedes mejorar.'],
      ),
    ],
  },
  {
    id: 'weekly',
    title: 'Reto semanal',
    body: () => [
      rules(
        ['🗺️', 'Un tablero más grande y difícil, de lunes a domingo, el mismo para todos.'],
        ['↺', 'Juega cuantas veces quieras durante la semana: cuenta tu mejor intento.'],
        ['🚫', 'Sin pistas.'],
        ['🏆', 'Ranking con tus amigos de todas tus ligas. A igualdad de golpes, gana quien lo consiguió antes.'],
      ),
    ],
  },
  {
    id: 'duels',
    title: 'Duelos',
    body: () => [
      rules(
        ['⚔️', 'Reta a un amigo de tus ligas, o a cualquiera con un enlace. Eliges la dificultad.'],
        ['🗺️', 'Un tablero nuevo que ninguno ha visto, el mismo para los dos.'],
        ['↺', 'Juega cuantas veces quieras y, cuando te guste tu marca, entrégala. Sin pistas.'],
        ['🙈', 'No ves la marca del otro hasta que los dos entregáis (o pasan 48 h).'],
        ['🏆', 'Gana quien tenga menos golpes; a igualdad, quien tardó menos. Luego podéis ver el duelo con el fantasma y pedir la revancha.'],
      ),
    ],
  },
  {
    id: 'leagues',
    title: 'Ligas, rachas y gorros',
    body: () => [
      rules(
        ['🏆', 'Crea una liga y pasa el código a tus amigos: veréis quién gana el reto cada día.'],
        ['📅', `Clasificación semanal y mensual: cada reto da ${GOLF.parPoints} puntos al par y ${GOLF.perStroke} menos por golpe de más.`],
        ['🔥', 'Juega el reto varios días seguidos para hacer racha.'],
        ['🛡️', `Cada ${FREEZE_EVERY} días seguidos ganas un protector (hasta ${MAX_FREEZES}): si un día no juegas, tu racha no se rompe.`],
        ['🎩', 'Los logros desbloquean gorros para tu pingüino.'],
      ),
    ],
  },
  {
    id: 'community',
    title: 'Niveles de jugadores',
    body: () => [
      rules(
        ['✏️', 'Crea tus propios niveles con el editor, con los elementos que ya has desbloqueado.'],
        ['✅', 'Para publicar un nivel tienes que superarlo antes.'],
        ['⭐', 'Juega los de los demás y valóralos de 1 a 5 estrellas.'],
        ['🔗', 'Comparte un nivel por enlace, o denúncialo si no es apropiado.'],
      ),
    ],
  },
];

/** Las páginas que tienen sentido aquí (sin servidor no hay reto semanal, ligas ni niveles de jugadores). */
function pages(): Page[] {
  return PAGES.filter((p) => online.onlineEnabled || !['weekly', 'duels', 'leagues', 'community'].includes(p.id));
}

/** Abre la guía, en la página indicada. */
export function openGuide(start: GuidePage = 'slide'): void {
  write(GUIDE_SEEN_KEY, GUIDE_VERSION);
  const list = pages();
  let index = Math.max(0, list.findIndex((p) => p.id === start));

  const eyebrow = h('p', { class: 'eyebrow' });
  const title = h('h2');
  const content = h('div', { class: 'guide-page' });
  const dots = h('div', { class: 'guide-dots' }, ...list.map((p, i) => h('button', { 'aria-label': p.title, onclick: () => show(i) })));
  const back = h('button', { class: 'btn ghost', onclick: () => show(index - 1) }, 'Atrás');
  const next = h('button', { class: 'btn', onclick: () => (index === list.length - 1 ? modal.close() : show(index + 1)) });

  function show(i: number) {
    index = Math.min(list.length - 1, Math.max(0, i));
    const page = list[index];
    eyebrow.textContent = `Cómo se juega · ${index + 1}/${list.length}`;
    title.textContent = page.title;
    content.replaceChildren(...page.body());
    [...dots.children].forEach((d, j) => d.classList.toggle('on', j === index));
    back.disabled = index === 0;
    next.textContent = index === list.length - 1 ? '¡A jugar!' : 'Siguiente';
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') show(index + 1);
    if (e.key === 'ArrowLeft') show(index - 1);
  };
  document.addEventListener('keydown', onKey);
  const modal = openModal([eyebrow, title, content, dots, h('div', { class: 'row' }, back, next)], {
    dismissable: true,
    onClose: () => document.removeEventListener('keydown', onKey),
  });
  modal.el.classList.add('guide');
  show(index);
}

/** Qué hacer al entrar en la portada: guía completa la primera vez, aviso si hay reglas nuevas. */
export function guideStatus(isNewPlayer: boolean): 'first' | 'news' | 'seen' {
  const seen = read<number>(GUIDE_SEEN_KEY);
  if (seen === null) return isNewPlayer ? 'first' : 'news';
  return seen < GUIDE_VERSION ? 'news' : 'seen';
}

/** Marca la guía como vista sin abrirla (al cerrar el aviso de novedades). */
export function dismissGuideNews(): void {
  write(GUIDE_SEEN_KEY, GUIDE_VERSION);
}
