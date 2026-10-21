/**
 * Styles for the Flow-alignment surface (generation history rail + cost line).
 *
 * Kept in the viewer plugin rather than the hub's shared media-viewer sheet:
 * every selector is owned by this plugin's tab UI and none of the rules touch
 * existing class names. The root becomes an inline-size container so the rail
 * turns into a drawer based on the *tab* width, not the window width.
 */

export const FLOW_ALIGNMENT_STYLE_ID = 'omnimux-media-viewer-flow-alignment';

export const FLOW_ALIGNMENT_CSS = `
.omx-media-viewer { container: omx-mv / inline-size; }

/* ---------- history rail (wide default) ---------- */
.omx-mv-history {
  display: flex;
  flex-direction: column;
  flex: 0 0 260px;
  width: 260px;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
}
.omx-mv-history__header {
  flex: 0 0 auto;
  height: 40px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.omx-mv-history__title {
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}
.omx-mv-history__close {
  display: none;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.omx-mv-history__close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.omx-mv-history__empty {
  margin: 0;
  padding: 20px 16px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.omx-mv-history__list {
  list-style: none;
  margin: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.omx-mv-history__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.omx-mv-history__card {
  display: flex;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.omx-mv-history__card:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.omx-mv-history__card[aria-current="true"] {
  border-color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-bg-layer-2);
}
.omx-mv-history__thumb {
  position: relative;
  flex: 0 0 56px;
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dsw-alias-bg-layer-2);
}
.omx-mv-history__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.omx-mv-history__placeholder {
  padding: 0 4px;
  font-size: 11px;
  line-height: 14px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
}
.omx-mv-history__count {
  position: absolute;
  right: 2px;
  bottom: 2px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.55));
  color: var(--dsw-alias-label-primary);
  font-size: 10px;
  line-height: 14px;
}
.omx-mv-history__body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  min-width: 0;
}
.omx-mv-history__prompt {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
  line-height: 16px;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}
.omx-mv-history__meta {
  font-size: 11px;
  line-height: 14px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.omx-mv-history__status {
  font-size: 11px;
  line-height: 14px;
  color: var(--dsw-alias-label-secondary);
}
.omx-mv-history__item[data-status="failed"] .omx-mv-history__status,
.omx-mv-history__item[data-status="failed"] .omx-mv-history__placeholder {
  color: var(--dsw-alias-state-error-primary);
}
.omx-mv-history__actions {
  display: flex;
  gap: 4px;
  padding-left: 64px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.omx-mv-history__item:hover .omx-mv-history__actions,
.omx-mv-history__item:focus-within .omx-mv-history__actions {
  opacity: 1;
}
.omx-mv-history__action {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.omx-mv-history__action:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-border-l3);
}
.omx-mv-history__action:disabled {
  color: var(--dsw-alias-label-tertiary);
  cursor: not-allowed;
}
.omx-mv-history-scrim {
  display: none;
}
.omx-mv-history-toggle {
  display: none;
}

/* ---------- cost estimate in the composer ---------- */
.omx-mv-cost {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}

/* ---------- narrow: rail becomes an overlay drawer ---------- */
@container omx-mv (max-width: 899px) {
  .omx-mv-history {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(320px, 86%);
    flex: 0 0 auto;
    z-index: 120;
    box-shadow: -8px 0 24px var(--dsw-alias-bg-layer-1);
    transform: translateX(100%);
    visibility: hidden;
    transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.18s;
  }
  .omx-media-viewer[data-history-open="true"] .omx-mv-history {
    transform: none;
    visibility: visible;
  }
  .omx-mv-history-scrim {
    display: block;
    position: absolute;
    inset: 0;
    z-index: 110;
    background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.5));
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease;
  }
  .omx-media-viewer[data-history-open="true"] .omx-mv-history-scrim {
    opacity: 1;
    pointer-events: auto;
  }
  .omx-mv-history__close {
    display: inline-flex;
  }
  .omx-mv-history-toggle {
    display: inline-flex;
  }
}

@container omx-mv (max-width: 519px) {
  .omx-mv-cost {
    display: none;
  }
}

/* Touch devices have no hover: keep the two card actions visible. */
@media (hover: none) {
  .omx-mv-history__actions {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .omx-mv-history,
  .omx-mv-history-scrim,
  .omx-mv-history__actions,
  .omx-mv-history__card,
  .omx-mv-history__action,
  .omx-mv-history__close {
    transition: none;
  }
}
`;

/**
 * Inject the stylesheet once per document.
 * @param {Document} [doc]
 */
export function injectFlowAlignmentStyles(doc = typeof document !== 'undefined' ? document : undefined) {
  if (!doc) return;
  if (doc.getElementById(FLOW_ALIGNMENT_STYLE_ID)) return;
  const tag = doc.createElement('style');
  tag.id = FLOW_ALIGNMENT_STYLE_ID;
  tag.textContent = FLOW_ALIGNMENT_CSS;
  doc.head.appendChild(tag);
}
