// Editor de niveles de la comunidad: se pinta el tablero, se prueba (hay que
// superarlo para poder publicarlo) y se publica. El borrador se guarda en el
// navegador a cada cambio.

import { penguinSvg } from '../../art/hats';
import { elementSvg } from '../../art/elements';
import { PORTAL_CHARS } from '../../logic/engine/board';
import { checkCustomLevel, CUSTOM_LIMITS, encodeRows } from '../../logic/community/community';
import { ELEMENTS, unlockedElements, type ElementId } from '../../logic/engine/elements';
import { cellArt } from './board-art';
import { h, openModal, svg, toast } from '../../shared/dom';
import { ensureName } from '../profile/profile';
import { go, type Screen } from '../../shared/router';
import { publishCustomLevel } from './api';
import { type EditorDraft, loadEditorDraft, saveEditorDraft } from './storage';
import { startingProgress } from '../free-play/storage';

type Tool = 'wall' | 'ice' | 'start' | 'piece' | 'snow' | 'arrow' | 'portal' | 'hole';

interface ToolDef {
  readonly id: Tool;
  readonly label: string;
  readonly help: string;
  /** Elemento que hay que tener desbloqueado para usar la herramienta. */
  readonly element?: ElementId;
  /** Se puede pintar arrastrando el dedo. */
  readonly paint?: boolean;
}

const TOOLS: readonly ToolDef[] = [
  { id: 'wall', label: 'Muro', help: 'Bloques de nieve: el pingüino choca y se para delante. Arrastra para pintar varios.', paint: true },
  { id: 'ice', label: 'Borrar', help: 'Deja la casilla de hielo normal. Arrastra para borrar varias.', paint: true },
  { id: 'start', label: 'Pingüino', help: 'Dónde empieza el pingüino. Solo hay uno.' },
  { id: 'piece', label: 'Pieza', help: 'Pon las piezas en el orden en que hay que recogerlas (hasta 9). Toca una pieza para quitarla.' },
  { id: 'snow', label: 'Nieve', element: 'snow', help: 'El pingüino se para encima.', paint: true },
  { id: 'arrow', label: 'Corriente', element: 'arrow', help: 'Gira al pingüino. Toca una corriente ya puesta para cambiar su dirección.' },
  { id: 'portal', label: 'Teletransporte', element: 'portal', help: 'Van por parejas del mismo color (hasta 5): pon uno y luego su pareja. Toca uno para quitarlo.' },
  { id: 'hole', label: 'Agujero', element: 'hole', help: 'Quien cae vuelve a la salida (con las piezas que lleve).', paint: true },
];

const ARROW_TURN: Record<string, string> = { '>': 'v', v: '<', '<': '^', '^': '>' };
const DEFAULT_ROWS = ['@......', '.......', '...#...', '.......', '.#...#.', '.......', '......1'];

/** Los mensajes del parser hablan de '@'; en el editor, del pingüino. */
function friendlyError(message: string): string {
  if (message.includes('no tiene jugador')) return 'Falta el pingüino';
  if (message.includes('más de un jugador')) return 'Solo puede haber un pingüino';
  if (message.includes('no tiene piezas')) return 'Pon al menos una pieza';
  if (message.includes('teletransporte')) return 'Hay un teletransporte sin pareja';
  return message;
}

