import { RIVAL_COLLECTION_MEDIA_RATIO, RIVAL_COLLECTION_TITLE_HEIGHT } from './rival-masonry.js'

const COLLECTION_STYLES_ID = 'omnimux-inspiration-collection-styles'

export const COLLECTION_CSS = `
.omnimux-inspiration-collection-surface { position: relative; }
.omnimux-inspiration-collection-navigation,
.omnimux-inspiration-collection-selection {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.omnimux-inspiration-collection-heading,
.omnimux-inspiration-collection-selection > span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 20px;
}
.omnimux-inspiration-collection-selection {
  padding: 6px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.omnimux-inspiration-collection-menu {
  position: absolute;
  right: 5px;
  bottom: 5px;
  z-index: 8;
}
.omnimux-inspiration-collection-menu > div { display: flex; }
.omnimux-inspiration-toast.has-action { pointer-events: auto; }
[data-collection-dragging="true"] { opacity: 0.4; }
[data-collection-drop] { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
[data-collection-drop]::after {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-mask-1);
  color: var(--dsw-specific-media-fg);
  pointer-events: none;
  border-radius: inherit;
  font-size: 13px;
  line-height: 18px;
}
[data-collection-drop="create"]::after { content: attr(data-collection-drop-label); }
[data-collection-drop="add"]::after { content: attr(data-collection-drop-label); }
.omnimux-inspiration-collection-drag-ghost {
  position: fixed;
  left: var(--collection-drag-x);
  top: var(--collection-drag-y);
  width: 104px;
  z-index: 110;
  pointer-events: none;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-elevated);
  color: var(--dsw-alias-label-primary);
}
.omnimux-inspiration-collection-drag-ghost img { width: 100%; height: 76px; object-fit: cover; display: block; }
.omnimux-inspiration-collection-drag-ghost span { display: block; padding: 6px 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 16px; }
.omnimux-rival-card.omnimux-inspiration-collection-card {
  box-sizing: border-box;
  min-height: 0;
}
.omnimux-inspiration-collection-card.is-preview {
  position: relative;
  left: auto;
  top: auto;
  width: 100%;
  cursor: default;
}
.omnimux-inspiration-collection-card .omnimux-inspiration-collection-cover {
  display: flex;
  width: 100%;
  aspect-ratio: ${RIVAL_COLLECTION_MEDIA_RATIO};
  gap: 3px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-2);
}
.omnimux-inspiration-collection-column {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
}
.omnimux-inspiration-collection-column img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 35%;
}
.omnimux-inspiration-collection-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-alias-bg-layer-2);
}
.omnimux-inspiration-collection-more-count {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-specific-media-fg);
  background: var(--dsw-specific-media-pill-bg);
  font-size: 24px;
  line-height: 28px;
  font-weight: 500;
}
.omnimux-inspiration-collection-title {
  display: flex;
  align-items: center;
  gap: 6px;
  box-sizing: border-box;
  min-width: 0;
  height: ${RIVAL_COLLECTION_TITLE_HEIGHT}px;
  padding: 0 42px 0 11px;
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.omnimux-inspiration-collection-title > svg {
  flex-shrink: 0;
  color: var(--dsw-alias-label-secondary);
}
.omnimux-inspiration-collection-title > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.is-preview .omnimux-inspiration-collection-title {
  padding-right: 11px;
}
.omnimux-inspiration-collection-card .omnimux-inspiration-collection-menu {
  position: absolute;
  right: 5px;
  bottom: 5px;
  width: 32px;
  height: 32px;
  border-radius: 8px;
}
.omnimux-inspiration-collection-dialog {
  border-radius: 16px;
}
.omnimux-inspiration-collection-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.omnimux-inspiration-collection-dialog-preview {
  width: 232px;
  max-width: 100%;
  margin: 0 auto;
}
.omnimux-inspiration-collection-name-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.omnimux-inspiration-collection-name-count {
  color: var(--dsw-alias-label-secondary);
  font-weight: 400;
}
.omnimux-inspiration-collection-dialog-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}
.omnimux-inspiration-collection-dialog-error {
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
}
`

export function injectCollectionStyles() {
  if (typeof document === 'undefined' || document.getElementById(COLLECTION_STYLES_ID)) return
  const node = document.createElement('style')
  node.id = COLLECTION_STYLES_ID
  node.textContent = COLLECTION_CSS
  document.head.appendChild(node)
}
