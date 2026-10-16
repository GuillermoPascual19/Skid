import './style.css';
import { installAudio } from './audio/sound';
import { formatDay, h } from './shared/dom';
import { dailyLevel } from '../../common/logic/daily/daily';
import { getGhost } from './features/daily/api';
import { levelsScreen } from './features/free-play/free-play-screen';
import { dailyScreen } from './features/daily/daily-screen';
import { solutionScreen } from './features/daily/solution-screen';
import { ghostScreen } from './features/daily/ghost-screen';
import { weeklyScreen } from './features/weekly/weekly-screen';
import { duelsScreen } from './features/duels/duels-screen';
import { difficultyLabel } from './features/duels/duels';
import { duelRoomScreen } from './features/duels/duel-room';
import { refreshPush, registerServiceWorker } from './features/notifications/notifications';
import { watchForUpdates } from './shared/update';
import { watchConnection } from './shared/connection';
import { updateDescription } from './shared/meta';
import { startAnalytics } from './shared/analytics';
import { installErrorReporting } from './shared/errors';
import { timeAttackScreen } from './features/timeattack/timeattack-screen';
import { duelPlayScreen } from './features/duels/duel-play';
import { getDuelGhost } from './features/duels/api';
import { customLevelScreen } from './features/community/play-screen';
import { communityScreen } from './features/community/community-screen';
import { editorScreen } from './features/community/editor-screen';
import { homeScreen } from './features/home/home-screen';
import { rankingScreen } from './features/ranking/ranking-screen';
import { statsScreen } from './features/daily/stats-screen';
import { achievementsScreen } from './features/achievements/achievements-screen';
import { playerScreen } from './features/profile/player-screen';
import { adminScreen } from './features/admin/admin-screen';
import { friendsScreen } from './features/friends/friends-screen';
import { tutorialScreen } from './features/guide/tutorial';
import { playTab } from './features/tabs/play-tab';
import { meTab } from './features/tabs/me-tab';
import { go, setRoutes } from './shared/router';
import { applyTheme } from './shared/theme';
import { initI18n, t } from './i18n/i18n';

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

setRoutes({
  home: () => homeScreen(),
  levels: () => levelsScreen(),
  daily: (route) => dailyScreen(route.record),
  solution: (route) => solutionScreen(route.day),
  ghost: (route) =>
    ghostScreen({
      subtitle: t('ghost.dailySubtitle', { day: formatDay(route.day) }),
      rows: dailyLevel(route.day).rows,
      load: () => getGhost(route.day, route.friendId),
      back: { label: t('nav.ranking'), route: { name: 'ranking' } },
    }),
  weekly: (route) => weeklyScreen(route.info),
  duels: (route) => duelsScreen(route.open),
  duelRoom: (route) => duelRoomScreen(route.id),
  timeAttack: (route) => timeAttackScreen(route.start, route.previousBest),
  duel: (route) => duelPlayScreen(route.duel),
  duelGhost: (route) =>
    ghostScreen({
      subtitle: t('ghost.duelSubtitle', { difficulty: difficultyLabel(route.duel.difficulty) }),
      rows: route.duel.rows,
      load: () => getDuelGhost(route.duel.id),
      back: { label: t('nav.duels'), route: { name: 'duels' } },
    }),
  ranking: (route) => rankingScreen(route),
  stats: () => statsScreen(),
  achievements: () => achievementsScreen(),
  player: (route) => playerScreen(route.id),
  community: (route) => communityScreen(route.tab, route.open),
  editor: () => editorScreen(),
  custom: (route) => customLevelScreen({ level: route.level }),
  customTest: (route) => customLevelScreen({ testRows: route.rows }),
  admin: () => adminScreen(),
  friends: (route) => friendsScreen(route.add),
  tutorial: () => tutorialScreen(),
  play: () => playTab(),
  me: () => meTab(),
});

// Lo primero: así también se avisa de los errores al arrancar.
installErrorReporting();

applyTheme();
await initI18n(); // Antes de pintar nada: todos los textos salen del idioma elegido.
updateDescription();
snow();
installAudio();

const params = new URLSearchParams(location.search);
const join = params.get('join');
const sharedLevel = params.get('nivel');
const duelLink = params.get('duelo');
const friendLink = params.get('amigo');
const friendsLink = params.has('amigos');
if (duelLink) {
  // A la sala del duelo, que deja el enlace puesto mientras se está en ella: si
  // el móvil recarga la página (al volver de WhatsApp), se vuelve a la sala.
  go({ name: 'duelRoom', id: duelLink });
} else if (friendsLink) {
  // Desde un aviso de amistad: a la pantalla de amigos.
  history.replaceState(null, '', location.pathname);
  go({ name: 'friends' });
} else if (friendLink) {
  // Enlace de amigo: se pregunta si añadirlo, y al recargar ya no se vuelve a preguntar.
  history.replaceState(null, '', location.pathname);
  go({ name: 'friends', add: friendLink });
} else if (sharedLevel) {
  // El enlace solo abre el nivel una vez: al recargar se vuelve a la portada.
  history.replaceState(null, '', location.pathname);
  go({ name: 'community', open: sharedLevel });
} else go(join ? { name: 'ranking', join } : { name: 'home' });

// Notificaciones: el service worker que las recibe y, si están activadas, la suscripción al día.
registerServiceWorker();
void refreshPush();

// Si se despliega una versión nueva mientras la app está abierta, se recarga (o se avisa).
watchForUpdates();

// Sin conexión: un aviso arriba (el modo libre sigue funcionando).
watchConnection();

// Analíticas sin cookies, si están configuradas.
void startAnalytics();
