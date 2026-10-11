import './style.css';
import { installAudio } from './audio/sound';
import { h } from './ui/dom';
import { customLevelScreen, dailyScreen, levelsScreen } from './ui/play';
import { communityScreen } from './ui/community';
import { editorScreen } from './ui/editor';
import { homeScreen } from './ui/home';
import { rankingScreen } from './ui/ranking';
import { statsScreen } from './ui/stats';
import { achievementsScreen } from './ui/achievements';
import { playerScreen } from './ui/player';
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
  player: (route) => playerScreen(route.id),
  community: (route) => communityScreen(route.tab, route.open),
  editor: () => editorScreen(),
  custom: (route) => customLevelScreen({ level: route.level }),
  customTest: (route) => customLevelScreen({ testRows: route.rows }),
});

snow();
installAudio();
await waitForFonts();

const params = new URLSearchParams(location.search);
const join = params.get('join');
const sharedLevel = params.get('nivel');
if (sharedLevel) {
  // El enlace solo abre el nivel una vez: al recargar se vuelve a la portada.
  history.replaceState(null, '', location.pathname);
  go({ name: 'community', open: sharedLevel });
} else go(join ? { name: 'ranking', join } : { name: 'home' });
