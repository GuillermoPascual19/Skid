// Worker de Cloudflare: sirve el juego (archivos estáticos de dist/) y la API
// en /api/*. Aquí solo se enruta: cada apartado está en routes/, la sesión en
// session.ts y las utilidades comunes en http.ts.
//
// El servidor no se fía del cliente: al terminar una partida, el navegador manda
// el registro de movimientos y aquí se reproduce con la misma lógica del juego
// (common/logic) para calcular movimientos, reintentos, tiempo y puntuación.

import { unlockedHats } from '../../common/logic/achievements/achievements';
import { isHatId } from '../../common/art/hats';
import { type Env, HttpError, type Session, body, cleanText, json } from './http';
import { errorMessage, requestLocale } from './i18n';
import { playerAchievements } from './routes/achievements';
import { finishRun, getRun, ghostRuns, startRun } from './routes/daily';
import { finishWeekly, getWeekly, startWeekly, weeklyRanking } from './routes/weekly';
import {
  finishTimeAttackBoard,
  skipTimeAttackBoard,
  startTimeAttack,
  timeAttackRanking,
  timeAttackResult,
  timeAttackSummary,
} from './routes/timeattack';
import { acceptDuel, createDuel, declineDuel, duelGhost, finishDuel, getDuel, here, listDuels, listFriends, setReady } from './routes/duels';
import { createLeague, dailyWins, joinLeague, kickMember, leagueInvite, leagueRanking, leagueStandings, leaveLeague, myLeagues, newLeagueCode } from './routes/leagues';
import {
  createCustomLevel,
  customLevelRanking,
  deleteCustomLevel,
  finishCustomLevel,
  getCustomLevel,
  listCustomLevels,
  rateCustomLevel,
  likeCustomLevel,
  saveCustomLevel,
  featuredCustomLevel,
  reportCustomLevel,
} from './routes/levels';
import { playerProfile } from './routes/players';
import { globalRanking, globalTitles, setGlobalVisible, settleGlobalSeasons } from './routes/global';
import { leagueSeason, seasonHats, seasonTitles, settleSeasons } from './routes/seasons';
import { newReactions, react } from './routes/reactions';
import { deleteSubscription, pushKey, saveSubscription, streakReminders, testPush } from './routes/push';
import { playerStats } from './routes/stats';
import { logClientError } from './routes/errors';
import { acceptFriend, addByLink, dropRequest, friendLink, friendsOverview, removeFriend, requestFriend } from './routes/friends';
import { adminClearReports, adminDeleteLevel, adminFeatureLevel, adminLevels, adminPlayers, adminResetName, adminSummary, isAdmin } from './routes/admin';
import { authenticate, createSession, deleteAccount, googleLogin, logoutEverywhere, sealLegacyEmails, sessionCookie } from './session';
import { turnstileSiteKey } from './turnstile';
import { unseal } from './seal';
import { NAME_ERRORS, nameKey, nameProblem, NAME_MAX, NAME_MIN } from '../../common/logic/players/names';

export default {
  async fetch(req, rawEnv, ctx): Promise<Response> {
    const url = new URL(req.url);
    // Siempre por HTTPS (en workers.dev no hay ajuste para forzarlo). En local, no.
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }
    if (!url.pathname.startsWith('/api/')) return rawEnv.ASSETS.fetch(req);
    // Las notificaciones se envían después de responder, sin que el jugador espere.
    const env: Env = { ...rawEnv, waitUntil: (task) => ctx.waitUntil(task) };
    try {
      return await handleApi(req, url, env);
    } catch (err) {
      return errorResponse(req, err);
    }
  },

  /** Tarea programada de cada tarde (wrangler.jsonc): el recordatorio de racha. */
  async scheduled(_event, env, ctx): Promise<void> {
    ctx.waitUntil(streakReminders(env).then((n) => console.log(`recordatorios de racha: ${n}`)));
    // Y de paso, se cifran los emails que quedaran en claro de antes.
    ctx.waitUntil(sealLegacyEmails(env).then((n) => n && console.log(`emails cifrados: ${n}`)));
  },
} satisfies ExportedHandler<Env>;

