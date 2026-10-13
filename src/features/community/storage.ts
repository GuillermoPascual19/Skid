// Borrador del editor de niveles, guardado en el navegador a cada cambio.

import { read, remove, write } from '../../shared/storage';

const EDITOR_KEY = 'skid.editor.v1';

/** Nivel a medio crear en el editor. */
export interface EditorDraft {
  readonly name: string;
  readonly rows: readonly string[];
  /**
   * Cómo superó el autor el tablero (registro de movimientos). Solo vale si
   * `proofRows` coincide con el tablero actual: cualquier cambio obliga a probarlo otra vez.
   */
  readonly proofLog?: string;
  readonly proofRows?: string;
}

export function loadEditorDraft(): EditorDraft | null {
  const draft = read<EditorDraft>(EDITOR_KEY);
  return draft && Array.isArray(draft.rows) && draft.rows.length > 0 ? draft : null;
}

export function saveEditorDraft(draft: EditorDraft | null): void {
  if (draft) write(EDITOR_KEY, draft);
  else remove(EDITOR_KEY);
}
