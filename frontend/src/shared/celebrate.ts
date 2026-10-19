// Celebración: pop-up que sale del centro de la pantalla con confeti.
// Se usa al superar los niveles 25, 50, 75 y 100, y al ganar el reto del día anterior.

import { sfx } from '../audio/sound';
import { h, haptic, openModal, svg } from './dom';
import { t } from '../i18n/i18n';

const CONFETTI_COLORS = ['#ffc93c', '#ff7a45', '#2b8fd6', '#2bb673', '#ff8fa3', '#a78bfa', '#ffffff'];

export interface Celebration {
  /** Emoji grande que corona el pop-up. */
  readonly icon: string;
  /** En lugar del emoji, un dibujo SVG propio (p. ej. el pingüino con su gorro nuevo). */
  readonly iconSvg?: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly text: string;
  readonly button?: string;
}

/** Muestra la celebración. Se resuelve al cerrarla: true si se pulsó el botón. */
export function celebrate(c: Celebration): Promise<boolean> {
  return new Promise((resolve) => {
    let confirmed = false;
    confetti(); // Sigue cayendo y se desvanece sola aunque se cierre el pop-up.
    haptic([40, 60, 40, 60, 80]);
    sfx.fanfare();
    const modal = openModal(
      [
        h('div', { class: `celebrate-icon ${c.iconSvg ? 'svg' : ''}`, 'aria-hidden': 'true' }, c.iconSvg ? svg(c.iconSvg) : c.icon),
        h('p', { class: 'eyebrow' }, c.eyebrow),
        h('h2', null, c.title),
        h('p', { class: 'lead' }, c.text),
        h('button', { class: 'btn big block', onclick: () => ((confirmed = true), modal.close()) }, c.button ?? t('common.great')),
      ],
      {
        dismissable: true,
        onClose: () => resolve(confirmed),
      },
    );
    modal.el.classList.add('celebrate');
  });
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  /** 0 = rectángulo, 1 = círculo. */
  shape: number;
  /** Fase del aleteo (el papel gira y se ve más ancho o más estrecho). */
  flip: number;
}

/**
 * Lanza confeti desde el centro de la pantalla en un canvas encima de todo.
 * Devuelve una función para pararlo antes de tiempo. Con "reducir movimiento"
 * activado en el sistema no hace nada.
 */
export function confetti(): () => void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};

  const canvas = h('canvas', { class: 'confetti', 'aria-hidden': 'true' });
  document.body.append(canvas);
  const ctx = canvas.getContext('2d')!;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  const particles: Particle[] = [];
  const burst = (count: number, power: number) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.45;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = power * (0.35 + Math.random() * 0.65);
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - power * 0.45,
        size: 6 + Math.random() * 7,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.4,
        shape: Math.random() < 0.25 ? 1 : 0,
        flip: Math.random() * Math.PI * 2,
      });
    }
  };

  // Una explosión grande y dos más pequeñas, como fuegos artificiales.
  const scale = Math.min(1.4, Math.max(0.8, window.innerWidth / 500));
  burst(160, 17 * scale);
  const timers = [setTimeout(() => burst(70, 13 * scale), 350), setTimeout(() => burst(70, 13 * scale), 800)];

  let frame = 0;
  let last = performance.now();
  const started = last;
  const tick = (now: number) => {
    const dt = Math.min(2, (now - last) / 16.67); // En "fotogramas de 60 fps".
    last = now;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    const fade = Math.max(0, Math.min(1, (5200 - (now - started)) / 1200));

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vx *= 0.985 ** dt;
      p.vy = p.vy * 0.985 ** dt + 0.32 * dt; // Rozamiento del aire y gravedad.
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      p.flip += 0.12 * dt;
      if (p.y > window.innerHeight + 40) {
        particles.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.scale(1, Math.abs(Math.cos(p.flip)) * 0.8 + 0.2);
      ctx.fillStyle = p.color;
      if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }

    if (fade > 0 && (particles.length > 0 || now - started < 900)) frame = requestAnimationFrame(tick);
    else stop();
  };
  frame = requestAnimationFrame(tick);

  let stopped = false;
  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    timers.forEach(clearTimeout);
    window.removeEventListener('resize', resize);
    canvas.remove();
  }
  return stop;
}