/** El error de una ruta como respuesta JSON, en el idioma del jugador. */
function errorResponse(req: Request, err: unknown): Response {
  if (err instanceof HttpError) return json({ error: errorMessage(requestLocale(req), err.key, err.params), code: err.key }, err.status);
  console.error(err);
  return json({ error: errorMessage(requestLocale(req), 'internal'), code: 'internal' }, 500);
}

/** Lecturas como mucho en un lote (lo que pide la portada de una vez, con margen). */
const MAX_BATCH = 12;

/**
 * Varias lecturas (GET) en una sola petición: /batch?p=/me&p=/stats… La sesión
 * y el límite de peticiones se comprueban una vez; cada lectura pasa por su ruta
 * de siempre (con sus permisos) y su resultado va aparte, con su código HTTP: si
 * una falla, las demás llegan igual. El juego agrupa solo las lecturas que salen
 * a la vez (frontend/src/shared/api.ts).
 */
async function batch(req: Request, url: URL, env: Env, session: Session) {
  const paths = url.searchParams.getAll('p');
  if (paths.length === 0 || paths.length > MAX_BATCH) throw new HttpError(400, 'invalidBody');
  const entries = await Promise.all(
    paths.map(async (path) => {
      // Solo rutas de la API con su consulta, y nada de lotes dentro de lotes.
      if (!/^\/[\w\-/.]*(\?[\w\-=&%.]*)?$/.test(path) || path.length > 200 || path.startsWith('/batch')) {
        return [path, { status: 400, data: { error: errorMessage(requestLocale(req), 'invalidBody'), code: 'invalidBody' } }] as const;
      }
      const subUrl = new URL(`/api${path}`, url);
      const subReq = new Request(subUrl, { method: 'GET', headers: req.headers });
      let res: Response;
      try {
        res = await authedApi(subReq, subUrl, env, session);
      } catch (err) {
        res = errorResponse(subReq, err);
      }
      return [path, { status: res.status, data: await res.json() }] as const;
    }),
  );
  return { results: Object.fromEntries(entries) };
}

/** Solicitudes y enlaces de amigo: el mismo límite que unirse a ligas (evita ir probando nombres). */
async function friendLimit(env: Env, playerId: string): Promise<void> {
  const { success } = await env.JOIN_RATE_LIMITER.limit({ key: `friends:${playerId}` });
  if (!success) throw new HttpError(429, 'tooManyRequests');
}

/** La respuesta con la cookie de sesión puesta (o borrada, con token null). */
function withSession(res: Response, url: URL, token: string | null): Response {
  res.headers.append('Set-Cookie', sessionCookie(url, token));
  return res;
}

/**
 * Las peticiones que cambian algo solo valen desde el propio juego: además de
 * SameSite en la cookie, se mira de dónde vienen. En local, cualquier localhost
 * (el servidor de Vite va en otro puerto).
 */
function sameOrigin(req: Request, url: URL): boolean {
  const origin = req.headers.get('Origin');
  if (!origin || origin === url.origin) return true;
  const local = (host: string) => host === 'localhost' || host === '127.0.0.1';
  try {
    return local(url.hostname) && local(new URL(origin).hostname);
  } catch {
    return false;
  }
}

async function handleApi(req: Request, url: URL, env: Env): Promise<Response> {
  const route = `${req.method} ${url.pathname.replace(/^\/api/, '')}`;
  if (req.method !== 'GET' && !sameOrigin(req, url)) throw new HttpError(403, 'forbiddenOrigin');

  if (route === 'POST /session') {
    // El token va solo en la cookie: el juego nunca lo ve.
    const { turnstile } = await optionalBody<{ turnstile?: unknown }>(req);
    const { token } = await createSession(req, env, turnstile);
    return withSession(json({ ok: true }), url, token);
  }
  if (route === 'POST /errors') return logClientError(req, env);
  if (route === 'GET /config') {
    return json({ googleClientId: env.GOOGLE_CLIENT_ID || null, analyticsToken: env.CF_ANALYTICS_TOKEN || null, turnstileSiteKey: turnstileSiteKey(env) });
  }

  const session = await authenticate(req, url, env);
  // Límite general por jugador: de sobra para jugar, corta los scripts que machacan la API.
  if (!(await env.API_RATE_LIMITER.limit({ key: session.playerId })).success) throw new HttpError(429, 'tooManyRequests');
  const res = route === 'GET /batch' ? json(await batch(req, url, env, session)) : await authedApi(req, url, env, session);
  // Las rutas que cambian de sesión ya ponen (o borran) su cookie.
  return session.renew && !res.headers.has('Set-Cookie') ? withSession(res, url, session.token) : res;
}

