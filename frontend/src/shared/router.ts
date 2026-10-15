// Navegación entre pantallas. Cada pantalla es un elemento con ganchos opcionales
// para cuando ya está en el documento (mount) y cuando se sustituye (dispose).

import type { CustomLevel, CustomLevelSort } from '../features/community/api';
import type { DailyRecord } from '../features/daily/storage';
import type { WeeklyInfo } from '../features/weekly/api';
import type { Duel } from '../features/duels/api';
import type { TimeAttackStart } from '../features/timeattack/api';
import { updateTitle } from './meta';

export interface Screen {
  readonly el: HTMLElement;
  mount?(): void;
  dispose?(): void;
}

export type Route =
  | { name: 'home' }
  | { name: 'levels' }
  | { name: 'daily'; record: DailyRecord }
  | { name: 'solution'; day: string }
  | { name: 'ghost'; day: string; friendId: string }
  | { name: 'weekly'; info: WeeklyInfo }
  | { name: 'duels'; open?: string }
  | { name: 'duelRoom'; id: string }
  | { name: 'timeAttack'; start: TimeAttackStart; previousBest: number | null }
  | { name: 'duel'; duel: Duel }
  | { name: 'duelGhost'; duel: Duel }
  | { name: 'ranking'; join?: string }
  | { name: 'stats' }
  | { name: 'achievements' }
  | { name: 'player'; id: string }
  | { name: 'community'; tab?: CustomLevelSort; open?: string }
  | { name: 'editor' }
  | { name: 'custom'; level: CustomLevel }
  | { name: 'customTest'; rows: string[] }
  | { name: 'admin' };

type Renderers = { [N in Route['name']]: (route: Extract<Route, { name: N }>) => Screen };

let renderers: Renderers | null = null;
let current: Screen | null = null;
let currentName: Route['name'] | null = null;

/** La pantalla que se está viendo. */
export function currentRoute(): Route['name'] | null {
  return currentName;
}

export function setRoutes(r: Renderers): void {
  renderers = r;
}

export function go(route: Route): void {
  if (!renderers) throw new Error('Rutas sin registrar');
  const render = renderers[route.name] as (route: Route) => Screen;
  const screen = render(route);
  current?.dispose?.();
  document.querySelectorAll('.overlay').forEach((o) => o.remove());
  document.getElementById('app')!.replaceChildren(screen.el);
  current = screen;
  currentName = route.name;
  updateTitle(route.name);
  window.scrollTo(0, 0);
  screen.mount?.();
}
