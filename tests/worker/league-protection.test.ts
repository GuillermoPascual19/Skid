// Ligas protegidas: máximo de miembros, expulsar (sin poder volver) y cambiar el código.
import { beforeEach, expect, it } from 'vitest';
import { createLeague, joinLeague, kickMember, MAX_LEAGUE_MEMBERS, myLeagues, newLeagueCode } from '../../backend/src/routes/leagues';
import { addPlayer, createTestDb, type TestDb } from './d1';

let t: TestDb;
const rejects = (promise: Promise<unknown>, status: number, key: string) => expect(promise).rejects.toMatchObject({ status, key });

beforeEach(() => {
  t = createTestDb();
  addPlayer(t, 'ana', 'Ana');
  addPlayer(t, 'bruno', 'Bruno');
  addPlayer(t, 'troll', 'Troll');
});

it('quien crea la liga la gestiona; los demás, no', async () => {
  const league = await createLeague(t.env, 'ana', 'Liga del hielo');
  expect(league.owner).toBe(true);
  await joinLeague(t.env, 'bruno', league.code);
  expect((await myLeagues(t.env, 'ana'))[0].owner).toBe(true);
  expect((await myLeagues(t.env, 'bruno'))[0].owner).toBe(false);
  await rejects(kickMember(t.env, 'bruno', league.id, 'ana'), 403, 'notLeagueOwner');
  await rejects(newLeagueCode(t.env, 'bruno', league.id), 403, 'notLeagueOwner');
  await rejects(kickMember(t.env, 'ana', league.id, 'ana'), 400, 'cantKickYourself');
});

it('el expulsado sale y no puede volver con el código', async () => {
  const league = await createLeague(t.env, 'ana', 'Liga del hielo');
  await joinLeague(t.env, 'troll', league.code);
  expect(await kickMember(t.env, 'ana', league.id, 'troll')).toEqual({ ok: true });
  expect(await myLeagues(t.env, 'troll')).toEqual([]);
  await rejects(joinLeague(t.env, 'troll', league.code), 403, 'bannedFromLeague');
  await rejects(kickMember(t.env, 'ana', league.id, 'troll'), 404, 'notLeagueMember');
  // Los demás siguen pudiendo entrar.
  await joinLeague(t.env, 'bruno', league.code);
});

it('con un código nuevo, el anterior deja de valer', async () => {
  const league = await createLeague(t.env, 'ana', 'Liga del hielo');
  const { code } = await newLeagueCode(t.env, 'ana', league.id);
  expect(code).not.toBe(league.code);
  await rejects(joinLeague(t.env, 'bruno', league.code), 404, 'leagueNotFound');
  expect((await joinLeague(t.env, 'bruno', code)).id).toBe(league.id);
});

it('una liga llena no admite a nadie más (pero quien ya está, sigue)', async () => {
  const league = await createLeague(t.env, 'ana', 'Liga llena');
  for (let i = 1; i < MAX_LEAGUE_MEMBERS; i++) {
    addPlayer(t, `p${i}`, `Jugador${i}`);
    await joinLeague(t.env, `p${i}`, league.code);
  }
  await rejects(joinLeague(t.env, 'bruno', league.code), 403, 'leagueFull');
  expect((await joinLeague(t.env, 'p1', league.code)).members).toBe(MAX_LEAGUE_MEMBERS);
});
