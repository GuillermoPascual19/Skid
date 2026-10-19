import { beforeEach, describe, expect, it } from 'vitest';
import { dailyLevel, dayKey } from '../../common/logic/daily/daily';
import {
  MAX_FRIENDS,
  acceptFriend,
  addByLink,
  areFriends,
  dropRequest,
  friendCode,
  friendLink,
  friendsOverview,
  removeFriend,
  requestFriend,
} from '../../backend/src/routes/friends';
import { listFriends } from '../../backend/src/routes/duels';
import { playerProfile } from '../../backend/src/routes/players';
import { addPlayer, createTestDb, type TestDb } from './d1';

let t: TestDb;
const rejects = (promise: Promise<unknown>, status: number, key: string) => expect(promise).rejects.toMatchObject({ status, key });
const names = (list: { name: string | null }[]) => list.map((p) => p.name);

beforeEach(() => {
  t = createTestDb();
  addPlayer(t, 'ana', 'Ana');
  addPlayer(t, 'bruno', 'Bruno');
  addPlayer(t, 'carla', 'Carla');
  addPlayer(t, 'dani', 'Daniel Ñúñez');
});

describe('solicitudes por nombre', () => {
  it('llega al otro, que la acepta, y ya son amigos', async () => {
    expect(await requestFriend(t.env, 'ana', 'BRUNO')).toEqual({ status: 'sent', name: 'Bruno' });
    expect(await areFriends(t.env, 'ana', 'bruno')).toBe(false);
    expect(names((await friendsOverview(t.env, 'bruno')).incoming)).toEqual(['Ana']);
    expect(names((await friendsOverview(t.env, 'ana')).outgoing)).toEqual(['Bruno']);

    await acceptFriend(t.env, 'bruno', 'ana');
    expect(await areFriends(t.env, 'ana', 'bruno')).toBe(true);
    expect(await areFriends(t.env, 'bruno', 'ana')).toBe(true);
    const overview = await friendsOverview(t.env, 'ana');
    expect(names(overview.friends)).toEqual(['Bruno']);
    expect(overview.outgoing).toEqual([]);
    expect(t.rows('SELECT * FROM friend_requests')).toEqual([]);
  });

  it('el nombre se busca sin tildes, mayúsculas ni separadores', async () => {
    expect(await requestFriend(t.env, 'ana', ' daniel nunez ')).toMatchObject({ status: 'sent', name: 'Daniel Ñúñez' });
  });

  it('si los dos se la mandan, son amigos al momento', async () => {
    await requestFriend(t.env, 'ana', 'Bruno');
    expect(await requestFriend(t.env, 'bruno', 'Ana')).toEqual({ status: 'friends', name: 'Ana' });
    expect(await areFriends(t.env, 'ana', 'bruno')).toBe(true);
    expect(t.rows('SELECT * FROM friend_requests')).toEqual([]);
  });

  it('errores: a uno mismo, a quien no existe, a quien ya es amigo y sin nombre propio', async () => {
    await rejects(requestFriend(t.env, 'ana', 'ana'), 400, 'cantFriendYourself');
    await rejects(requestFriend(t.env, 'ana', 'Nadie'), 404, 'playerNotFound');
    await rejects(requestFriend(t.env, 'ana', 42), 400, 'playerNotFound');
    await requestFriend(t.env, 'ana', 'Bruno');
    await acceptFriend(t.env, 'bruno', 'ana');
    await rejects(requestFriend(t.env, 'ana', 'Bruno'), 409, 'alreadyFriends');
    addPlayer(t, 'anon');
    await rejects(requestFriend(t.env, 'anon', 'Ana'), 400, 'nameRequired');
  });

  it('rechazar una recibida o cancelar una enviada la borra; aceptarla después ya no vale', async () => {
    await requestFriend(t.env, 'ana', 'Bruno');
    await dropRequest(t.env, 'bruno', 'ana');
    await rejects(acceptFriend(t.env, 'bruno', 'ana'), 404, 'requestNotFound');
    await requestFriend(t.env, 'ana', 'Carla');
    await dropRequest(t.env, 'ana', 'carla');
    expect((await friendsOverview(t.env, 'carla')).incoming).toEqual([]);
  });

  it('solo se acepta la que te han mandado a ti', async () => {
    await requestFriend(t.env, 'ana', 'Bruno');
    await rejects(acceptFriend(t.env, 'carla', 'ana'), 404, 'requestNotFound');
    await rejects(acceptFriend(t.env, 'ana', 'bruno'), 404, 'requestNotFound');
  });

  it('como mucho 20 solicitudes sin contestar', async () => {
    for (let i = 0; i < 20; i++) addPlayer(t, `p${i}`, `Jugador${i}`);
    for (let i = 0; i < 20; i++) await requestFriend(t.env, 'ana', `Jugador${i}`);
    await rejects(requestFriend(t.env, 'ana', 'Bruno'), 429, 'tooManyRequests');
  });
});

