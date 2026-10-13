import { describe, expect, it } from 'vitest';
import { initialState, parseBoard, type Direction } from '../../../../common/logic/engine/board';
import { ELEMENTS, elementsUsed, unlockedElements } from '../../../../common/logic/engine/elements';
import { generateLevel } from '../../../../common/logic/engine/generator';
import { applyMove, isComplete, traceMove } from '../../../../common/logic/engine/move';
import { countDeadEnds, hasLoops, solve } from '../../../../common/logic/engine/solver';

const move = (rows: string[], dir: Direction) => applyMove(parseBoard(rows), initialState(parseBoard(rows)), dir);

describe('parseBoard con elementos', () => {
  it('lee nieve, flechas, teletransportes y agujeros', () => {
    const board = parseBoard(['#######', '#@*^a1#', '#Ov<>a#', '#######']);
    expect(board.cells[1].slice(2, 5)).toEqual(['snow', 'arrow-up', 'portal']);
    expect(board.cells[2].slice(1, 6)).toEqual(['hole', 'arrow-down', 'arrow-left', 'arrow-right', 'portal']);
    expect(board.portals).toEqual([[{ x: 4, y: 1 }, { x: 5, y: 2 }]]);
  });

  it('un teletransporte sin pareja es un error', () => {
    expect(() => parseBoard(['@a.1'])).toThrow(/pareja/);
    expect(() => parseBoard(['@aaa1'])).toThrow(/pareja/);
  });
});

describe('reglas de los elementos', () => {
  it('la nieve para al pingüino encima', () => {
    expect(move(['@..*..1'], 'right')).toEqual({ player: { x: 3, y: 0 }, collected: 0 });
  });

  it('la flecha lo gira y sigue deslizando', () => {
    // Entra en la flecha hacia la derecha y sale hacia abajo hasta el muro.
    expect(move(['@.v.1', '.....', '.....'], 'right')).toEqual({ player: { x: 2, y: 2 }, collected: 0 });
  });

  it('una flecha contra un muro lo deja parado encima', () => {
    expect(move(['@.^.1'], 'right')).toEqual({ player: { x: 2, y: 0 }, collected: 0 });
  });

  it('el teletransporte lo saca por la pareja en la misma dirección', () => {
    const board = parseBoard(['@.a..', '#####', '..a.1']);
    const trace = traceMove(board, initialState(board), 'right')!;
    expect(trace.state).toEqual({ player: { x: 4, y: 2 }, collected: 1 });
    expect(trace.steps.map((s) => s.kind)).toEqual(['slide', 'slide', 'teleport', 'slide', 'slide']);
  });

  it('el agujero lo devuelve a la salida y conserva las piezas', () => {
    expect(move(['@.1.O.2'], 'right')).toEqual({ player: { x: 0, y: 0 }, collected: 1 });
  });

  it('caer al agua desde la salida sí cuenta como movimiento', () => {
    expect(move(['@O..1'], 'right')).toEqual({ player: { x: 0, y: 0 }, collected: 0 });
  });

  it('un bucle de corrientes se detecta y no se queda colgado', () => {
    // Desde abajo entra en el bucle de las cuatro flechas.
    const loop = parseBoard(['######', '#>..v#', '#....#', '#^..<#', '#@...#', '#.1..#', '######']);
    expect(traceMove(loop, initialState(loop), 'up')!.looped).toBe(true);
    expect(hasLoops(loop)).toBe(true);
    expect(hasLoops(parseBoard(['#####', '#@.1#', '#####']))).toBe(false);
  });

  it('el recorrido da los mismos pasos que applyMove', () => {
    const board = parseBoard(['#######', '#@.v..#', '#..*..#', '#.a.a1#', '#######']);
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      expect(traceMove(board, initialState(board), dir)?.state ?? null).toEqual(applyMove(board, initialState(board), dir));
    }
  });
});

describe('desbloqueo', () => {
  it('cada elemento sale a partir de su nivel', () => {
    expect(ELEMENTS.map((e) => e.level)).toEqual([15, 30, 45, 60]);
    expect(unlockedElements(14)).toEqual([]);
    expect(unlockedElements(15)).toEqual(['snow']);
    expect(unlockedElements(59)).toEqual(['snow', 'arrow', 'portal']);
    expect(unlockedElements(60)).toEqual(['snow', 'arrow', 'portal', 'hole']);
  });
});

describe('generador con elementos', () => {
  const levels = [15, 16, 30, 31, 45, 46, 60, 61, 80, 120];
  const seeds = [1, 2, 3];
  // Generar es lo más lento de los tests; con la máquina ocupada (o en CI) puede pasar de 5 s.
  const SLOW = 30_000;

  for (const level of levels) {
    it(`nivel ${level}: resoluble, sin callejones ni bucles, y usa los elementos`, () => {
      for (const seed of seeds) {
        const { board, solution, rows } = generateLevel(level, seed);
        expect(rows.join('')).not.toMatch(/[^#.@1-9*^v<>a-eO]/);
        expect(countDeadEnds(board)).toBe(0);
        expect(hasLoops(board)).toBe(false);
        expect(solve(board)?.length).toBe(solution.length);

        let state = initialState(board);
        for (const dir of solution) state = applyMove(board, state, dir)!;
        expect(isComplete(board, state)).toBe(true);

        const fresh = ELEMENTS.find((e) => e.level === level);
        const used = elementsUsed(board, solution);
        if (fresh) expect(used.has(fresh.id)).toBe(true);
        else expect(used.size).toBeGreaterThan(0);
      }
    }, SLOW);
  }

  it('genera rápido (lo hace el navegador al pasar de nivel)', () => {
    const t = performance.now();
    for (const level of [45, 60, 90]) generateLevel(level, 7);
    expect((performance.now() - t) / 3).toBeLessThan(1500);
  }, SLOW);
});
