import React, { useEffect, useRef } from 'react';
import { flowAlignmentText } from './flow-alignment-copy.js';
import { formatHistoryTime } from './generation-history.js';

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function entryStatusLabel(entry, text) {
  if (entry.status === 'generating') return text('mediaViewer.history.generating');
  if (entry.status === 'failed') return text('mediaViewer.history.failed');
  if (entry.failedCount > 0) return text('mediaViewer.history.partialFailed');
  return '';
}

/**
 * Flow-style generation history rail.
 *
 * Wide containers render it as a static 260px aside inside the stage wrapper;
 * narrow containers turn the same node into an overlay drawer driven by the
 * root's `data-history-open` attribute. Only the single-stage view mounts it.
 *
 * @param {{
 *   id: string,
 *   entries: object[],
 *   activeId?: string | null,
 *   open?: boolean,
 *   onSelect: (entry: object) => void,
 *   onReusePrompt: (entry: object) => void,
 *   onDownload: (item: object) => void,
 *   onClose: () => void,
 *   t?: (key: string) => string,
 * }} props
 */
export function HistoryPanel({
  id,
  entries,
  activeId,
  open = false,
  onSelect,
  onReusePrompt,
  onDownload,
  onClose,
  t,
}) {
  const text = (key) => flowAlignmentText(t, key);
  const list = Array.isArray(entries) ? entries : [];
  const rootRef = useRef(null);
  const closeRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Overlay drawer semantics: move focus in, trap Tab, restore focus on close.
  // Wide mode never sets `open`, so the static rail keeps normal page focus order.
  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key !== 'Tab') return;
      const nodes = rootRef.current?.querySelectorAll('button:not(:disabled), [tabindex="0"]');
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === 'function' && previous.isConnected) previous.focus();
    };
  }, [open]);

  return (
    <aside
      id={id}
      ref={rootRef}
      className="omx-mv-history"
      role={open ? 'dialog' : 'complementary'}
      aria-modal={open ? 'true' : undefined}
      aria-label={text('mediaViewer.history.title')}
      data-open={open ? 'true' : 'false'}
    >
      <div className="omx-mv-history__header">
        <span className="omx-mv-history__title">{text('mediaViewer.history.title')}</span>
        <button
          ref={closeRef}
          type="button"
          className="omx-mv-history__close"
          title={text('mediaViewer.history.close')}
          aria-label={text('mediaViewer.history.close')}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      {list.length === 0 ? (
        <p className="omx-mv-history__empty">{text('mediaViewer.history.empty')}</p>
      ) : (
        <ul className="omx-mv-history__list">
          {list.map((entry) => {
            const primary = entry.primary;
            const active = Array.isArray(entry.items) && entry.items.some((item) => item.id === activeId);
            const statusLabel = entryStatusLabel(entry, text);
            const kindLabel = text(entry.kind === 'video' ? 'mediaViewer.kind.video' : 'mediaViewer.kind.image');
            const prompt = entry.prompt || text('mediaViewer.history.noPrompt');
            return (
              <li className="omx-mv-history__item" key={entry.id} data-status={entry.status}>
                <button
                  type="button"
                  className="omx-mv-history__card"
                  aria-current={active ? 'true' : undefined}
                  title={entry.prompt || undefined}
                  onClick={() => onSelect?.(entry)}
                >
                  <span className="omx-mv-history__thumb">
                    {primary?.url && entry.kind === 'video' ? (
                      <video className="omx-mv-history__thumb-media" src={primary.url} muted preload="metadata" aria-hidden="true" />
                    ) : primary?.url ? (
                      <img src={primary.url} alt="" loading="lazy" />
                    ) : (
                      <span className="omx-mv-history__placeholder">{kindLabel}</span>
                    )}
                    {entry.count > 1 ? <span className="omx-mv-history__count">×{entry.count}</span> : null}
                  </span>
                  <span className="omx-mv-history__body">
                    <span className="omx-mv-history__prompt">{prompt}</span>
                    <span className="omx-mv-history__meta">
                      {formatHistoryTime(entry.timestamp)} · {kindLabel}
                    </span>
                    {statusLabel ? <span className="omx-mv-history__status">{statusLabel}</span> : null}
                  </span>
                </button>
                <div className="omx-mv-history__actions">
                  <button
                    type="button"
                    className="omx-mv-history__action"
                    disabled={!entry.prompt}
                    aria-label={`${text('mediaViewer.history.reusePrompt')}: ${prompt.slice(0, 40)}`}
                    onClick={() => onReusePrompt?.(entry)}
                  >
                    {text('mediaViewer.history.reusePrompt')}
                  </button>
                  <button
                    type="button"
                    className="omx-mv-history__action"
                    disabled={!entry.hasDownload}
                    aria-label={`${text('mediaViewer.history.download')}: ${prompt.slice(0, 40)}`}
                    onClick={() => onDownload?.(entry.primary)}
                  >
                    {text('mediaViewer.history.download')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

