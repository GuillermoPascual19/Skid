// Caché en memoria del Worker (backend/src/memo.ts) y dónde se usa: el ranking
// global y el orden de los niveles de jugadores.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { forget, forgetAll, memo } from '../../backend/src/memo';
import { globalRanking, setGlobalVisible } from '../../backend/src/routes/global';
import { listCustomLevels, likeCustomLevel } from '../../backend/src/routes/levels';
import { addPlayer, createTestDb, type TestDb } from './d1';

let t: TestDb;

beforeEach(() => {
  t = createTestDb();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
});

afterEach(() => vi.useRealTimers());

it('memo: comparte el cálculo, caduca, no guarda errores y se puede borrar', async () => {
  forgetAll();
  let calls = 0;
  const compute = async () => ++calls;
  const [a, b] = await Promise.all([memo('x:1', 1000, compute, 0), memo('x:1', 1000, compute, 10)]);
  expect([a, b, calls]).toEqual([1, 1, 1]);
  expect(await memo('x:1', 1000, compute, 999)).toBe(1);
  expect(await memo('x:1', 1000, compute, 1000)).toBe(2); // Caducado.
  await expect(memo('y', 1000, () => Promise.reject(new Error('fallo')), 0)).rejects.toThrow('fallo');
  expect(await memo('y', 1000, async () => 'bien', 1)).toBe('bien'); // El error no se guardó.
  forget('x:');
  expect(await memo('x:1', 1000, compute, 1001)).toBe(3);
  expect(await memo('y', 1000, async () => 'otra', 2)).toBe('bien'); // Lo demás sigue.
});

function run(player: string, day: string, score: number) {
  t.db
    .prepare('INSERT INTO daily_runs (player_id, day, started_at, finished_at, moves, retries, time_ms, score) VALUES (?, ?, 1, 2, 10, 0, 1000, ?)')
    .run(player, day, score);
}

it('el ranking global se calcula una vez por minuto, y al ocultarse alguien, enseguida', async () => {
  addPlayer(t, 'ana', 'Ana');
  addPlayer(t, 'bruno', 'Bruno');
  run('ana', '2026-10-01', 500);
  const names = async () => (await globalRanking(t.env, 'ana', 'month')).top.map((e) => `${e.name} ${e.points}`);
  expect(await names()).toEqual(['Ana 500']);
  // Un reto que entra por fuera de la ruta normal no se ve hasta que caduca.
  run('bruno', '2026-10-02', 900);
  expect(await names()).toEqual(['Ana 500']);
  vi.setSystemTime(new Date('2026-10-16T12:01:01Z'));
  expect(await names()).toEqual(['Bruno 900', 'Ana 500']);
  // Ocultarse lo borra al momento.
  await setGlobalVisible(t.env, 'bruno', false);
  expect(await names()).toEqual(['Ana 500']);
});

it('niveles: el orden se guarda un minuto, pero los me gusta y lo de cada uno van al día', async () => {
  addPlayer(t, 'ana', 'Ana');
  addPlayer(t, 'bruno', 'Bruno');
  const level = (id: string, at: number) =>
    t.db.prepare("INSERT INTO custom_levels (id, author_id, name, rows, optimal, created_at) VALUES (?, 'ana', ?, '@.1', 1, ?)").run(id, `Nivel ${id}`, at);
  level('a', 1);
  level('b', 2);
  const ids = async (who = 'bruno') => (await listCustomLevels(t.env, who, 'new', 0)).levels.map((l) => `${l.id}${l.liked ? '♥' : ''}${l.likes}`);
  expect(await ids()).toEqual(['b0', 'a0']);
  level('c', 3); // Entra por fuera: no sale hasta que caduca el orden…
  await likeCustomLevel(t.env, 'bruno', 'a', true); // …pero el me gusta sí, al momento.
  expect(await ids()).toEqual(['b0', 'a♥1']);
  expect(await ids('ana')).toEqual(['b0', 'a1']);
  vi.setSystemTime(new Date('2026-10-16T12:01:01Z'));
  expect(await ids()).toEqual(['c0', 'b0', 'a♥1']);
  // Uno ocultado por denuncias desaparece aunque el orden siga guardado.
  for (const p of ['d1', 'd2', 'd3']) {
    addPlayer(t, p, `Denuncia${p}`);
    t.db.prepare("INSERT INTO custom_level_reports (level_id, player_id, reason, created_at) VALUES ('b', ?, 'other', 0)").run(p);
  }
  expect(await ids()).toEqual(['c0', 'a♥1']);
});
