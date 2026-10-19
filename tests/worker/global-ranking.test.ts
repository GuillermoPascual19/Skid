// Ranking global: suma de puntos del reto diario, este mes o desde siempre.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { globalRanking, globalTitles, setGlobalVisible, GLOBAL_RANKING_SIZE } from '../../backend/src/routes/global';
import worker from '../../backend/src/index';
import { addPlayer, createTestDb, type TestDb } from './d1';

let t: TestDb;
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;

function run(player: string, day: string, score: number, finished = true) {
  t.db
    .prepare('INSERT INTO daily_runs (player_id, day, started_at, finished_at, moves, retries, time_ms, score) VALUES (?, ?, 1, ?, 10, 0, 1000, ?)')
    .run(player, day, finished ? 2 : null, finished ? score : null);
}

beforeEach(() => {
  t = createTestDb();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
  addPlayer(t, 'ana', 'Ana');
  addPlayer(t, 'bruno', 'Bruno');
  addPlayer(t, 'carla', 'Carla');
  addPlayer(t, 'anonimo', null);
  run('ana', '2026-09-30', 900); // El mes pasado: solo cuenta en «siempre».
  run('ana', '2026-10-01', 500);
  run('bruno', '2026-10-02', 700);
  run('bruno', '2026-10-03', 600);
  run('carla', '2026-10-03', 0, false); // Sin terminar: no suma.
  run('anonimo', '2026-10-03', 999); // Sin nombre: no sale.
});

afterEach(() => vi.useRealTimers());

const names = (r: { top: { name: string; position: number; points: number }[] }) => r.top.map((e) => `${e.position}. ${e.name} ${e.points}`);

it('el mes suma solo los retos terminados de este mes; siempre, todos', async () => {
  const month = await globalRanking(t.env, 'ana', 'month');
  expect(month).toMatchObject({ from: '2026-10-01', total: 2, me: null, hidden: false, named: true });
  expect(await globalRanking(t.env, 'anonimo', 'month')).toMatchObject({ hidden: false, named: false });
  expect(names(month)).toEqual(['1. Bruno 1300', '2. Ana 500']);
  expect(month.top[1]).toMatchObject({ isMe: true, days: 1, best: 500 });
  expect(names(await globalRanking(t.env, 'ana', 'all'))).toEqual(['1. Ana 1400', '2. Bruno 1300']);
});

it('quien se oculta no sale (ni para sí mismo) y puede volver', async () => {
  await setGlobalVisible(t.env, 'bruno', false);
  const hidden = await globalRanking(t.env, 'bruno', 'month');
  expect(names(hidden)).toEqual(['1. Ana 500']);
  expect(hidden.hidden).toBe(true);
  await setGlobalVisible(t.env, 'bruno', true);
  expect(names(await globalRanking(t.env, 'ana', 'month'))).toEqual(['1. Bruno 1300', '2. Ana 500']);
  await expect(setGlobalVisible(t.env, 'bruno', 'no')).rejects.toMatchObject({ status: 400 });
  await expect(globalRanking(t.env, 'bruno', 'week')).rejects.toMatchObject({ status: 400 });
});

it('si no estás entre los mejores, tu puesto viene aparte', async () => {
  for (let i = 0; i < GLOBAL_RANKING_SIZE; i++) {
    addPlayer(t, `p${i}`, `Jugador${i}`);
    run(`p${i}`, '2026-10-05', 1000 + i);
  }
  const r = await globalRanking(t.env, 'ana', 'month');
  expect(r.top).toHaveLength(GLOBAL_RANKING_SIZE);
  expect(r.top.some((e) => e.isMe)).toBe(false);
  expect(r.me).toMatchObject({ name: 'Ana', position: GLOBAL_RANKING_SIZE + 2, points: 500, isMe: true });
  expect(r.total).toBe(GLOBAL_RANKING_SIZE + 2);
});

it('al acabar el mes, los tres primeros se llevan su laurel (los ocultos no cuentan)', async () => {
  addPlayer(t, 'dani', 'Dani');
  run('dani', '2026-10-04', 1400);
  addPlayer(t, 'eva', 'Eva');
  run('eva', '2026-10-05', 400);
  await setGlobalVisible(t.env, 'dani', false); // Iba 1.º, pero se ocultó.
  // Octubre aún no ha acabado: sin podio.
  expect((await globalRanking(t.env, 'ana', 'month')).previous).toBeNull();
  expect(await globalTitles(t.env, 'bruno')).toEqual([]);

  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
  const november = await globalRanking(t.env, 'ana', 'month');
  expect(november.from).toBe('2026-11-01');
  expect(november.previous!.season).toBe('2026-10');
  expect(november.previous!.podium.map((p) => `${p.position}. ${p.name} ${p.points} ${p.hat}`)).toEqual([
    '1. Bruno 1300 worldgold',
    '2. Ana 500 worldsilver',
    '3. Eva 400 worldbronze',
  ]);
  expect(november.previous!.podium[1].isMe).toBe(true);
  expect(await globalTitles(t.env, 'ana')).toEqual([{ season: '2026-10', position: 2, points: 500, hat: 'worldsilver' }]);
  expect(await globalTitles(t.env, 'dani')).toEqual([]);
  // Cerrar otra vez no duplica nada.
  await globalRanking(t.env, 'bruno', 'all');
  expect(t.db.prepare('SELECT COUNT(*) AS n FROM global_results').get()).toEqual({ n: 3 });
});

it('el laurel ganado se puede llevar; el de otro puesto, no', async () => {
  vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
  const session = await worker.fetch(new Request('http://localhost/api/session', { method: 'POST' }) as never, t.env, ctx);
  const cookie = session.headers.get('Set-Cookie')!.split(';')[0];
  const { id } = t.db.prepare('SELECT player_id AS id FROM sessions ORDER BY rowid DESC LIMIT 1').get() as { id: string };
  t.db.prepare("UPDATE players SET name = 'Fran', name_key = 'fran' WHERE id = ?").run(id);
  run(id, '2026-10-06', 5000);
  const wear = (hat: string) =>
    worker.fetch(
      new Request('http://localhost/api/me/hat', {
        method: 'PUT',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ hat }),
      }) as never,
      t.env,
      ctx,
    );
  await globalRanking(t.env, id, 'month');
  expect((await wear('worldgold')).status).toBe(200);
  expect((await wear('worldsilver')).status).toBe(403);
});
