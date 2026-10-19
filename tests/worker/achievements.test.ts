// Logros de los demás modos: el SQL que cuenta duelos, contrarreloj, reto
// semanal y niveles de la comunidad (backend/src/routes/achievements.ts).
import { beforeEach, expect, it } from 'vitest';
import { playerAchievements } from '../../backend/src/routes/achievements';
import { addPlayer, createTestDb, type TestDb } from './d1';

let t: TestDb;
const FUTURE = Date.now() + 1e9;

function duel(id: string, challenger: string, opponent: string, opts: { expires?: number; declined?: boolean } = {}) {
  t.db
    .prepare(
      "INSERT INTO duels (id, challenger_id, opponent_id, difficulty, rows, optimal, created_at, expires_at, declined_at) VALUES (?, ?, ?, 'easy', 'x', 5, 0, ?, ?)",
    )
    .run(id, challenger, opponent, opts.expires ?? FUTURE, opts.declined ? 1 : null);
}
function duelRun(id: string, player: string, moves: number, timeMs: number, done = true) {
  t.db
    .prepare('INSERT INTO duel_runs (duel_id, player_id, started_at, best_moves, best_time_ms, done_at) VALUES (?, ?, 0, ?, ?, ?)')
    .run(id, player, moves, timeMs, done ? 1 : null);
}

beforeEach(() => {
  t = createTestDb();
  for (const id of ['yo', 'b', 'c', 'd']) addPlayer(t, id, `${id.toUpperCase()}Jugador`);
});

const progress = async () => Object.fromEntries((await playerAchievements(t.env, 'yo')).map((p) => [p.id, p.current]));

it('duelos: cuentan las victorias jugando los dos, no las de rival ausente, rechazados ni en curso', async () => {
  duel('d1', 'yo', 'b');
  duelRun('d1', 'yo', 5, 9000);
  duelRun('d1', 'b', 7, 5000); // Gana por movimientos.
  duel('d2', 'b', 'yo');
  duelRun('d2', 'yo', 6, 4000);
  duelRun('d2', 'b', 6, 8000); // Gana por tiempo (siendo el retado).
  duel('d3', 'yo', 'c');
  duelRun('d3', 'yo', 8, 1000);
  duelRun('d3', 'c', 6, 9000); // Pierde.
  duel('d4', 'yo', 'd', { expires: 1 });
  duelRun('d4', 'yo', 5, 1000); // El rival no jugó: no cuenta.
  duel('d5', 'yo', 'b', { declined: true });
  duelRun('d5', 'yo', 5, 1000);
  duelRun('d5', 'b', 9, 1000); // Rechazado.
  duel('d6', 'yo', 'c');
  duelRun('d6', 'yo', 5, 1000);
  duelRun('d6', 'c', 9, 1000, false); // El rival aún no ha entregado.
  expect((await progress()).duelWin10).toBe(2);
});

it('contrarreloj: la mejor partida en tableros y en tableros en el óptimo', async () => {
  t.exec(`INSERT INTO time_attack_runs (id, player_id, week, started_at, deadline, last_at, score, boards, perfect) VALUES
    ('t1', 'yo', '2026-10-05', 0, 0, 0, 100, 12, 3), ('t2', 'yo', '2026-10-12', 0, 0, 0, 50, 4, 5), ('t3', 'b', '2026-10-12', 0, 0, 0, 900, 30, 30)`);
  const p = await progress();
  expect([p.timeAttack10, p.timeAttackPerfect5]).toEqual([10, 5]);
});

it('reto semanal en el óptimo', async () => {
  t.exec(`INSERT INTO weekly_boards (week, rows, optimal) VALUES ('2026-10-05', 'x', 6), ('2026-10-12', 'x', 8)`);
  t.exec(`INSERT INTO weekly_runs (player_id, week, started_at, best_moves, attempts) VALUES ('yo', '2026-10-05', 0, 6, 1), ('yo', '2026-10-12', 0, 9, 1)`);
  expect((await progress()).weeklyPar).toBe(1);
});

it('comunidad: niveles de otros, jugadores en el tuyo y valoración (sin contar las propias)', async () => {
  t.exec(`INSERT INTO custom_levels (id, author_id, name, rows, optimal, created_at) VALUES
    ('de-b', 'b', 'De B', 'x', 4, 0), ('mio', 'yo', 'Mío', 'x', 4, 0), ('mio2', 'yo', 'Mío 2', 'x', 4, 0)`);
  t.exec(`INSERT INTO custom_level_runs (level_id, player_id, best_moves, rating, finished_at) VALUES
    ('de-b', 'yo', 4, 5, 0),
    ('mio', 'yo', 4, 1, 0), ('mio', 'b', 4, 5, 0), ('mio', 'c', 5, 4, 0), ('mio', 'd', 5, 3, 0),
    ('mio2', 'b', 4, NULL, 0)`);
  const p = await progress();
  expect([p.explorer10, p.creator5, p.creatorStar]).toEqual([1, 3, 1]);
  // Con una valoración baja más, la media baja de 4 y deja de contar.
  addPlayer(t, 'e', 'EJugador');
  t.exec(`INSERT INTO custom_level_runs (level_id, player_id, best_moves, rating, finished_at) VALUES ('mio', 'e', 6, 1, 0)`);
  expect((await progress()).creatorStar).toBe(0);
});
