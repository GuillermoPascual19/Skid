// El servidor hace cumplir el tope de pistas del reto diario.
import { beforeEach, expect, it } from 'vitest';
import { dailyLevel, encodeRun, type RunEvent } from '../../common/logic/daily/daily';
import { DAILY_HINT_LIMIT_SINCE } from '../../common/logic/hints';
import { finishRun } from '../../backend/src/routes/daily';
import { addPlayer, createTestDb, type TestDb } from './d1';

let t: TestDb;
const BEFORE = '2026-10-10';

beforeEach(() => {
  t = createTestDb();
  addPlayer(t, 'yo', 'Yo');
});

/** Empieza el reto (hace mucho, para que el tiempo no cuente como «demasiado rápido») y envía `hints` pistas y la solución. */
async function finishWith(day: string, hints: number) {
  t.db.prepare('INSERT INTO daily_runs (player_id, day, started_at) VALUES (?, ?, 0)').run('yo', day);
  const events: RunEvent[] = [...Array<RunEvent>(hints).fill('hint'), ...dailyLevel(day).solution];
  return finishRun(t.env, 'yo', day, encodeRun(events));
}

it('con 3 pistas vale (y cuentan como golpes)', async () => {
  const r = await finishWith(DAILY_HINT_LIMIT_SINCE, 3);
  expect(t.rows('SELECT hints, over_par FROM daily_runs')).toEqual([{ hints: 3, over_par: 3 }]);
  expect(r).toBeTruthy();
});

it('con 4 pistas lo rechaza', async () => {
  await expect(finishWith(DAILY_HINT_LIMIT_SINCE, 4)).rejects.toMatchObject({ status: 400, key: 'tooManyHints' });
  expect(t.rows('SELECT finished_at FROM daily_runs')).toEqual([{ finished_at: null }]);
});

it('los retos de antes del tope no lo tienen', async () => {
  await finishWith(BEFORE, 6);
  expect(t.rows('SELECT hints FROM daily_runs')).toEqual([{ hints: 6 }]);
});
