import { DOCK_STYLES } from './dockStyles.ts';
import { MODAL_STYLES } from './modalStyles.ts';

const ATTACHMENTS_STYLE_ID = 'omnimux-attachments-styles';

export const BASE_CSS = `${DOCK_STYLES}\n${MODAL_STYLES}`;

export function ensureStylesInjected(): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(ATTACHMENTS_STYLE_ID);
  if (existing) {
    if (existing.textContent !== BASE_CSS) {
      existing.textContent = BASE_CSS;
    }
    return;
  }
  const styleEl = document.createElement('style');
  styleEl.id = ATTACHMENTS_STYLE_ID;
  styleEl.textContent = BASE_CSS;
  document.head.appendChild(styleEl);
}
