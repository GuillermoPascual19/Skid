// Worker de Cloudflare: sirve el juego (archivos estáticos de dist/) y la API
// en /api/*. Aquí solo se enruta: cada apartado está en routes/, la sesión en
// session.ts y las utilidades comunes en http.ts.
//
// El servidor no se fía del cliente: al terminar una partida, el navegador manda
// el registro de movimientos y aquí se reproduce con la misma lógica del juego
// (common/logic) para calcular movimientos, reintentos, tiempo y puntuación.

import { unlockedHats } from '../../common/logic/achievements/achievements';
import { isHatId } from '../../common/art/hats';
import { type Env, HttpError, body, cleanText, json } from './http';
import { playerAchievements } from './routes/achievements';
import { finishRun, getRun, ghostRuns, startRun } from './routes/daily';
import { createLeague, dailyWins, joinLeague, leagueRanking, leagueStandings, myLeagues } from './routes/leagues';
import { createCustomLevel, deleteCustomLevel, finishCustomLevel, getCustomLevel, listCustomLevels, rateCustomLevel, reportCustomLevel } from './routes/levels';
import { playerProfile } from './routes/players';
import { playerStats } from './routes/stats';
import { authenticate, createSession, googleLogin } from './session';

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await handleApi(req, url, env);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: 'Error interno' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

async function handleApi(req: Request, url: URL, env: Env): Promise<Response> {
  const route = `${req.method} ${url.pathname.replace(/^\/api/, '')}`;
  let m: RegExpMatchArray | null;

  if (route === 'POST /session') return json(await createSession(req, env));
  if (route === 'GET /config') return json({ googleClientId: env.GOOGLE_CLIENT_ID || null });

  const session = await authenticate(req, env);
  const { playerId } = session;

  if (route === 'POST /auth/google') {
    const { credential } = await body<{ credential?: unknown }>(req);
    return json(await googleLogin(env, session, credential));
  }
  if (route === 'POST /auth/logout') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(session.tokenHash).run();
    return json({ ok: true });
  }

  if (route === 'GET /me') {
    const row = await env.DB.prepare('SELECT name, email, hat FROM players WHERE id = ?')
      .bind(playerId)
      .first<{ name: string | null; email: string | null; hat: string | null }>();
    return json({ name: row?.name ?? null, email: row?.email ?? null, hat: isHatId(row?.hat) ? row.hat : null });
  }
  if (route === 'GET /achievements') {
    const [items, row] = await Promise.all([
      playerAchievements(env, playerId),
      env.DB.prepare('SELECT hat FROM players WHERE id = ?').bind(playerId).first<{ hat: string | null }>(),
    ]);
    return json({ hat: isHatId(row?.hat) ? row.hat : null, items });
  }
  if (route === 'PUT /me/hat') {
    const { hat } = await body<{ hat?: unknown }>(req);
    if (hat !== null && !isHatId(hat)) throw new HttpError(400, 'Gorro desconocido');
    if (hat !== null && !unlockedHats(await playerAchievements(env, playerId)).has(hat)) {
      throw new HttpError(403, 'Aún no has desbloqueado ese gorro');
    }
    await env.DB.prepare('UPDATE players SET hat = ? WHERE id = ?').bind(hat, playerId).run();
    return json({ hat });
  }
  if (route === 'PUT /me') {
    const { name } = await body<{ name?: unknown }>(req);
    const clean = cleanText(name, 2, 20, 'El nombre');
    // Nombres únicos (sin distinguir mayúsculas), para que nadie se haga pasar por otro.
    const taken = await env.DB.prepare('SELECT 1 FROM players WHERE lower(name) = lower(?) AND id <> ?')
      .bind(clean, playerId)
      .first();
    if (taken) throw new HttpError(409, 'Ese nombre ya lo tiene otro jugador. Prueba con otro.');
    await env.DB.prepare('UPDATE players SET name = ? WHERE id = ?').bind(clean, playerId).run();
    return json({ name: clean });
  }

  if (route === 'GET /stats') return json(await playerStats(env, playerId));
  if ((m = route.match(/^GET \/players\/([\w-]+)$/))) return json(await playerProfile(env, playerId, m[1]));
  if ((m = route.match(/^GET \/daily\/(\d{4}-\d{2}-\d{2})$/))) return json(await getRun(env, playerId, m[1]));
  if ((m = route.match(/^POST \/daily\/(\d{4}-\d{2}-\d{2})\/start$/))) return json(await startRun(env, playerId, m[1]));
  if ((m = route.match(/^GET \/daily\/(\d{4}-\d{2}-\d{2})\/wins$/))) return json(await dailyWins(env, playerId, m[1]));
  if ((m = route.match(/^GET \/daily\/(\d{4}-\d{2}-\d{2})\/ghost\/([\w-]+)$/))) return json(await ghostRuns(env, playerId, m[1], m[2]));
  if ((m = route.match(/^POST \/daily\/(\d{4}-\d{2}-\d{2})\/finish$/))) {
    const { log } = await body<{ log?: unknown }>(req);
    return json(await finishRun(env, playerId, m[1], log));
  }

  if (route === 'GET /leagues') return json(await myLeagues(env, playerId));
  if (route === 'POST /leagues') {
    const { name } = await body<{ name?: unknown }>(req);
    return json(await createLeague(env, playerId, name));
  }
  if (route === 'POST /leagues/join') {
    // Sin límite se podrían probar códigos hasta acertar con una liga ajena.
    const { success } = await env.JOIN_RATE_LIMITER.limit({ key: playerId });
    if (!success) throw new HttpError(429, 'Demasiados intentos. Espera un minuto.');
    const { code } = await body<{ code?: unknown }>(req);
    return json(await joinLeague(env, playerId, code));
  }
  if ((m = route.match(/^GET \/leagues\/([\w-]+)\/ranking$/))) {
    const day = url.searchParams.get('day') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new HttpError(400, 'Día no válido');
    return json(await leagueRanking(env, playerId, m[1], day));
  }
  if ((m = route.match(/^GET \/leagues\/([\w-]+)\/standings$/))) {
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpError(400, 'Periodo no válido');
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days < 0 || days > 31) throw new HttpError(400, 'El periodo debe ser de 1 a 32 días');
    return json(await leagueStandings(env, playerId, m[1], from, to));
  }

  if (route === 'GET /levels') {
    const offset = Math.max(0, Math.min(10_000, Number(url.searchParams.get('offset')) || 0));
    return json(await listCustomLevels(env, playerId, url.searchParams.get('sort') ?? 'top', offset));
  }
  if (route === 'POST /levels') {
    const { success } = await env.JOIN_RATE_LIMITER.limit({ key: `levels:${playerId}` });
    if (!success) throw new HttpError(429, 'Demasiados intentos. Espera un minuto.');
    return json(await createCustomLevel(env, playerId, await body(req)));
  }
  if ((m = route.match(/^GET \/levels\/([\w-]+)$/))) return json(await getCustomLevel(env, playerId, m[1]));
  if ((m = route.match(/^DELETE \/levels\/([\w-]+)$/))) return json(await deleteCustomLevel(env, playerId, m[1]));
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

  throw new HttpError(404, 'No encontrado');
}
