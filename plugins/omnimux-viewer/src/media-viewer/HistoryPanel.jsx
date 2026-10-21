import React from 'react';
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

/**
 * Flow-style generation history rail.
 *
 * Wide containers render it as a static 260px aside inside the stage wrapper;
 * narrow containers turn the same node into an overlay drawer driven by the
 * root's `data-history-open` attribute. Only the single-stage view mounts it.
 *
 * @param {{
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

  return (
    <aside
      id="omx-mv-history"
      className="omx-mv-history"
      aria-label={text('mediaViewer.history.title')}
      data-open={open ? 'true' : 'false'}
    >
      <div className="omx-mv-history__header">
        <span className="omx-mv-history__title">{text('mediaViewer.history.title')}</span>
        <button
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
            const active = Boolean(primary?.id) && primary.id === activeId;
            const statusLabel = entry.status === 'generating'
              ? text('mediaViewer.history.generating')
              : entry.status === 'failed'
                ? text('mediaViewer.history.failed')
                : '';
            const kindLabel = text(entry.kind === 'video' ? 'mediaViewer.kind.video' : 'mediaViewer.kind.image');
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
                    {primary?.url ? (
                      <img src={primary.url} alt="" loading="lazy" />
                    ) : (
                      <span className="omx-mv-history__placeholder">{kindLabel}</span>
                    )}
                    {entry.count > 1 ? <span className="omx-mv-history__count">×{entry.count}</span> : null}
                  </span>
                  <span className="omx-mv-history__body">
                    <span className="omx-mv-history__prompt">
                      {entry.prompt || text('mediaViewer.history.noPrompt')}
                    </span>
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
                    onClick={() => onReusePrompt?.(entry)}
                  >
                    {text('mediaViewer.history.reusePrompt')}
                  </button>
                  <button
                    type="button"
                    className="omx-mv-history__action"
                    disabled={!entry.hasDownload}
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

export default HistoryPanel;
