// Me gusta (❤️, con cuántos tiene) y guardar (🔖, privado) de un nivel de la
// comunidad. Cambian al momento y, si el servidor falla, vuelven a como estaban.

import { h, toast } from '../../shared/dom';
import { t } from '../../i18n/i18n';
import { type CustomLevel, likeCustomLevel, saveCustomLevel } from './api';

/** Los dos botones; `onChange` recibe el nivel actualizado (para guardarlo en la lista). */
export function levelMarks(level: CustomLevel, onChange: (level: CustomLevel) => void = () => {}): HTMLElement {
  let current = level;
  const like = h('button', { class: 'mark-btn like' });
  const save = h('button', { class: 'mark-btn save' });
  const paint = () => {
    like.classList.toggle('on', current.liked);
    like.setAttribute('aria-pressed', String(current.liked));
    like.setAttribute('aria-label', current.liked ? t('levels.marks.unlike') : t('levels.marks.like'));
    like.replaceChildren(current.liked ? '❤️' : '🤍', h('span', null, String(current.likes)));
    save.classList.toggle('on', current.saved);
    save.setAttribute('aria-pressed', String(current.saved));
    save.setAttribute('aria-label', current.saved ? t('levels.marks.unsave') : t('levels.marks.save'));
    save.title = save.getAttribute('aria-label')!;
    save.textContent = current.saved ? '🔖' : '📑';
  };
  async function toggle(kind: 'like' | 'save') {
    const before = current;
    current = kind === 'like' ? { ...current, liked: !current.liked, likes: current.likes + (current.liked ? -1 : 1) } : { ...current, saved: !current.saved };
    paint();
    try {
      current = kind === 'like' ? await likeCustomLevel(current.id, current.liked) : await saveCustomLevel(current.id, current.saved);
      if (kind === 'save') toast(current.saved ? t('levels.marks.saved') : t('levels.marks.unsaved'));
      paint();
      onChange(current);
    } catch (err) {
      current = before;
      paint();
      toast((err as Error).message);
    }
  }
  like.addEventListener('click', (e) => (e.stopPropagation(), void toggle('like')));
  save.addEventListener('click', (e) => (e.stopPropagation(), void toggle('save')));
  paint();
  return h('span', { class: 'level-marks' }, like, save);
}
