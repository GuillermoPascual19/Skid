// Editor de niveles de la comunidad: se pinta el tablero, se prueba (hay que
// superarlo para poder publicarlo) y se publica. El borrador se guarda en el
// navegador a cada cambio.

import { penguinSvg } from '../../../../common/art/hats';
import { elementSvg } from '../../../../common/art/elements';
import { BoardError, PORTAL_CHARS } from '../../../../common/logic/engine/board';
import { checkCustomLevel, CUSTOM_LIMITS, encodeRows } from '../../../../common/logic/community/community';
import { ELEMENTS, unlockedElements, type ElementId } from '../../../../common/logic/engine/elements';
import { cellArt } from './board-art';
import { h, openModal, svg, toast } from '../../shared/dom';
import { ensureName } from '../profile/profile';
import { go, type Screen } from '../../shared/router';
import { publishCustomLevel } from './api';
import { type EditorDraft, loadEditorDraft, saveEditorDraft } from './storage';
import { startingProgress } from '../free-play/storage';
import { t, te } from '../../i18n/i18n';

type Tool = 'wall' | 'ice' | 'start' | 'piece' | 'snow' | 'arrow' | 'portal' | 'hole';

interface ToolDef {
  readonly id: Tool;
  /** El nombre y la ayuda de cada herramienta están en los diccionarios (editor.tools.<id>). */
  /** Elemento que hay que tener desbloqueado para usar la herramienta. */
  readonly element?: ElementId;
  /** Se puede pintar arrastrando el dedo. */
  readonly paint?: boolean;
}

const TOOLS: readonly ToolDef[] = [
  { id: 'wall', paint: true },
  { id: 'ice', paint: true },
  { id: 'start' },
  { id: 'piece' },
  { id: 'snow', element: 'snow', paint: true },
  { id: 'arrow', element: 'arrow' },
  { id: 'portal', element: 'portal' },
  { id: 'hole', element: 'hole', paint: true },
];

const ARROW_TURN: Record<string, string> = { '>': 'v', v: '<', '<': '^', '^': '>' };
const DEFAULT_ROWS = ['@......', '.......', '...#...', '.......', '.#...#.', '.......', '......1'];

