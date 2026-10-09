import './style.css';
import { h } from './ui/dom';
import { dailyScreen, levelsScreen } from './ui/play';
import { homeScreen } from './ui/home';
import { rankingScreen } from './ui/ranking';
import { statsScreen } from './ui/stats';
import { achievementsScreen } from './ui/achievements';
import { go, setRoutes } from './ui/router';

const FONT_FAMILY = '"Baloo 2"';

/** Copos de nieve decorativos (CSS); se ocultan con prefers-reduced-motion. */
function snow(): void {
  const container = document.getElementById('snow')!;
  for (let i = 0; i < 36; i++) {
    const size = 3 + Math.random() * 5;
    container.append(
      h('span', {
        class: 'flake',
        style: [
          `left:${Math.random() * 100}%`,
          `width:${size}px`,
          `height:${size}px`,
          `opacity:${0.4 + Math.random() * 0.5}`,
          `--drift:${(Math.random() - 0.5) * 120}px`,
          `animation-duration:${8 + Math.random() * 10}s`,
          `animation-delay:${-Math.random() * 18}s`,
        ].join(';'),
      }),
    );
  }
}

/** Phaser pinta los números en canvas: hay que esperar a la fuente o usaría la de reserva. */
async function waitForFonts(): Promise<void> {
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
  const fonts = Promise.all(['500', '600', '700', '800'].map((w) => document.fonts.load(`${w} 20px ${FONT_FAMILY}`)));
  await Promise.race([fonts, timeout]).catch(() => {});
}

setRoutes({
  home: () => homeScreen(),
  levels: () => levelsScreen(),
  daily: (route) => dailyScreen(route.record),
  ranking: (route) => rankingScreen(route),
  stats: () => statsScreen(),
  achievements: () => achievementsScreen(),
});

snow();
await waitForFonts();

const join = new URLSearchParams(location.search).get('join');
go(join ? { name: 'ranking', join } : { name: 'home' });
