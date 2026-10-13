import { describe, expect, it } from 'vitest';
import { parseBoard } from '../../../../common/logic/engine/board';
import {
  DAILY_LEVEL,
  dailyLevel,
  dayKey,
  decodeRun,
  encodeRun,
  minPlayTimeMs,
  monthRange,
  NO_DEAD_ENDS_SINCE,
  replayRun,
  weekRange,
} from '../../../../common/logic/daily/daily';
import { generateLevel } from '../../../../common/logic/engine/generator';
import { hashSeed } from '../../../../common/logic/engine/rng';
import { golfLabel, golfPoints, overPar } from '../../../../common/logic/daily/score';
import { countDeadEnds } from '../../../../common/logic/engine/solver';

describe('dayKey', () => {
  it('usa la medianoche de Madrid, no la UTC', () => {
    expect(dayKey(new Date('2026-10-06T21:30:00Z'))).toBe('2026-10-06'); // 23:30 en Madrid
    expect(dayKey(new Date('2026-10-06T22:30:00Z'))).toBe('2026-10-07'); // 00:30 en Madrid
    expect(dayKey(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16'); // invierno, UTC+1
  });
});

describe('weekRange y monthRange', () => {
  it('la semana va de lunes a domingo', () => {
    expect(weekRange('2026-10-07')).toEqual({ from: '2026-10-05', to: '2026-10-11' }); // miércoles
    expect(weekRange('2026-10-05')).toEqual({ from: '2026-10-05', to: '2026-10-11' }); // lunes
    expect(weekRange('2026-10-11')).toEqual({ from: '2026-10-05', to: '2026-10-11' }); // domingo
    expect(weekRange('2026-12-31')).toEqual({ from: '2026-12-28', to: '2027-01-03' }); // cambio de año
  });

  it('el mes natural, también en febrero', () => {
    expect(monthRange('2026-10-07')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthRange('2026-02-14')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02-03')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('dailyLevel', () => {
  it('es el mismo tablero para todos ese día y cambia al día siguiente', () => {
    expect(dailyLevel('2026-10-06').rows).toEqual(dailyLevel('2026-10-06').rows);
    expect(dailyLevel('2026-10-06').rows).not.toEqual(dailyLevel('2026-10-07').rows);
  });
});

describe('registro de la partida', () => {
  it('codifica y decodifica', () => {
    const events = ['up', 'right', 'restart', 'hint', 'down', 'left'] as const;
    expect(encodeRun(events)).toBe('URXHDL');
    expect(decodeRun('URXHDL')).toEqual(events);
    expect(() => decodeRun('UZ')).toThrow();
  });

  it('cada intento empieza de cero; los que no desplazan no cuentan', () => {
    const board = parseBoard(['#####', '#@.1#', '#..2#', '#####']);
    // R recoge la 1; X reintenta; L no se mueve; R recoge la 1; D recoge la 2.
    expect(replayRun(board, decodeRun('RXLRD'))).toMatchObject({
      moves: 2,
      totalMoves: 3,
      retries: 1,
      hints: 0,
      completed: true,
      best: { moves: 2, hints: 0, strokes: 2, path: ['right', 'down'] },
    });
  });

  it('cuenta las casillas recorridas y el tiempo mínimo de las animaciones', () => {
    const board = parseBoard(['#####', '#@.1#', '#..2#', '#####']);
    // R: 2 casillas; D: 1 casilla.
    const run = replayRun(board, decodeRun('RD'));
    expect(run).toMatchObject({ totalMoves: 2, cells: 3 });
    expect(minPlayTimeMs(run)).toBe(2 * 80 + 3 * 42);
  });

  it('cada pista suma un golpe, también en los intentos siguientes', () => {
    const board = parseBoard(['#####', '#@.1#', '#..2#', '#####']);
    expect(replayRun(board, decodeRun('HRD')).best).toMatchObject({ moves: 2, hints: 1, strokes: 3 });
    expect(replayRun(board, decodeRun('HRDXRD')).last).toMatchObject({ moves: 2, hints: 1, strokes: 3 });
  });

  it('tras completar se puede volver a empezar para mejorar; cuenta el mejor intento', () => {
    const board = parseBoard(['#####', '#@.1#', '#..2#', '#####']);
    // Un primer intento más largo y luego el óptimo.
    const run = replayRun(board, decodeRun('DRURDXRD'));
    expect(run.completed).toBe(true);
    expect(run.best).toEqual({ moves: 2, hints: 0, strokes: 2, path: ['right', 'down'] });
    // Un intento peor después no cambia el mejor.
    expect(replayRun(board, decodeRun('RDXDRURD')).best).toEqual({ moves: 2, hints: 0, strokes: 2, path: ['right', 'down'] });
  });

  it('a medias no hay intento terminado', () => {
    const board = parseBoard(['#####', '#@.1#', '#..2#', '#####']);
    expect(replayRun(board, decodeRun('RDXR'))).toMatchObject({ completed: false, moves: 1, best: { strokes: 2 } });
    expect(replayRun(board, decodeRun('R'))).toMatchObject({ completed: false, best: null, last: null });
  });

  it('rechaza movimientos o pistas después de completar sin volver a empezar', () => {
    const board = parseBoard(['@.1']);
    expect(() => replayRun(board, decodeRun('RL'))).toThrow();
    expect(() => replayRun(board, decodeRun('RH'))).toThrow();
  });

  it('la solución óptima del reto lo completa', () => {
    const { board, solution } = dailyLevel('2026-10-06');
    expect(replayRun(board, solution)).toMatchObject({ moves: solution.length, retries: 0, completed: true });
  });
});

describe('golf', () => {
  it('el resultado es lo que te pasas del óptimo', () => {
    expect(overPar(15, 15)).toBe(0);
    expect(overPar(17, 15)).toBe(2);
    expect(golfLabel(0)).toBe('Par');
    expect(golfLabel(2)).toBe('+2');
  });

  it('puntos de liga: 1000 al par, 100 menos por golpe, mínimo 100', () => {
    expect(golfPoints(0)).toBe(1000);
    expect(golfPoints(3)).toBe(700);
    expect(golfPoints(20)).toBe(100);
  });
});

describe('callejones sin salida en el reto', () => {
  it('los retos ya publicados no cambian', () => {
    // Tableros de los días ya jugados, tal como se generaban.
    for (const day of ['2026-10-06', '2026-10-07']) {
      const old = generateLevel(DAILY_LEVEL, hashSeed(`skid-daily:${day}`), { rejectDeadEnds: false });
      expect(dailyLevel(day).rows).toEqual(old.rows);
    }
  });

  it('desde NO_DEAD_ENDS_SINCE no hay callejones', () => {
    for (let i = 0; i < 20; i++) {
      const date = new Date(`${NO_DEAD_ENDS_SINCE}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() + i);
      expect(countDeadEnds(dailyLevel(date.toISOString().slice(0, 10)).board)).toBe(0);
    }
  });
});