/** Por qué no vale el tablero, en el idioma del jugador (los mismos mensajes que da el servidor). */
function boardProblem(err: unknown): string {
  return err instanceof BoardError ? te(`board_${err.code}`, err.params) : te('board_invalid');
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
          if (pieces >= CUSTOM_LIMITS.maxPieces) return toast(t('editor.maxPieces', { n: CUSTOM_LIMITS.maxPieces }));
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
        if (!letter) return toast(t('editor.maxPortals', { n: PORTAL_CHARS.length }));
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
  const palette = h('div', { class: 'palette', role: 'radiogroup', 'aria-label': t('editor.tool') });
  /** El error del nombre (o al publicar), junto al campo y no en un aviso suelto. */
  const nameError = h('p', { class: 'error field-error', id: 'editor-name-error', role: 'alert', hidden: true });
  const nameInput = h('input', {
    class: 'field',
    placeholder: t('editor.namePlaceholder'),
    'aria-label': t('editor.namePlaceholder'),
    'aria-describedby': 'editor-name-error',
    maxLength: CUSTOM_LIMITS.maxName,
    value: name,
    oninput: () => {
      name = nameInput.value;
      showNameError(null);
      persist();
      renderStatus();
    },
  });

  function showNameError(message: string | null) {
    nameError.textContent = message ?? '';
    nameError.hidden = !message;
    nameInput.toggleAttribute('aria-invalid', !!message);
    if (message) nameInput.focus();
  }
  const testBtn = h('button', { class: 'btn secondary', onclick: () => testLevel() }, `▶ ${t('editor.test')}`);
  const publishBtn = h('button', { class: 'btn', onclick: () => void publish() }, t('editor.publish'));

  function toolIcon(id: Tool): Node {
    if (id === 'wall') return h('span', { class: 'tool-swatch wall' });
    if (id === 'ice') return h('span', { class: 'tool-swatch ice' });
    if (id === 'start') return svg(penguinSvg());
    if (id === 'piece') return h('span', { class: 'tool-piece' }, '1');
    return svg(elementSvg(id === 'arrow' ? 'arrow' : (id as ElementId)));
  }

  function renderPalette() {
    palette.replaceChildren(
      ...TOOLS.map((item) => {
        const locked = item.element !== undefined && !unlocked.has(item.element);
        const unlockLevel = ELEMENTS.find((e) => e.id === item.element)?.level;
        return h(
          'button',
          {
            class: `tool ${tool === item.id ? 'active' : ''} ${locked ? 'locked' : ''}`,
            role: 'radio',
            'aria-checked': String(tool === item.id),
            disabled: locked,
            title: locked ? t('editor.unlocksAt', { n: unlockLevel ?? 0 }) : t(`editor.tools.${item.id}.help`),
            onclick: () => {
              tool = item.id;
              renderPalette();
            },
          },
          h('span', { class: 'tool-icon' }, toolIcon(item.id)),
          h('span', null, locked ? `🔒 ${t('editor.levelShort', { n: unlockLevel ?? 0 })}` : t(`editor.tools.${item.id}.label`)),
        );
      }),
    );
    help.textContent = t(`editor.tools.${tool}.help`);
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
        ? `✓ ${t('editor.status.proven', { n: solution.length })}`
        : `✓ ${t('editor.status.solvable', { n: solution.length })}`;
    } catch (err) {
      status.className = 'editor-status error';
      status.textContent = boardProblem(err);
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
    painting = !!TOOLS.find((item) => item.id === tool)?.paint;
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
    if (clean.length < CUSTOM_LIMITS.minName) return showNameError(t('editor.nameTooShort', { n: CUSTOM_LIMITS.minName }));
    publishBtn.disabled = true;
    try {
      if (!(await ensureName())) return;
      await publishCustomLevel(clean, rows(), proof.proofLog);
      saveEditorDraft(null);
      toast(t('editor.published'));
      go({ name: 'community', tab: 'mine' });
    } catch (err) {
      // Lo que rechaza el servidor (nombre ocupado, inapropiado, nivel repetido…), junto al nombre.
      showNameError((err as Error).message);
    } finally {
      publishBtn.disabled = false;
      renderStatus();
    }
  }

  function startOver() {
    const modal = openModal(
      [
        h('h2', null, t('editor.reset.title')),
        h('p', { class: 'lead' }, t('editor.reset.text')),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost', onclick: () => modal.close() }, t('common.cancel')),
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
            t('levels.card.delete'),
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
      h('button', { class: 'icon-btn small', 'aria-label': t('editor.less', { what: label }), onclick: onMinus }, '−'),
      h('button', { class: 'icon-btn small', 'aria-label': t('editor.more', { what: label }), onclick: onPlus }, '+'),
    );

  const el = h(
    'div',
    { class: 'screen editor' },
    h(
      'header',
      { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': t('common.back'), onclick: () => go({ name: 'community' }) }, '←'),
      h('div', { class: 'title' }, h('h1', null, t('levels.create.button')), h('p', null, t('home.community.eyebrow'))),
    ),
    nameInput,
    nameError,
    h(
      'div',
      { class: 'editor-size' },
      stepper(t('editor.width'), () => resize(width() - 1, height()), () => resize(width() + 1, height())),
      sizeLabel,
      stepper(t('editor.height'), () => resize(width(), height() - 1), () => resize(width(), height() + 1)),
    ),
    board,
    status,
    palette,
    help,
    h('div', { class: 'row' }, testBtn, publishBtn),
    h('button', { class: 'link-btn', onclick: startOver }, t('editor.reset.link')),
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
