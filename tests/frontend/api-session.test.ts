// La sesión va en una cookie que el juego no ve: se crea una sola vez aunque
// salgan varias llamadas a la vez, y el token de los juegos de antes pasa a la
// cookie y desaparece del navegador.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/** Un servidor de mentira: recuerda si el navegador tiene ya la cookie. */
function fakeServer(start: { cookie: boolean }) {
  const calls: string[] = [];
  let cookie = start.cookie;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: { method: string; headers: Record<string, string> }) => {
      const path = url.replace(/^\/api/, '');
      calls.push(`${init.method} ${path}${init.headers.Authorization ? ' (token antiguo)' : ''}`);
      if (path === '/config') return Response.json({ googleClientId: null, analyticsToken: null, turnstileSiteKey: null });
      if (path === '/session') {
        cookie = true;
        return Response.json({ ok: true });
      }
      // El token antiguo vale una vez: la respuesta pone la cookie.
      if (init.headers.Authorization === 'Bearer viejo') cookie = true;
      else if (!cookie) return Response.json({ error: 'Sin sesión', code: 'noSession' }, { status: 401 });
      return Response.json({ ruta: path });
    }),
  );
  return calls;
}

function fakeStorage(entries: Record<string, string>) {
  const store = new Map(Object.entries(entries));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  });
  return store;
}

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it('primera visita: una sola cuenta nueva aunque salgan varias llamadas a la vez', async () => {
  fakeStorage({});
  const calls = fakeServer({ cookie: false });
  const { api } = await import('../../frontend/src/shared/api');
  const results = await Promise.all([api('POST', '/a', {}), api('PUT', '/b', {}), api('GET', '/c')]);
  expect(results).toEqual([{ ruta: '/a' }, { ruta: '/b' }, { ruta: '/c' }]);
  expect(calls.filter((c) => c === 'POST /session')).toHaveLength(1);
});

it('el token de antes se manda una vez para pasarlo a la cookie y se borra del navegador', async () => {
  const store = fakeStorage({ 'skid.token.v1': 'viejo' });
  const calls = fakeServer({ cookie: false });
  const { api } = await import('../../frontend/src/shared/api');
  expect(await api('POST', '/a', {})).toEqual({ ruta: '/a' });
  expect(store.has('skid.token.v1')).toBe(false);
  expect(await api('POST', '/b', {})).toEqual({ ruta: '/b' });
  // Ni cuenta nueva ni el token otra vez.
  expect(calls).toEqual(['POST /a (token antiguo)', 'POST /b']);
});

it('con la cookie ya puesta no se crea nada', async () => {
  fakeStorage({});
  const calls = fakeServer({ cookie: true });
  const { api } = await import('../../frontend/src/shared/api');
  await api('POST', '/a', {});
  expect(calls).toEqual(['POST /a']);
});