/** Como body(), pero un cuerpo vacío vale como {} (los juegos de antes crean la sesión sin cuerpo). */
async function optionalBody<T extends object>(req: Request): Promise<Partial<T>> {
  if (Number(req.headers.get('Content-Length') ?? 0) === 0 && !req.headers.get('Content-Type')) return {};
  return body<Partial<T>>(req);
}

/** Las rutas que necesitan sesión (ya comprobada, igual que el límite de peticiones). */
async function authedApi(req: Request, url: URL, env: Env, session: Session): Promise<Response> {
  const route = `${req.method} ${url.pathname.replace(/^\/api/, '')}`;
  const { playerId } = session;
  let m: RegExpMatchArray | null;

  if (route === 'POST /auth/google') {
    const { credential } = await body<{ credential?: unknown }>(req);
    const { token, ...result } = await googleLogin(env, session, credential);
    // Si este dispositivo pasa a ser otro jugador, su sesión nueva va en la cookie.
    return token ? withSession(json(result), url, token) : json(result);
  }
  if (route === 'POST /auth/logout') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash).run();
    return withSession(json({ ok: true }), url, null);
  }
  if (route === 'POST /auth/logout-all') return withSession(json(await logoutEverywhere(env, session)), url, null);
  if (route === 'DELETE /me') {
    // Se pide la palabra exacta: que no se borre una cuenta por una llamada equivocada.
    const { confirm } = await body<{ confirm?: unknown }>(req);
    if (confirm !== 'BORRAR') throw new HttpError(400, 'missingConfirmation');
    return withSession(json(await deleteAccount(env, session)), url, null);
  }

  if (route === 'GET /me') {
    const row = await env.DB.prepare('SELECT name, email, hat, hide_global FROM players WHERE id = ?')
      .bind(playerId)
      .first<{ name: string | null; email: string | null; hat: string | null; hide_global: number }>();
    return json({
      name: row?.name ?? null,
      email: await unseal(env.EMAIL_KEY, row?.email ?? null),
      hat: isHatId(row?.hat) ? row.hat : null,
      admin: await isAdmin(env, playerId),
      globalRanking: row?.hide_global !== 1,
    });
  }
  if (route === 'GET /achievements') {
    // Al abrir la portada se piden los logros: así se cierran las temporadas del mes pasado.
    await Promise.all([settleSeasons(env, playerId), settleGlobalSeasons(env)]);
    const [items, seasons, global, row] = await Promise.all([
      playerAchievements(env, playerId),
      seasonTitles(env, playerId),
      globalTitles(env, playerId),
      env.DB.prepare('SELECT hat FROM players WHERE id = ?').bind(playerId).first<{ hat: string | null }>(),
    ]);
    return json({ hat: isHatId(row?.hat) ? row.hat : null, items, seasons, global });
  }
  if (route === 'PUT /me/hat') {
    const { hat } = await body<{ hat?: unknown }>(req);
    if (hat !== null && !isHatId(hat)) throw new HttpError(400, 'unknownHat');
    if (hat !== null) {
      // De un logro, de una temporada de liga o del podio del ranking global.
      const owned =
        unlockedHats(await playerAchievements(env, playerId)).has(hat) ||
        (await seasonHats(env, playerId)).has(hat) ||
        (await globalTitles(env, playerId)).some((title) => title.hat === hat);
      if (!owned) throw new HttpError(403, 'hatLocked');
    }
    await env.DB.prepare('UPDATE players SET hat = ? WHERE id = ?').bind(hat, playerId).run();
    return json({ hat });
  }
  if (route === 'PUT /me/global') {
    const { visible } = await body<{ visible?: unknown }>(req);
    return json(await setGlobalVisible(env, playerId, visible));
  }
  if ((m = route.match(/^GET \/ranking\/global\/(month|all)$/))) return json(await globalRanking(env, playerId, m[1]));
  if (route === 'PUT /me') {
    const { name } = await body<{ name?: unknown }>(req);
    const clean = cleanText(name, NAME_MIN, NAME_MAX, 'nameLength');
    const problem = nameProblem(clean);
    if (problem) throw new HttpError(400, NAME_ERRORS[problem], { min: NAME_MIN, max: NAME_MAX });
    // Nombres únicos según su clave (sin tildes, mayúsculas ni separadores), para que
    // nadie se haga pasar por otro con un nombre que se ve igual.
    const key = nameKey(clean);
    const taken = await env.DB.prepare('SELECT 1 FROM players WHERE name_key = ? AND id <> ?').bind(key, playerId).first();
    if (taken) throw new HttpError(409, 'nameTaken');
    await env.DB.prepare('UPDATE players SET name = ?, name_key = ? WHERE id = ?').bind(clean, key, playerId).run();
    return json({ name: clean });
  }

  if (route === 'GET /stats') return json(await playerStats(env, playerId));
  if (route === 'GET /push/key') return json(pushKey(env));
  if (route === 'PUT /push/subscription') return json(await saveSubscription(env, playerId, await body(req)));
  if (route === 'DELETE /push/subscription') {
    const { endpoint } = await body<{ endpoint?: unknown }>(req);
    return json(await deleteSubscription(env, playerId, endpoint));
  }
  if (route === 'POST /push/test') return json(await testPush(env, playerId));
  if ((m = route.match(/^GET \/players\/([\w-]+)$/))) return json(await playerProfile(env, playerId, m[1]));
  if ((m = route.match(/^GET \/daily\/(\d{4}-\d{2}-\d{2})$/))) return json(await getRun(env, playerId, m[1]));
  if ((m = route.match(/^POST \/daily\/(\d{4}-\d{2}-\d{2})\/start$/))) return json(await startRun(env, playerId, m[1]));
  if ((m = route.match(/^GET \/daily\/(\d{4}-\d{2}-\d{2})\/wins$/))) return json(await dailyWins(env, playerId, m[1]));
  if ((m = route.match(/^GET \/daily\/(\d{4}-\d{2}-\d{2})\/ghost\/([\w-]+)$/))) return json(await ghostRuns(env, playerId, m[1], m[2]));
  if ((m = route.match(/^PUT \/daily\/(\d{4}-\d{2}-\d{2})\/reactions\/([\w-]+)$/))) {
    const { reaction } = await body<{ reaction?: unknown }>(req);
    return json(await react(env, playerId, m[2], m[1], reaction ?? null));
  }
  if (route === 'GET /reactions') {
    const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
    return json(await newReactions(env, playerId, since));
  }
  if ((m = route.match(/^POST \/daily\/(\d{4}-\d{2}-\d{2})\/finish$/))) {
    const { log } = await body<{ log?: unknown }>(req);
    return json(await finishRun(env, playerId, m[1], log));
  }

  if ((m = route.match(/^GET \/timeattack\/(\d{4}-\d{2}-\d{2})$/))) return json(await timeAttackSummary(env, playerId, m[1]));
  if ((m = route.match(/^GET \/timeattack\/(\d{4}-\d{2}-\d{2})\/ranking$/))) return json(await timeAttackRanking(env, playerId, m[1]));
  if ((m = route.match(/^POST \/timeattack\/(\d{4}-\d{2}-\d{2})\/start$/))) return json(await startTimeAttack(env, playerId, m[1]));
  if ((m = route.match(/^POST \/timeattack\/runs\/([\w-]+)\/board$/))) {
    const { log } = await body<{ log?: unknown }>(req);
    return json(await finishTimeAttackBoard(env, playerId, m[1], log));
  }
  if ((m = route.match(/^POST \/timeattack\/runs\/([\w-]+)\/skip$/))) return json(await skipTimeAttackBoard(env, playerId, m[1]));
  if ((m = route.match(/^GET \/timeattack\/runs\/([\w-]+)$/))) return json(await timeAttackResult(env, playerId, m[1]));
  if ((m = route.match(/^GET \/weekly\/(\d{4}-\d{2}-\d{2})$/))) return json(await getWeekly(env, playerId, m[1]));
  if ((m = route.match(/^POST \/weekly\/(\d{4}-\d{2}-\d{2})\/start$/))) return json(await startWeekly(env, playerId, m[1]));
  if ((m = route.match(/^GET \/weekly\/(\d{4}-\d{2}-\d{2})\/ranking$/))) return json(await weeklyRanking(env, playerId, m[1]));
  if ((m = route.match(/^POST \/weekly\/(\d{4}-\d{2}-\d{2})\/finish$/))) {
    const { log } = await body<{ log?: unknown }>(req);
    return json(await finishWeekly(env, playerId, m[1], log));
  }

  if (route === 'GET /friends') return json(await listFriends(env, playerId));
  if (route === 'GET /duels') return json(await listDuels(env, playerId));
  if (route === 'POST /duels') return json(await createDuel(env, playerId, await body(req)));
  if ((m = route.match(/^GET \/duels\/([\w-]+)$/))) return json(await getDuel(env, playerId, m[1]));
  if ((m = route.match(/^POST \/duels\/([\w-]+)\/accept$/))) return json(await acceptDuel(env, playerId, m[1]));
  if ((m = route.match(/^POST \/duels\/([\w-]+)\/decline$/))) return json(await declineDuel(env, playerId, m[1]));
  if ((m = route.match(/^POST \/duels\/([\w-]+)\/here$/))) return json(await here(env, playerId, m[1]));
  if ((m = route.match(/^PUT \/duels\/([\w-]+)\/ready$/))) {
    const { ready } = await body<{ ready?: unknown }>(req);
    return json(await setReady(env, playerId, m[1], ready));
  }
  if ((m = route.match(/^GET \/duels\/([\w-]+)\/ghost$/))) return json(await duelGhost(env, playerId, m[1]));
  if ((m = route.match(/^POST \/duels\/([\w-]+)\/finish$/))) {
    const { log } = await body<{ log?: unknown }>(req);
    return json(await finishDuel(env, playerId, m[1], log));
  }

  if (route === 'GET /leagues') return json(await myLeagues(env, playerId));
  if (route === 'POST /leagues') {
    const { name } = await body<{ name?: unknown }>(req);
    return json(await createLeague(env, playerId, name));
  }
  if (route === 'POST /leagues/join') {
    // Sin límite se podrían probar códigos hasta acertar con una liga ajena.
    const { success } = await env.JOIN_RATE_LIMITER.limit({ key: playerId });
    if (!success) throw new HttpError(429, 'tooManyAttempts');
    const { code } = await body<{ code?: unknown }>(req);
    return json(await joinLeague(env, playerId, code));
  }
  if ((m = route.match(/^GET \/leagues\/invite\/([A-Za-z0-9]{1,12})$/))) {
    // Comparte límite con unirse: si no, se podrían probar códigos por aquí.
    const { success } = await env.JOIN_RATE_LIMITER.limit({ key: playerId });
    if (!success) throw new HttpError(429, 'tooManyAttempts');
    return json(await leagueInvite(env, playerId, m[1]));
  }
  if ((m = route.match(/^POST \/leagues\/([\w-]+)\/leave$/))) return json(await leaveLeague(env, playerId, m[1]));
  if ((m = route.match(/^POST \/leagues\/([\w-]+)\/members\/([\w-]+)\/kick$/))) return json(await kickMember(env, playerId, m[1], m[2]));
  if ((m = route.match(/^POST \/leagues\/([\w-]+)\/code$/))) return json(await newLeagueCode(env, playerId, m[1]));
  if ((m = route.match(/^GET \/leagues\/([\w-]+)\/ranking$/))) {
    const day = url.searchParams.get('day') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, 'invalidDay');
    return json(await leagueRanking(env, playerId, m[1], day));
  }
  if ((m = route.match(/^GET \/leagues\/([\w-]+)\/season$/))) return json(await leagueSeason(env, playerId, m[1]));
  if ((m = route.match(/^GET \/leagues\/([\w-]+)\/standings$/))) {
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpError(400, 'invalidPeriod');
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days < 0 || days > 31) throw new HttpError(400, 'periodLength');
    return json(await leagueStandings(env, playerId, m[1], from, to));
  }

  if (route === 'GET /levels') {
    const offset = Math.max(0, Math.min(10_000, Number(url.searchParams.get('offset')) || 0));
    return json(await listCustomLevels(env, playerId, url.searchParams.get('sort') ?? 'top', offset));
  }
  if (route === 'POST /levels') {
    const { success } = await env.JOIN_RATE_LIMITER.limit({ key: `levels:${playerId}` });
    if (!success) throw new HttpError(429, 'tooManyAttempts');
    return json(await createCustomLevel(env, playerId, await body(req)));
  }
  // Antes que /levels/:id, que si no se quedaría con «featured».
  if (route === 'GET /levels/featured') return json(await featuredCustomLevel(env, playerId));
  if ((m = route.match(/^GET \/levels\/([\w-]+)$/))) return json(await getCustomLevel(env, playerId, m[1]));
  // Amigos directos. Solicitudes y enlaces, con el mismo límite que unirse a ligas.
  if (route === 'GET /friends/overview') return json(await friendsOverview(env, playerId));
  if (route === 'POST /friends/requests') {
    await friendLimit(env, playerId);
    const { name } = await body<{ name?: unknown }>(req);
    return json(await requestFriend(env, playerId, name));
  }
  if ((m = route.match(/^POST \/friends\/link\/([\w-]+)$/))) {
    await friendLimit(env, playerId);
    return json(await addByLink(env, playerId, m[1]));
  }
  if ((m = route.match(/^GET \/friends\/link\/([\w-]+)$/))) return json(await friendLink(env, playerId, m[1]));
  if ((m = route.match(/^POST \/friends\/requests\/([\w-]+)\/accept$/))) return json(await acceptFriend(env, playerId, m[1]));
  if ((m = route.match(/^DELETE \/friends\/requests\/([\w-]+)$/))) return json(await dropRequest(env, playerId, m[1]));
  if ((m = route.match(/^DELETE \/friends\/([\w-]+)$/))) return json(await removeFriend(env, playerId, m[1]));

  // Panel de administración (routes/admin.ts comprueba que lo seas).
  if (route === 'GET /admin/summary') return json(await adminSummary(env, playerId));
  if (route === 'GET /admin/levels') {
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
    return json(await adminLevels(env, playerId, url.searchParams.get('filter'), url.searchParams.get('q'), offset));
  }
  if ((m = route.match(/^DELETE \/admin\/levels\/([\w-]+)$/))) return json(await adminDeleteLevel(env, playerId, m[1]));
  if ((m = route.match(/^POST \/admin\/levels\/([\w-]+)\/clear-reports$/))) return json(await adminClearReports(env, playerId, m[1]));
  if ((m = route.match(/^PUT \/admin\/levels\/([\w-]+)\/featured$/))) {
    const { on } = await body<{ on?: unknown }>(req);
    return json(await adminFeatureLevel(env, playerId, m[1], on));
  }
  if (route === 'GET /admin/players') return json(await adminPlayers(env, playerId, url.searchParams.get('q')));
  if ((m = route.match(/^POST \/admin\/players\/([\w-]+)\/reset-name$/))) return json(await adminResetName(env, playerId, m[1]));

  if ((m = route.match(/^PUT \/levels\/([\w-]+)\/(like|save)$/))) {
    const { on } = await body<{ on?: unknown }>(req);
    return json(await (m[2] === 'like' ? likeCustomLevel : saveCustomLevel)(env, playerId, m[1], on));
  }
  if ((m = route.match(/^DELETE \/levels\/([\w-]+)$/))) return json(await deleteCustomLevel(env, playerId, m[1]));
  if ((m = route.match(/^GET \/levels\/([\w-]+)\/ranking$/))) return json(await customLevelRanking(env, playerId, m[1]));
  if ((m = route.match(/^POST \/levels\/([\w-]+)\/finish$/))) {
    const { log } = await body<{ log?: unknown }>(req);
    return json(await finishCustomLevel(env, playerId, m[1], log));
  }
  if ((m = route.match(/^POST \/levels\/([\w-]+)\/report$/))) {
    const { reason } = await body<{ reason?: unknown }>(req);
    return json(await reportCustomLevel(env, playerId, m[1], reason));
  }
  if ((m = route.match(/^PUT \/levels\/([\w-]+)\/rating$/))) {
    const { stars } = await body<{ stars?: unknown }>(req);
    return json(await rateCustomLevel(env, playerId, m[1], stars));
  }

  throw new HttpError(404, 'notFound');
}