describe('enlace de amigo', () => {
  it('cada uno tiene su código secreto, que no cambia y sale en sus amigos', async () => {
    const code = await friendCode(t.env, 'ana');
    expect(code).toMatch(/^[a-z2-9]{12}$/);
    expect(await friendCode(t.env, 'ana')).toBe(code);
    expect(await friendCode(t.env, 'bruno')).not.toBe(code);
    expect((await friendsOverview(t.env, 'ana')).link).toBe(code);
  });

  it('con el código: dice quién es, y añadirse no necesita solicitud', async () => {
    const code = await friendCode(t.env, 'ana');
    expect(await friendLink(t.env, 'bruno', code)).toEqual({ id: 'ana', name: 'Ana', hat: null, isMe: false, already: false, direct: true });
    expect(await addByLink(t.env, 'bruno', code)).toEqual({ status: 'friends', name: 'Ana' });
    expect(await areFriends(t.env, 'ana', 'bruno')).toBe(true);
    expect(await friendLink(t.env, 'bruno', code)).toMatchObject({ already: true });
    expect(await friendLink(t.env, 'ana', code)).toMatchObject({ isMe: true, already: false });
  });

  it('con el id (enlaces de antes, o el id que sale en un ranking) solo va una solicitud', async () => {
    expect(await friendLink(t.env, 'bruno', 'ana')).toMatchObject({ id: 'ana', direct: false });
    expect(await addByLink(t.env, 'bruno', 'ana')).toEqual({ status: 'sent', name: 'Ana' });
    expect(await areFriends(t.env, 'ana', 'bruno')).toBe(false);
    expect(names((await friendsOverview(t.env, 'ana')).incoming)).toEqual(['Bruno']);
    await acceptFriend(t.env, 'ana', 'bruno');
    expect(await areFriends(t.env, 'ana', 'bruno')).toBe(true);
  });

  it('añadirse otra vez no duplica nada y borra las solicitudes pendientes entre los dos', async () => {
    const code = await friendCode(t.env, 'ana');
    await requestFriend(t.env, 'ana', 'Bruno');
    await addByLink(t.env, 'bruno', code);
    await addByLink(t.env, 'bruno', code);
    expect(t.rows('SELECT * FROM friendships')).toHaveLength(1);
    expect(t.rows('SELECT * FROM friend_requests')).toEqual([]);
  });

  it('no vale con uno mismo, con quien no existe ni con quien aún no tiene nombre', async () => {
    await rejects(addByLink(t.env, 'ana', await friendCode(t.env, 'ana')), 400, 'cantFriendYourself');
    await rejects(addByLink(t.env, 'ana', 'nadie'), 404, 'playerNotFound');
    addPlayer(t, 'anon');
    const anon = await friendCode(t.env, 'anon');
    await rejects(friendLink(t.env, 'ana', anon), 404, 'playerNotFound');
    await rejects(addByLink(t.env, 'ana', anon), 404, 'playerNotFound');
  });

  it(`como mucho ${MAX_FRIENDS} amigos`, async () => {
    for (let i = 0; i < MAX_FRIENDS; i++) {
      addPlayer(t, `f${i}`, `Amigo${i}`);
      t.db.prepare('INSERT INTO friendships (player_a, player_b, created_at) VALUES (?, ?, 0)').run('ana', `f${i}`);
    }
    await rejects(addByLink(t.env, 'bruno', await friendCode(t.env, 'ana')), 409, 'tooManyFriends');
    expect(await areFriends(t.env, 'ana', 'bruno')).toBe(false);
  });
});

