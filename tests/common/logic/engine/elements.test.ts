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
    expect(() => parseBoard(['@a.1'])).toThrow('portalPair');
    expect(() => parseBoard(['@aaa1'])).toThrow('portalPair');
  });
});

describe('reglas de los elementos', () => {
  it('la nieve para al pingüino encima', () => {
    expect(move(['@..*..1'], 'right')).toEqual({ player: { x: 3, y: 0 }, collected: 0, broken: 0, flipped: false, blocks: [] });
  });

  it('la flecha lo gira y sigue deslizando', () => {
    // Entra en la flecha hacia la derecha y sale hacia abajo hasta el muro.
    expect(move(['@.v.1', '.....', '.....'], 'right')).toEqual({ player: { x: 2, y: 2 }, collected: 0, broken: 0, flipped: false, blocks: [] });
  });

  it('una flecha contra un muro lo deja parado encima', () => {
    expect(move(['@.^.1'], 'right')).toEqual({ player: { x: 2, y: 0 }, collected: 0, broken: 0, flipped: false, blocks: [] });
  });

  it('el teletransporte lo saca por la pareja en la misma dirección', () => {
    const board = parseBoard(['@.a..', '#####', '..a.1']);
    const trace = traceMove(board, initialState(board), 'right')!;
    expect(trace.state).toEqual({ player: { x: 4, y: 2 }, collected: 1, broken: 0, flipped: false, blocks: [] });
    expect(trace.steps.map((s) => s.kind)).toEqual(['slide', 'slide', 'teleport', 'slide', 'slide']);
  });

  it('el agujero lo devuelve a la salida y conserva las piezas', () => {
    expect(move(['@.1.O.2'], 'right')).toEqual({ player: { x: 0, y: 0 }, collected: 1, broken: 0, flipped: false, blocks: [] });
  });

  it('caer al agua desde la salida sí cuenta como movimiento', () => {
    expect(move(['@O..1'], 'right')).toEqual({ player: { x: 0, y: 0 }, collected: 0, broken: 0, flipped: false, blocks: [] });
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

describe('hielo frágil', () => {
  it('la primera vez se rompe y el pingüino sigue deslizando', () => {
    const board = parseBoard(['@.x..', '....1']);
    const trace = traceMove(board, initialState(board), 'right')!;
    expect(trace.state).toEqual({ player: { x: 4, y: 0 }, collected: 0, broken: 1, flipped: false, blocks: [] });
    expect(trace.steps.map((s) => s.breaks)).toEqual([false, true, false, false]);
  });

  it('roto es un agujero: al volver a pasar cae y vuelve a la salida', () => {
    const board = parseBoard(['@.x..', '....1']);
    const after = applyMove(board, initialState(board), 'right')!;
    expect(applyMove(board, after, 'left')).toEqual({ player: { x: 0, y: 0 }, collected: 0, broken: 1, flipped: false, blocks: [] });
  });

  it('pararse encima también lo rompe', () => {
    const board = parseBoard(['@.x#', '...1']);
    const stopped = applyMove(board, initialState(board), 'right')!;
    expect(stopped).toEqual({ player: { x: 2, y: 0 }, collected: 0, broken: 1, flipped: false, blocks: [] });
    const back = applyMove(board, stopped, 'left')!;
    expect(applyMove(board, back, 'right')).toEqual({ player: { x: 0, y: 0 }, collected: 0, broken: 1, flipped: false, blocks: [] });
  });

  it('cada casilla lleva su bit', () => {
    const board = parseBoard(['@x.x.1']);
    expect(board.cracks).toEqual([{ x: 1, y: 0 }, { x: 3, y: 0 }]);
    expect(applyMove(board, initialState(board), 'right')).toEqual({ player: { x: 5, y: 0 }, collected: 1, broken: 3, flipped: false, blocks: [] });
  });

  it('el solver tiene en cuenta lo que ya está roto', () => {
    const board = parseBoard(['@x1']);
    expect(solve(board)).toEqual(['right']);
    expect(solve(board, { ...initialState(board), broken: 1 })).toBeNull();
  });

  it('como mucho MAX_CRACKS por tablero', () => {
    expect(() => parseBoard(['@xxxxxx1'])).not.toThrow();
    expect(() => parseBoard(['@xxxxxxx1'])).toThrow('manyCracks');
  });
});

describe('espejos', () => {
  it('/ manda hacia arriba al que llega por la izquierda, y sigue deslizando', () => {
    const board = parseBoard(['..1', '...', '@.m']);
    const trace = traceMove(board, initialState(board), 'right')!;
    expect(trace.state.player).toEqual({ x: 2, y: 0 });
    expect(trace.state.collected).toBe(1);
    expect(trace.steps.map((s) => s.dir)).toEqual(['right', 'up', 'up', 'up']);
  });

  it('\\ manda hacia abajo al que llega por la izquierda', () => {
    expect(move(['@.n', '...', '..1'], 'right')).toMatchObject({ player: { x: 2, y: 2 }, collected: 1 });
  });

  it('el giro depende de por dónde llegue', () => {
    // Al mismo espejo /, llegando hacia la izquierda sale hacia abajo.
    expect(move(['m.@', '...', '1..'], 'left')).toMatchObject({ player: { x: 0, y: 2 }, collected: 1 });
  });

  it('un espejo contra un muro lo deja parado encima', () => {
    expect(move(['@.m', '..1'], 'right')).toMatchObject({ player: { x: 2, y: 0 }, collected: 0 });
  });

  it('espejos que se mandan unos a otros son un bucle', () => {
    // Subiendo por la columna de la derecha, los cuatro espejos lo hacen dar vueltas sin fin.
    const ring = parseBoard(['#######', '#m...n#', '#..1..#', '#....@#', '#n...m#', '#######']);
    expect(traceMove(ring, initialState(ring), 'up')?.looped).toBe(true);
    expect(hasLoops(ring)).toBe(true);
  });
});

describe('pasos de un sentido', () => {
  it('se cruzan en su dirección', () => {
    expect(move(['@.R..1'], 'right')).toMatchObject({ player: { x: 5, y: 0 }, collected: 1 });
  });

  it('desde otra dirección hacen de muro', () => {
    expect(move(['1..L.@'], 'left')).toMatchObject({ player: { x: 0, y: 0 }, collected: 1 });
    expect(move(['1..R.@'], 'left')).toMatchObject({ player: { x: 4, y: 0 }, collected: 0 });
  });

  it('si estás encima, sales hacia donde quieras', () => {
    const board = parseBoard(['1.U.@']);
    const onIt = { ...initialState(board), player: { x: 2, y: 0 } };
    expect(applyMove(board, onIt, 'left')).toMatchObject({ player: { x: 0, y: 0 }, collected: 1 });
  });
});

describe('interruptor y puertas', () => {
  it('la puerta cerrada es un muro y la abierta, hielo', () => {
    expect(move(['@.G.1'], 'right')).toMatchObject({ player: { x: 1, y: 0 }, flipped: false });
    expect(move(['@.g.1'], 'right')).toMatchObject({ player: { x: 4, y: 0 }, collected: 1 });
  });

  it('pasar por el interruptor da la vuelta a todas las puertas', () => {
    const board = parseBoard(['@S..#', '.....', 'G...1', 'g....']);
    const after = applyMove(board, initialState(board), 'right')!;
    expect(after).toMatchObject({ player: { x: 3, y: 0 }, flipped: true });
    // La G ya está abierta y la g, cerrada: bajando por la izquierda se para en la G.
    expect(applyMove(board, { ...after, player: { x: 0, y: 1 } }, 'down')).toMatchObject({ player: { x: 0, y: 2 } });
  });

  it('cada pasada cuenta: dos interruptores las dejan como estaban', () => {
    expect(move(['@SS.1'], 'right')).toMatchObject({ flipped: false, collected: 1 });
  });
});

describe('bloques empujables', () => {
  it('el bloque se desliza hasta el obstáculo y el pingüino se queda donde chocó', () => {
    const board = parseBoard(['@.K..#', '.....1']);
    const trace = traceMove(board, initialState(board), 'right')!;
    expect(trace.state).toMatchObject({ player: { x: 1, y: 0 }, blocks: [{ x: 4, y: 0 }] });
    expect(trace.steps.at(-1)).toMatchObject({ kind: 'push', push: { from: { x: 2, y: 0 }, to: { x: 4, y: 0 } } });
  });

  it('pegado al bloque, empujarlo también es un movimiento', () => {
    expect(move(['@K...', '....1'], 'right')).toMatchObject({ player: { x: 0, y: 0 }, blocks: [{ x: 4, y: 0 }] });
  });

  it('si no se puede mover, hace de muro', () => {
    expect(move(['@K#', '..1'], 'right')).toBeNull();
    expect(move(['@.K#', '...1'], 'right')).toMatchObject({ player: { x: 1, y: 0 }, blocks: [{ x: 2, y: 0 }] });
  });

  it('solo se desliza por hielo normal: lo paran los elementos, las piezas y la salida', () => {
    expect(move(['@.K.*', '....1'], 'right')).toMatchObject({ blocks: [{ x: 3, y: 0 }] });
    expect(move(['@.K.2', '....1'], 'right')).toMatchObject({ blocks: [{ x: 3, y: 0 }] });
    const board = parseBoard(['.K.@.', '....1']);
    const onLeft = { ...initialState(board), player: { x: 0, y: 0 } };
    expect(applyMove(board, onLeft, 'right')).toMatchObject({ blocks: [{ x: 2, y: 0 }] });
  });

  it('el solver mueve los bloques para abrirse paso', () => {
    // Sin el bloque se pasaría de largo por encima del pasillo: empujado contra
    // el muro, sirve de tope para pararse justo encima y bajar.
    const board = parseBoard(['#######', '#@.K.##', '###.###', '###.###', '###1###', '#######']);
    const solution = solve(board);
    expect(solution).toEqual(['right', 'right', 'down']);
    let state = initialState(board);
    for (const dir of solution!) state = applyMove(board, state, dir)!;
    expect(isComplete(board, state)).toBe(true);
  });

  it('como mucho MAX_BLOCKS por tablero', () => {
    expect(() => parseBoard(['@KKK.1'])).not.toThrow();
    expect(() => parseBoard(['@KKKK.1'])).toThrow('manyBlocks');
  });
});

describe('desbloqueo', () => {
  it('cada elemento sale a partir de su nivel', () => {
    expect(ELEMENTS.map((e) => e.level)).toEqual([15, 30, 45, 60, 75, 90, 105, 120, 135]);
    expect(unlockedElements(14)).toEqual([]);
    expect(unlockedElements(15)).toEqual(['snow']);
    expect(unlockedElements(59)).toEqual(['snow', 'arrow', 'portal']);
    expect(unlockedElements(60)).toEqual(['snow', 'arrow', 'portal', 'hole']);
    expect(unlockedElements(75)).toEqual(['snow', 'arrow', 'portal', 'hole', 'crack']);
    expect(unlockedElements(135)).toEqual(['snow', 'arrow', 'portal', 'hole', 'crack', 'mirror', 'oneway', 'switch', 'block']);
  });
});

describe('generador con elementos', () => {
  const levels = [15, 16, 30, 31, 45, 46, 60, 61, 75, 76, 90, 91, 105, 106, 120, 121, 135, 136, 150];
  const seeds = [1, 2, 3];
  // Generar es lo más lento de los tests; con la máquina ocupada (o en CI) puede pasar de 5 s.
  const SLOW = 30_000;

  for (const level of levels) {
    it(`nivel ${level}: resoluble, sin callejones ni bucles, y usa los elementos`, () => {
      for (const seed of seeds) {
        const { board, solution, rows } = generateLevel(level, seed);
        expect(rows.join('')).not.toMatch(/[^#.@1-9*^v<>a-eOxmnUDLRSGgK]/);
        // Con bloques se permiten los atascos (ver generateLevel).
        if (board.blocks.length === 0) expect(countDeadEnds(board)).toBe(0);
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
