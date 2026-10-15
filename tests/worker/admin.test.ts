import { beforeEach, describe, expect, it } from 'vitest';
import {
  adminClearReports,
  adminDeleteLevel,
  adminLevels,
  adminPlayers,
  adminResetName,
  adminSummary,
  isAdmin,
} from '../../backend/src/routes/admin';
import { addPlayer, createTestDb, type TestDb } from './d1';

let t: TestDb;
const rejects = (promise: Promise<unknown>, status: number, key: string) => expect(promise).rejects.toMatchObject({ status, key });

function level(id: string, author: string, name: string, createdAt: number, reasons: string[] = []) {
  t.db.prepare("INSERT INTO custom_levels (id, author_id, name, rows, optimal, created_at) VALUES (?, ?, ?, '@.1', 1, ?)").run(id, author, name, createdAt);
  reasons.forEach((reason, i) => {
    const reporter = `rep-${id}-${i}`;
    addPlayer(t, reporter, `Denuncia${id}${i}`);
    t.db.prepare('INSERT INTO custom_level_reports (level_id, player_id, reason, created_at) VALUES (?, ?, ?, 0)').run(id, reporter, reason);
  });
}

beforeEach(() => {
  t = createTestDb();
  (t.env as { ADMIN_GOOGLE_SUBS?: string }).ADMIN_GOOGLE_SUBS = ' sub-otro , sub-admin ';
  addPlayer(t, 'admin', 'Admin', { googleSub: 'sub-admin' });
  addPlayer(t, 'google', 'ConGoogle', { googleSub: 'sub-cualquiera' });
  addPlayer(t, 'feo', 'NombreFeo');
  level('l-feo', 'feo', 'Nivel muy feo', 3, ['name', 'name', 'broken']);
  level('l-una', 'feo', 'Una denuncia', 2, ['other']);
  level('l-raro', 'google', '100% limpio_x', 1);
});

describe('acceso', () => {
  it('solo las cuentas de Google de ADMIN_GOOGLE_SUBS', async () => {
    expect(await isAdmin(t.env, 'admin')).toBe(true);
    expect(await isAdmin(t.env, 'google')).toBe(false);
    expect(await isAdmin(t.env, 'feo')).toBe(false);
    (t.env as { ADMIN_GOOGLE_SUBS?: string }).ADMIN_GOOGLE_SUBS = '';
    expect(await isAdmin(t.env, 'admin')).toBe(false);
  });

  it('un jugador normal recibe 403 en todo', async () => {
    await rejects(adminSummary(t.env, 'feo'), 403, 'adminOnly');
    await rejects(adminLevels(t.env, 'feo', 'all', null, 0), 403, 'adminOnly');
    await rejects(adminDeleteLevel(t.env, 'feo', 'l-feo'), 403, 'adminOnly');
    await rejects(adminClearReports(t.env, 'feo', 'l-feo'), 403, 'adminOnly');
    await rejects(adminPlayers(t.env, 'feo', null), 403, 'adminOnly');
    await rejects(adminResetName(t.env, 'google', 'feo'), 403, 'adminOnly');
    expect(t.rows('SELECT id FROM custom_levels')).toHaveLength(3);
  });
});

describe('niveles', () => {
  it('denunciados: más denuncias primero, con los motivos y si está oculto', async () => {
    const { levels } = await adminLevels(t.env, 'admin', 'reported', null, 0);
    expect(levels.map((l) => [l.name, l.reports, l.reasons, l.hidden])).toEqual([
      ['Nivel muy feo', 3, { name: 2, broken: 1 }, true],
      ['Una denuncia', 1, { other: 1 }, false],
    ]);
  });

  it('la búsqueda trata % y _ como texto y busca también por autor', async () => {
    const search = async (q: string) => (await adminLevels(t.env, 'admin', 'all', q, 0)).levels.map((l) => l.name);
    expect(await search('100%')).toEqual(['100% limpio_x']);
    expect(await search('o_x')).toEqual(['100% limpio_x']);
    expect(await search('imp_o')).toEqual([]); // Con _ como comodín encontraría «limpio».
    expect(await search('feo')).toEqual(['Nivel muy feo', 'Una denuncia']);
  });

  it('quitar las denuncias lo vuelve a mostrar', async () => {
    await adminClearReports(t.env, 'admin', 'l-feo');
    expect((await adminLevels(t.env, 'admin', 'reported', null, 0)).levels.map((l) => l.id)).toEqual(['l-una']);
  });

  it('borrar un nivel se lleva sus denuncias; borrarlo otra vez es 404', async () => {
    await adminDeleteLevel(t.env, 'admin', 'l-feo');
    expect(t.rows("SELECT * FROM custom_level_reports WHERE level_id = 'l-feo'")).toEqual([]);
    await rejects(adminDeleteLevel(t.env, 'admin', 'l-feo'), 404, 'levelNotFound');
  });
});

describe('jugadores y resumen', () => {
  it('quitar un nombre lo deja libre para otro', async () => {
    expect((await adminPlayers(t.env, 'admin', 'nombrefeo')).players.map((p) => p.name)).toEqual(['NombreFeo']);
    await adminResetName(t.env, 'admin', 'feo');
    expect(t.rows("SELECT name, name_key FROM players WHERE id = 'feo'")).toEqual([{ name: null, name_key: null }]);
    expect((await adminPlayers(t.env, 'admin', 'nombrefeo')).players).toEqual([]);
    await rejects(adminResetName(t.env, 'admin', 'nadie'), 404, 'playerNotFound');
  });

  it('el resumen cuenta jugadores y niveles', async () => {
    const s = await adminSummary(t.env, 'admin');
    expect(s.levels).toEqual({ total: 3, reported: 2, hidden: 1 });
    expect(s.players.google).toBe(2);
    expect(s.players.total).toBe(t.rows('SELECT id FROM players').length);
  });
});
