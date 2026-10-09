// Navegación entre pantallas. Cada pantalla es un elemento con ganchos opcionales
// para cuando ya está en el documento (mount) y cuando se sustituye (dispose).

import type { DailyRecord } from '../services/storage';

export interface Screen {
  readonly el: HTMLElement;
  mount?(): void;
  dispose?(): void;
}

export type Route =
  | { name: 'home' }
  | { name: 'levels' }
  | { name: 'daily'; record: DailyRecord }
  | { name: 'ranking'; join?: string }
  | { name: 'stats' }
  | { name: 'achievements' }
  | { name: 'player'; id: string };

type Renderers = { [N in Route['name']]: (route: Extract<Route, { name: N }>) => Screen };

let renderers: Renderers | null = null;
let current: Screen | null = null;

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
  window.scrollTo(0, 0);
  screen.mount?.();
}
