/**
 * CanvasNoticeHost — 画板顶部轻量浮动通知宿主（T05）。
 *
 * 挂在 CanvasEditor 根部（绝对定位、不占道），Toast / Banner 共用。
 * Banner 形态仅用于 mode_consumption_changed 这类需要多看一眼的横幅。
 */

import React, { useSyncExternalStore } from 'react';
import { X, AlertTriangle, Info } from 'lucide-react';
import { canvasNoticeService, type CanvasNoticeService } from './canvasNoticeService.ts';
import type { CanvasNotice } from './types.ts';

export interface CanvasNoticeHostProps {
  /** 可注入隔离实例（测试 / 多画板）；缺省共享画板实例。 */
  service?: CanvasNoticeService;
}

function NoticeIcon({ notice }: { notice: CanvasNotice }) {
  if (notice.level === 'warning' || notice.level === 'error') {
    return <AlertTriangle size={13} aria-hidden="true" />;
  }
  return <Info size={13} aria-hidden="true" />;
}

export function CanvasNoticeHost({ service = canvasNoticeService }: CanvasNoticeHostProps): React.ReactElement | null {
  const notices = useSyncExternalStore(service.subscribe, service.list);
  if (notices.length === 0) return null;

  return (
    <div className="wf-canvas-notices nodrag nopan" aria-live="polite">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={[
            'wf-canvas-notice',
            `wf-canvas-notice--${notice.level}`,
            notice.kind === 'mode_consumption_changed'
              ? 'wf-canvas-notice--banner'
              : 'wf-canvas-notice--toast',
          ].join(' ')}
          role={notice.level === 'error' || notice.level === 'warning' ? 'alert' : 'status'}
          data-notice-kind={notice.kind}
        >
          <NoticeIcon notice={notice} />
          <span className="wf-canvas-notice__message">{notice.message}</span>
          <button
            type="button"
            className="wf-canvas-notice__dismiss"
            aria-label="关闭通知"
            onClick={() => service.dismiss(notice.id)}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default CanvasNoticeHost;
