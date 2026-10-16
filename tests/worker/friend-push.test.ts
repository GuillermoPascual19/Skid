// Avisos de amistad: a quién llegan, con qué texto, y que respetan el interruptor
// y el límite de uno por hora. El cifrado y la red se sustituyen: lo que se
// «envía» es el mensaje tal cual.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { acceptFriend, addByLink, requestFriend } from '../../backend/src/routes/friends';
import { addPlayer, createTestDb, type TestDb } from './d1';

vi.mock('../../backend/src/webpush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../backend/src/webpush')>()),
  encrypt: async (_p256dh: string, _auth: string, data: Uint8Array) => data,
  vapidAuthorization: async () => 'vapid de prueba',
}));

let t: TestDb;
let tasks: Promise<unknown>[];
let sent: { endpoint: string; title: string; url: string }[];

beforeEach(() => {
  t = createTestDb();
  tasks = [];
  sent = [];
  Object.assign(t.env, { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', waitUntil: (task: Promise<unknown>) => tasks.push(task) });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (endpoint: string, init: { body: Uint8Array }) => {
      const message = JSON.parse(new TextDecoder().decode(init.body));
      sent.push({ endpoint, title: message.title, url: message.url });
      return new Response(null, { status: 201 });
    }),
  );
  addPlayer(t, 'ana', 'Ana');
  addPlayer(t, 'bruno', 'Bruno');
  // Bruno tiene dos dispositivos con avisos (uno en inglés); Ana, uno.
  subscribe('bruno', 'https://fcm.googleapis.com/fcm/send/bruno-movil', 'es');
  subscribe('bruno', 'https://fcm.googleapis.com/fcm/send/bruno-pc', 'en');
  subscribe('ana', 'https://fcm.googleapis.com/fcm/send/ana', 'es');
});

afterEach(() => vi.unstubAllGlobals());

function subscribe(player: string, endpoint: string, lang: string, friends = 1) {
  t.db.prepare("INSERT INTO push_subscriptions (endpoint, player_id, p256dh, auth, lang, friends, created_at) VALUES (?, ?, 'k', 'a', ?, ?, 0)").run(endpoint, player, lang, friends);
}

/** Espera a los avisos que se mandan en segundo plano. */
const flush = async () => {
  await Promise.all(tasks);
  tasks = [];
};

it('la solicitud avisa al otro en todos sus dispositivos, cada uno en su idioma, y lleva a Amigos', async () => {
  await requestFriend(t.env, 'ana', 'Bruno');
  await flush();
  expect(sent).toEqual([
    { endpoint: 'https://fcm.googleapis.com/fcm/send/bruno-movil', title: '👥 Ana quiere ser tu amigo', url: '/?amigos' },
    { endpoint: 'https://fcm.googleapis.com/fcm/send/bruno-pc', title: '👥 Ana wants to be your friend', url: '/?amigos' },
  ]);
});

it('al aceptar se avisa a quien la mandó', async () => {
  await requestFriend(t.env, 'ana', 'Bruno');
  await flush();
  sent = [];
  await acceptFriend(t.env, 'bruno', 'ana');
  await flush();
  expect(sent.map((s) => [s.endpoint.split('/').pop(), s.title])).toEqual([['ana', '👥 Bruno ya es tu amigo']]);
});

it('con el enlace se avisa al dueño, solo la primera vez', async () => {
  await addByLink(t.env, 'ana', 'bruno');
  await flush();
  expect(sent.map((s) => s.title)).toEqual(['👥 Ana ya es tu amigo', '👥 Ana is now your friend']);
  sent = [];
  await addByLink(t.env, 'ana', 'bruno');
  await flush();
  expect(sent).toEqual([]);
});

it('con el interruptor de amigos apagado no llega', async () => {
  t.exec("UPDATE push_subscriptions SET friends = 0 WHERE endpoint LIKE '%bruno-pc'");
  await requestFriend(t.env, 'ana', 'Bruno');
  await flush();
  expect(sent.map((s) => s.endpoint.split('/').pop())).toEqual(['bruno-movil']);
});

it('mandar, cancelar y volver a mandar no repite el aviso dentro de la hora', async () => {
  const { dropRequest } = await import('../../backend/src/routes/friends');
  await requestFriend(t.env, 'ana', 'Bruno');
  await dropRequest(t.env, 'ana', 'bruno');
  await requestFriend(t.env, 'ana', 'Bruno');
  await flush();
  expect(sent).toHaveLength(2); // Los dos dispositivos de Bruno, una sola vez.
});
