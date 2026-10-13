import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, computeAchievements, unlockedHats, weekTitles, type FinishedRun } from '../../../../common/logic/achievements/achievements';

const today = '2026-10-09'; // Viernes.
const run = (day: string, score = 800, retries = 0, hints = 0, overPar: number | null = null): FinishedRun => ({ day, score, retries, hints, overPar });
const progress = (runs: FinishedRun[], wonDays = 0, titles = 0) =>
  Object.fromEntries(computeAchievements({ runs, wonDays, weekTitles: titles, today }).map((p) => [p.id, p]));

describe('computeAchievements', () => {
  it('sin partidas no hay nada desbloqueado', () => {
    expect(Object.values(progress([])).every((p) => !p.unlocked && p.current === 0)).toBe(true);
  });

  it('primer reto, rachas y progreso parcial', () => {
    const p = progress([run('2026-10-05'), run('2026-10-06'), run('2026-10-07'), run('2026-10-08')]);
    expect(p.first).toMatchObject({ unlocked: true, current: 1 });
    expect(p.streak3).toMatchObject({ unlocked: true, current: 3 });
    expect(p.streak7).toMatchObject({ unlocked: false, current: 4, target: 7 });
  });

  it('la mejor racha cuenta aunque ya se haya perdido', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07'];
    expect(progress(days.map((d) => run(d))).streak7.unlocked).toBe(true);
  });

  it('rachas largas de 14 y 30 días', () => {
    const days = Array.from({ length: 14 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
    const p = progress(days.map((d) => run(d)));
    expect(p.streak14.unlocked).toBe(true);
    expect(p.streak30).toMatchObject({ unlocked: false, current: 14, target: 30 });
  });

  it('perfección, sin ayuda y veterano', () => {
    const runs = [run('2026-10-01', 1000), run('2026-10-02', 900, 1), run('2026-10-03', 900, 0, 2), ...['04', '05', '06', '07'].map((d) => run(`2026-10-${d}`))];
    const p = progress(runs);
    expect(p.perfect.unlocked).toBe(true);
    expect(p.clean5).toMatchObject({ unlocked: true, current: 5 }); // Las dos con reintento o pista no cuentan.
    expect(p.veteran).toMatchObject({ unlocked: false, current: 7, target: 30 });
  });

  it('en los retos de golf reintentar no quita el "sin ayuda"; las pistas sí', () => {
    const p = progress([run('2026-10-01', 900, 3, 0, 1), run('2026-10-02', 900, 0, 1, 1)]);
    expect(p.clean5.current).toBe(1);
  });

  it('victorias y semanas ganadas vienen calculadas de fuera', () => {
    const p = progress([run('2026-10-01')], 1, 1);
    expect(p.firstWin.unlocked).toBe(true);
    expect(p.weekChampion.unlocked).toBe(true);
  });

  it('cada logro da un gorro distinto', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.hat)).size).toBe(ACHIEVEMENTS.length);
    const hats = unlockedHats(computeAchievements({ runs: [run('2026-10-08', 1000)], wonDays: 0, weekTitles: 0, today }));
    expect([...hats].sort()).toEqual(['beanie', 'tophat']);
  });
});

describe('weekTitles', () => {
  // Semana pasada: 28 sep - 4 oct. Semana actual: 5 - 11 oct.
  const lr = (leagueId: string, playerId: string, day: string, score: number) => ({ leagueId, playerId, day, score });

  it('gana quien más suma en una semana ya terminada', () => {
    const runs = [lr('L', 'ana', '2026-09-28', 900), lr('L', 'ana', '2026-09-29', 900), lr('L', 'bea', '2026-09-28', 1000)];
    expect(weekTitles(runs, 'ana', today)).toBe(1);
    expect(weekTitles(runs, 'bea', today)).toBe(0);
  });

  it('la semana en curso no cuenta todavía', () => {
    const runs = [lr('L', 'ana', '2026-10-06', 900), lr('L', 'bea', '2026-10-06', 500)];
    expect(weekTitles(runs, 'ana', today)).toBe(0);
  });

  it('hace falta al menos otro jugador esa semana', () => {
    expect(weekTitles([lr('L', 'ana', '2026-09-28', 900)], 'ana', today)).toBe(0);
  });

  it('cuenta por liga y por semana, y los empates en cabeza cuentan', () => {
    const runs = [
      lr('L1', 'ana', '2026-09-28', 900), lr('L1', 'bea', '2026-09-28', 900), // empate
      lr('L2', 'ana', '2026-09-21', 800), lr('L2', 'cris', '2026-09-21', 700),
      lr('L2', 'ana', '2026-09-28', 100), lr('L2', 'cris', '2026-09-28', 700),
    ];
    expect(weekTitles(runs, 'ana', today)).toBe(2);
  });
});