export function editorScreen(): Screen {
  const saved = loadEditorDraft();
  let name = saved?.name ?? '';
  let grid = (saved?.rows ?? DEFAULT_ROWS).map((r) => [...r]);
  let proof: Pick<EditorDraft, 'proofLog' | 'proofRows'> = { proofLog: saved?.proofLog, proofRows: saved?.proofRows };
  const unlocked = new Set(unlockedElements(startingProgress().level));
  let tool: Tool = 'wall';

  const rows = () => grid.map((r) => r.join(''));
  const width = () => grid[0].length;
  const height = () => grid.length;
  const proven = () => !!proof.proofLog && proof.proofRows === encodeRows(rows());
  const persist = () => saveEditorDraft({ name, rows: rows(), ...proof });

  // ------------------------------------------------------------ Edición

  /** Renumera las piezas 1..n respetando su orden (al quitar una, las de después bajan). */
  function renumber() {
    const pieces: { x: number; y: number; n: number }[] = [];
    grid.forEach((row, y) => row.forEach((ch, x) => /[1-9]/.test(ch) && pieces.push({ x, y, n: Number(ch) })));
    pieces.sort((a, b) => a.n - b.n).forEach((p, i) => (grid[p.y][p.x] = String(i + 1)));
  }

  function countOf(test: (ch: string) => boolean): number {
    return grid.flat().filter(test).length;
  }

  function apply(x: number, y: number) {
    const ch = grid[y][x];
    let next = ch;
    switch (tool) {
      case 'wall':
        next = '#';
        break;
      case 'ice':
        next = '.';
        break;
      case 'snow':
        next = '*';
        break;
      case 'hole':
        next = 'O';
        break;
      case 'start':
        grid = grid.map((row) => row.map((c) => (c === '@' ? '.' : c)));
        next = '@';
        break;
      case 'piece': {
        if (/[1-9]/.test(ch)) next = '.';
        else {
          const pieces = countOf((c) => /[1-9]/.test(c));
          if (pieces >= CUSTOM_LIMITS.maxPieces) return toast(`Como mucho ${CUSTOM_LIMITS.maxPieces} piezas`);
          next = String(pieces + 1);
        }
        break;
      }
      case 'arrow':
        next = ARROW_TURN[ch] ?? '>';
        break;
      case 'portal': {
        if ((PORTAL_CHARS as readonly string[]).includes(ch)) {
          next = '.';
          break;
        }
        // Primero se completa la pareja que esté a medias; si no, se empieza una nueva.
        const uses = (l: string) => countOf((c) => c === l);
        const letter = PORTAL_CHARS.find((l) => uses(l) === 1) ?? PORTAL_CHARS.find((l) => uses(l) === 0);
        if (!letter) return toast(`Como mucho ${PORTAL_CHARS.length} parejas de teletransportes`);
        next = letter;
        break;
      }
    }
    if (next === ch && tool !== 'start') return;
    grid[y][x] = next;
    renumber();
    persist();
    renderBoard();
  }

  function resize(w: number, hgt: number) {
    const { minSize, maxWidth, maxHeight } = CUSTOM_LIMITS;
    if (w < minSize || hgt < minSize || w > maxWidth || hgt > maxHeight) return;
    grid = Array.from({ length: hgt }, (_, y) => Array.from({ length: w }, (_, x) => grid[y]?.[x] ?? '.'));
    renumber();
    persist();
    renderBoard();
  }

  // ------------------------------------------------------------- Vista

  const board = h('div', { class: 'editor-grid' });
  const status = h('p', { class: 'editor-status', role: 'status' });
  const sizeLabel = h('strong');
  const help = h('p', { class: 'editor-help' });
  const palette = h('div', { class: 'palette', role: 'radiogroup', 'aria-label': 'Herramienta' });
  const nameInput = h('input', {
    class: 'field',
    placeholder: 'Nombre del nivel',
    maxLength: CUSTOM_LIMITS.maxName,
    value: name,
    oninput: () => {
      name = nameInput.value;
      persist();
      renderStatus();
    },
  });
  const testBtn = h('button', { class: 'btn secondary', onclick: () => testLevel() }, '▶ Probar');
  const publishBtn = h('button', { class: 'btn', onclick: () => void publish() }, 'Publicar');

  function toolIcon(id: Tool): Node {
    if (id === 'wall') return h('span', { class: 'tool-swatch wall' });
    if (id === 'ice') return h('span', { class: 'tool-swatch ice' });
    if (id === 'start') return svg(penguinSvg());
    if (id === 'piece') return h('span', { class: 'tool-piece' }, '1');
    return svg(elementSvg(id === 'arrow' ? 'arrow' : (id as ElementId)));
  }

  function renderPalette() {
    palette.replaceChildren(
      ...TOOLS.map((t) => {
        const locked = t.element !== undefined && !unlocked.has(t.element);
        const unlockLevel = ELEMENTS.find((e) => e.id === t.element)?.level;
        return h(
          'button',
          {
            class: `tool ${tool === t.id ? 'active' : ''} ${locked ? 'locked' : ''}`,
            role: 'radio',
            'aria-checked': String(tool === t.id),
            disabled: locked,
            title: locked ? `Se desbloquea en el nivel ${unlockLevel} del modo libre` : t.help,
            onclick: () => {
              tool = t.id;
              renderPalette();
            },
          },
          h('span', { class: 'tool-icon' }, toolIcon(t.id)),
          h('span', null, locked ? `🔒 Nv. ${unlockLevel}` : t.label),
        );
      }),
    );
    help.textContent = TOOLS.find((t) => t.id === tool)!.help;
  }

  function renderBoard() {
    board.style.gridTemplateColumns = `repeat(${width()}, 1fr)`;
    board.style.setProperty('--cols', String(width()));
    board.replaceChildren(
      ...grid.flatMap((row, y) =>
        row.map((ch, x) => {
          const kind = ch === '#' ? 'wall' : 'ice';
          const cell = h('div', { class: `ecell ${kind} ${(x + y) % 2 ? 'alt' : ''}`, 'data-x': x, 'data-y': y });
          if (ch === '@') cell.append(svg(penguinSvg()));
          else if (/[1-9]/.test(ch)) cell.append(h('span', { class: `epiece ${ch === '1' ? 'first' : ''}` }, ch));
          else if (cellArt(ch)) cell.append(svg(cellArt(ch)));
          return cell;
        }),
      ),
    );
    sizeLabel.textContent = `${width()} × ${height()}`;
    renderStatus();
  }

  function renderStatus() {
    let valid = false;
    try {
      const { solution } = checkCustomLevel(rows());
      valid = true;
      status.className = 'editor-status ok';
      status.textContent = proven()
        ? `✓ Superado. Óptimo: ${solution.length} movimientos. ¡Ya puedes publicarlo!`
        : `✓ Tiene solución (óptimo: ${solution.length} movimientos). Pruébalo y supéralo para poder publicarlo.`;
    } catch (err) {
      status.className = 'editor-status error';
      status.textContent = friendlyError((err as Error).message);
    }
    testBtn.disabled = !valid;
    publishBtn.disabled = !valid || !proven() || name.trim().length < CUSTOM_LIMITS.minName;
  }

  // Pintar: al pulsar y, con las herramientas de pintar, arrastrando.
  let painting = false;
  const cellAt = (e: PointerEvent) => (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('.ecell');
  board.addEventListener('pointerdown', (e) => {
    const cell = cellAt(e);
    if (!cell) return;
    e.preventDefault();
    painting = !!TOOLS.find((t) => t.id === tool)?.paint;
    apply(Number(cell.dataset.x), Number(cell.dataset.y));
  });
  board.addEventListener('pointermove', (e) => {
    if (!painting) return;
    const cell = cellAt(e);
    if (cell) apply(Number(cell.dataset.x), Number(cell.dataset.y));
  });
  const stop = () => (painting = false);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);

  // ---------------------------------------------------------- Acciones

  function testLevel() {
    persist();
    go({ name: 'customTest', rows: rows() });
  }

  async function publish() {
    if (!proof.proofLog || !proven()) return;
    const clean = name.trim();
    if (clean.length < CUSTOM_LIMITS.minName) return toast(`El nombre debe tener al menos ${CUSTOM_LIMITS.minName} letras`);
    publishBtn.disabled = true;
    try {
      if (!(await ensureName())) return;
      await publishCustomLevel(clean, rows(), proof.proofLog);
      saveEditorDraft(null);
      toast('¡Nivel publicado!');
      go({ name: 'community', tab: 'mine' });
    } catch (err) {
      toast((err as Error).message);
    } finally {
      publishBtn.disabled = false;
      renderStatus();
    }
  }

  function startOver() {
    const modal = openModal(
      [
        h('h2', null, '¿Empezar de cero?'),
        h('p', { class: 'lead' }, 'Se borra el tablero que estás creando.'),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => modal.close() }, 'Cancelar'),
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                modal.close();
                grid = DEFAULT_ROWS.map((r) => [...r]);
                name = '';
                nameInput.value = '';
                proof = {};
                persist();
                renderBoard();
              },
            },
            'Borrar',
          ),
        ),
      ],
      { dismissable: true },
    );
  }

  const stepper = (label: string, onMinus: () => void, onPlus: () => void) =>
    h(
      'div',
      { class: 'stepper' },
      h('span', null, label),
      h('button', { class: 'icon-btn small', 'aria-label': `Menos ${label.toLowerCase()}`, onclick: onMinus }, '−'),
      h('button', { class: 'icon-btn small', 'aria-label': `Más ${label.toLowerCase()}`, onclick: onPlus }, '+'),
    );

  const el = h(
    'div',
    { class: 'screen editor' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': 'Volver', onclick: () => go({ name: 'community' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, 'Crear nivel'), h('p', null, 'Multijugador')),
    ),
    nameInput,
    h(
      'div',
      { class: 'editor-size' },
      stepper('Ancho', () => resize(width() - 1, height()), () => resize(width() + 1, height())),
      sizeLabel,
      stepper('Alto', () => resize(width(), height() - 1), () => resize(width(), height() + 1)),
    ),
    board,
    status,
    palette,
    help,
    h('div', { class: 'row' }, testBtn, publishBtn),
    h('button', { class: 'link-btn', onclick: startOver }, 'Empezar de cero'),
  );

  return {
    el,
    mount() {
      renderPalette();
      renderBoard();
    },
    dispose() {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    },
  };
}
