// Niveles de la comunidad: me gusta, guardar, sus filtros y el nivel destacado.
import { beforeEach, expect, it } from 'vitest';
import { featuredCustomLevel, likeCustomLevel, listCustomLevels, saveCustomLevel } from '../../backend/src/routes/levels';
import { adminFeatureLevel } from '../../backend/src/routes/admin';
import { addPlayer, createTestDb, type TestDb } from './d1';

let t: TestDb;
const rejects = (promise: Promise<unknown>, status: number, key: string) => expect(promise).rejects.toMatchObject({ status, key });

function level(id: string, author: string, createdAt: number, reports = 0) {
  t.db.prepare("INSERT INTO custom_levels (id, author_id, name, rows, optimal, created_at) VALUES (?, ?, ?, '@.1', 1, ?)").run(id, author, `Nivel ${id}`, createdAt);
  for (let i = 0; i < reports; i++) {
    addPlayer(t, `rep-${id}-${i}`, `Denuncia${id}${i}`);
    t.db.prepare("INSERT INTO custom_level_reports (level_id, player_id, reason, created_at) VALUES (?, ?, 'other', 0)").run(id, `rep-${id}-${i}`);
  }
}

beforeEach(() => {
  t = createTestDb();
  (t.env as { ADMIN_GOOGLE_SUBS?: string }).ADMIN_GOOGLE_SUBS = 'sub-admin';
  addPlayer(t, 'ana', 'Ana');
  addPlayer(t, 'bruno', 'Bruno');
  addPlayer(t, 'admin', 'Admin', { googleSub: 'sub-admin' });
  level('a', 'ana', 1);
  level('b', 'ana', 2);
  level('oculto', 'ana', 3, 3);
});

const ids = (r: { levels: { id: string }[] }) => r.levels.map((l) => l.id);

it('me gusta: cuenta para todos, se marca para quien lo da y se puede quitar', async () => {
  expect(await likeCustomLevel(t.env, 'bruno', 'a', true)).toMatchObject({ likes: 1, liked: true });
  await likeCustomLevel(t.env, 'admin', 'a', true);
  await likeCustomLevel(t.env, 'bruno', 'a', true); // Dos veces no suma.
  const forAna = (await listCustomLevels(t.env, 'ana', 'new', 0)).levels.find((l) => l.id === 'a')!;
  expect(forAna).toMatchObject({ likes: 2, liked: false });
  expect(await likeCustomLevel(t.env, 'bruno', 'a', false)).toMatchObject({ likes: 1, liked: false });
});

it('guardar es privado: no cuenta para nadie más', async () => {
  expect(await saveCustomLevel(t.env, 'bruno', 'b', true)).toMatchObject({ saved: true });
  expect((await listCustomLevels(t.env, 'ana', 'new', 0)).levels.find((l) => l.id === 'b')).toMatchObject({ saved: false });
});

it('filtros «Me gustan» y «Guardados»: solo los tuyos, sin los ocultos', async () => {
  await likeCustomLevel(t.env, 'bruno', 'a', true);
  await saveCustomLevel(t.env, 'bruno', 'b', true);
  await likeCustomLevel(t.env, 'admin', 'b', true);
  expect(ids(await listCustomLevels(t.env, 'bruno', 'liked', 0))).toEqual(['a']);
  expect(ids(await listCustomLevels(t.env, 'bruno', 'saved', 0))).toEqual(['b']);
  expect(ids(await listCustomLevels(t.env, 'ana', 'liked', 0))).toEqual([]);
  // Un nivel oculto por denuncias no se puede marcar.
  await rejects(likeCustomLevel(t.env, 'bruno', 'oculto', true), 404, 'levelHidden');
});

it('hay que decir sí o no', async () => {
  await rejects(likeCustomLevel(t.env, 'bruno', 'a', 'si'), 400, 'invalidBody');
  await rejects(saveCustomLevel(t.env, 'bruno', 'nada', true), 404, 'levelNotFound');
});

it('destacado: lo elige el administrador, solo hay uno y se puede quitar', async () => {
  expect(await featuredCustomLevel(t.env, 'bruno')).toEqual({ level: null });
  await rejects(adminFeatureLevel(t.env, 'ana', 'a', true), 403, 'adminOnly');
  await adminFeatureLevel(t.env, 'admin', 'a', true);
  expect((await featuredCustomLevel(t.env, 'bruno')).level).toMatchObject({ id: 'a', name: 'Nivel a', likes: 0 });
  await adminFeatureLevel(t.env, 'admin', 'b', true);
  expect((await featuredCustomLevel(t.env, 'bruno')).level?.id).toBe('b');
  expect(t.rows('SELECT id FROM custom_levels WHERE featured_at IS NOT NULL')).toEqual([{ id: 'b' }]);
  await adminFeatureLevel(t.env, 'admin', 'b', false);
  expect(await featuredCustomLevel(t.env, 'bruno')).toEqual({ level: null });
});

it('un destacado que acaba oculto por denuncias deja de salir', async () => {
  await adminFeatureLevel(t.env, 'admin', 'oculto', true);
  expect(await featuredCustomLevel(t.env, 'bruno')).toEqual({ level: null });
});
