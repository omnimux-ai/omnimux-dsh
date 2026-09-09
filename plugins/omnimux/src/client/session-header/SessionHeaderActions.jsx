import React, { useState, useEffect, useRef } from 'react';
import {
  executeSessionClearAndSnapshot,
  resolveCurrentCanvasWorkspaceId,
  showHeaderToast,
} from './sessionBranchActions.js';
import { getCanvasSnapshots } from './snapshotStore.js';
import { getWorkbenchSessions } from '../workbench/host-adapter.js';

/** 清空并归档图标 (橡皮擦/重置) */
function ClearIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.5 13.5H4.5" />
      <path d="M12.2 2.8a1.5 1.5 0 0 1 2.1 2.1L6.4 12.8 3.5 13.5l.7-2.9L12.2 2.8z" />
    </svg>
  );
}

/** 历史时钟图标 */
function HistoryIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <polyline points="8 4.5 8 8 10.5 9.5" />
    </svg>
  );
}

function formatRelativeTime(isoString) {
  try {
    const diff = Math.max(0, Date.now() - new Date(isoString).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  } catch {
    return '';
  }
}

export function SessionHeaderActions(props) {
  const sessionId = props.sessionId || '';
  const [busy, setBusy] = useState(false);
  const [showPopover, setShowPopover] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [popoverPos, setPopoverPos] = useState({ top: 0, right: 0 });

  const historyBtnRef = useRef(null);
  const popoverRef = useRef(null);

  const canvasWorkspaceId = resolveCurrentCanvasWorkspaceId(sessionId);

  const refreshSnapshots = () => {
    if (canvasWorkspaceId) {
      setSnapshots(getCanvasSnapshots(canvasWorkspaceId));
    }
  };

  const handleClear = async (e) => {
    e?.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await executeSessionClearAndSnapshot({ sessionId, canvasWorkspaceId });
      setShowPopover(false);
    } finally {
      setBusy(false);
    }
  };

  const toggleHistory = (e) => {
    e?.stopPropagation();
    if (!showPopover) {
      refreshSnapshots();
      if (historyBtnRef.current) {
        const rect = historyBtnRef.current.getBoundingClientRect();
        setPopoverPos({
          top: rect.bottom + 6,
          right: Math.max(12, window.innerWidth - rect.right),
        });
      }
      setShowPopover(true);
    } else {
      setShowPopover(false);
    }
  };

  const handleSelectSnapshot = (snap) => {
    setShowPopover(false);
    const sessions = getWorkbenchSessions();
    if (sessions && typeof sessions.open === 'function' && snap.sessionId) {
      sessions.open(snap.sessionId);
      showHeaderToast(`已切换至历史会话：${snap.title}`);
    }
  };

  useEffect(() => {
    if (!showPopover) return undefined;
    const handleClickOutside = (event) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target) &&
        historyBtnRef.current &&
        !historyBtnRef.current.contains(event.target)
      ) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [showPopover]);

  return (
    <div className="omnimux-session-header-actions" data-omnimux-session-actions="">
      {/* 1. 清空图标按钮 */}
      <button /* exempt-ui01: 会话顶栏图标操作按钮 */
        type="button"
        className="omnimux-header-action-btn"
        title="清空对话并保存快照 (开启新会话)"
        aria-label="清空对话并保存快照"
        disabled={busy}
        onClick={handleClear}
      >
        <ClearIcon />
      </button>

      {/* 2. 历史消息图标按钮 */}
      <button /* exempt-ui01: 会话顶栏图标操作按钮 */
        ref={historyBtnRef}
        type="button"
        className="omnimux-header-action-btn"
        title="历史快照与对话记录"
        aria-label="历史快照与对话记录"
        onClick={toggleHistory}
      >
        <HistoryIcon />
      </button>

      {/* 3. 历史快照 Popover 浮层 */}
      {showPopover && (
        <div
          ref={popoverRef}
          className="omnimux-snapshot-popover"
          style={{ top: `${popoverPos.top}px`, right: `${popoverPos.right}px` }}
        >
          <div className="omnimux-snapshot-popover-header">
            <span className="omnimux-snapshot-popover-title">历史快照分支</span>
            <span className="omnimux-snapshot-popover-count">
              {snapshots.length} 条记录
            </span>
          </div>

          <div className="omnimux-snapshot-list">
            {snapshots.length === 0 ? (
              <div className="omnimux-snapshot-empty">
                暂无历史快照。点击清空按钮时会自动保存当前会话快照。
              </div>
            ) : (
              snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="omnimux-snapshot-item"
                  onClick={() => handleSelectSnapshot(snap)}
                >
                  <div className="omnimux-snapshot-item-top">
                    <span className="omnimux-snapshot-item-title" title={snap.title}>
                      {snap.title}
                    </span>
                    <span className="omnimux-snapshot-item-time">
                      {formatRelativeTime(snap.createdAt)}
                    </span>
                  </div>
                  {snap.excerpt && (
                    <span className="omnimux-snapshot-item-excerpt" title={snap.excerpt}>
                      {snap.excerpt}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