describe('ser amigos', () => {
  const befriend = async (a: string, b: string) => addByLink(t.env, a, await friendCode(t.env, b));

  it('quitar a un amigo deja de serlo para los dos', async () => {
    await befriend('ana', 'bruno');
    await removeFriend(t.env, 'bruno', 'ana');
    expect(await areFriends(t.env, 'ana', 'bruno')).toBe(false);
    expect((await friendsOverview(t.env, 'ana')).friends).toEqual([]);
  });

  it('compartir liga también cuenta como amigos', async () => {
    t.exec("INSERT INTO leagues (id, name, code, created_by) VALUES ('l1', 'Liga', 'ABC123', 'ana')");
    t.exec("INSERT INTO league_members (league_id, player_id) VALUES ('l1', 'ana'), ('l1', 'carla')");
    expect(await areFriends(t.env, 'ana', 'carla')).toBe(true);
    expect(await areFriends(t.env, 'ana', 'bruno')).toBe(false);
  });

  it('para retar: amigos directos y de liga, sin uno mismo ni jugadores sin nombre', async () => {
    t.exec("INSERT INTO leagues (id, name, code, created_by) VALUES ('l1', 'Liga', 'ABC123', 'ana')");
    addPlayer(t, 'anon');
    t.exec("INSERT INTO league_members (league_id, player_id) VALUES ('l1', 'ana'), ('l1', 'carla'), ('l1', 'anon')");
    await befriend('bruno', 'ana');
    expect(names(await listFriends(t.env, 'ana'))).toEqual(['Bruno', 'Carla']);
  });

  it('el perfil solo lo ven amigos', async () => {
    await rejects(playerProfile(t.env, 'bruno', 'ana'), 403, 'onlyLeagueProfiles');
    await befriend('bruno', 'ana');
    expect(await playerProfile(t.env, 'bruno', 'ana')).toMatchObject({ name: 'Ana', sharedLeagues: [] });
  });

  it('la lista dice cómo va el reto de hoy de cada uno', async () => {
    await befriend('bruno', 'ana');
    await befriend('carla', 'ana');
    await befriend('dani', 'ana');
    const day = dayKey(new Date());
    t.db.prepare('INSERT INTO daily_runs (player_id, day, started_at, finished_at, over_par) VALUES (?, ?, 1, 2, 3)').run('bruno', day);
    t.db.prepare('INSERT INTO daily_runs (player_id, day, started_at) VALUES (?, ?, 1)').run('carla', day);
    const { friends } = await friendsOverview(t.env, 'ana');
    expect(friends.map((f) => [f.name, f.today])).toEqual([
      ['Bruno', { status: 'finished', moves: dailyLevel(day).solution.length + 3 }],
      ['Carla', { status: 'playing', moves: null }],
      ['Daniel Ñúñez', { status: 'none', moves: null }],
    ]);
  });

  it('al borrar una cuenta se van sus amistades y solicitudes', async () => {
    await befriend('bruno', 'ana');
    await requestFriend(t.env, 'carla', 'Ana');
    t.exec("DELETE FROM players WHERE id = 'ana'");
    expect(t.rows('SELECT * FROM friendships')).toEqual([]);
    expect(t.rows('SELECT * FROM friend_requests')).toEqual([]);
  });
});
