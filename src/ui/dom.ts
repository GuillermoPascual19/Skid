// Utilidades pequeñas para construir la interfaz sin framework.

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/** Crea un elemento: h('button', { class: 'btn', onclick: fn }, 'Texto'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value as EventListener);
    else if (key in el) (el as unknown as Props)[key] = value;
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

export function append(parent: Element, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : String(child));
  }
}

/** Interpreta un trozo de SVG fijo (iconos propios, nunca texto del usuario). */
export function svg(markup: string): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild as SVGElement;
}

export interface Modal {
  readonly el: HTMLElement;
  close(): void;
}

/** Abre un modal centrado. `dismissable` permite cerrarlo pulsando fuera o con Escape. */
export function openModal(children: Child[], { dismissable = false, onClose }: { dismissable?: boolean; onClose?: () => void } = {}): Modal {
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' });
  append(modal, children);
  const overlay = h('div', { class: 'overlay' }, modal);

  const onKey = (e: KeyboardEvent) => {
    if (dismissable && e.key === 'Escape') close();
  };
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  if (dismissable) overlay.addEventListener('pointerdown', (e) => e.target === overlay && close());
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  // Con teclado, el foco va al primer control. En pantallas táctiles solo a los campos de texto
  // (enfocar un botón le pondría el borde de foco sin motivo).
  modal.querySelector<HTMLElement>(isTouch() ? 'input' : 'input, .btn')?.focus();
  return { el: modal, close };
}

export function toast(message: string): void {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 2500);
}

/** Comparte con el diálogo del sistema si existe; si no, copia al portapapeles. */
export async function share(text: string): Promise<void> {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado al portapapeles');
  } catch {
    toast('No se pudo copiar');
  }
}

// ------------------------------------------------------------------- Móvil

/** Pantalla táctil como entrada principal (móvil o tablet). */
export function isTouch(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

/** Vibración corta (solo Android; en iOS y escritorio no hace nada). */
export function haptic(pattern: number | number[]): void {
  try {
    if (isTouch()) navigator.vibrate?.(pattern);
  } catch {
    // Sin vibración.
  }
}

// ------------------------------------------------------------------ Formato

export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** "2026-10-06" -> "lunes, 6 de octubre". */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${day}T12:00:00Z`),
  );
}

/** Día anterior a "YYYY-MM-DD". */
export function previousDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Tiempo hasta la próxima medianoche de una zona horaria. */
export function untilMidnight(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    .formatToParts(now)
    .reduce<Record<string, number>>((acc, p) => (p.type === 'literal' ? acc : { ...acc, [p.type]: Number(p.value) }), {});
  const minutesLeft = 24 * 60 - (parts.hour * 60 + parts.minute);
  const hours = Math.floor(minutesLeft / 60);
  const minutes = minutesLeft % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// -------------------------------------------------------------------- Iconos

export function starSvg(filled: boolean): SVGElement {
  const fill = filled ? '#ffc93c' : '#d5e3ef';
  const stroke = filled ? '#e48f0c' : '#bccfdf';
  return svg(`
<svg viewBox="0 0 64 64" aria-hidden="true">
  <path d="M32 4l8.6 17.5 19.3 2.8-14 13.6 3.3 19.2L32 48l-17.2 9.1 3.3-19.2-14-13.6 19.3-2.8z"
        fill="${fill}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/>
  ${filled ? '<path d="M22 22l6-2" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>' : ''}
</svg>`);
}
