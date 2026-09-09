/**
 * HeaderControls.tsx — Top-right capsule control bar for OmniMux Workflow Canvas.
 *
 * Provides streamlined viewport, layout, and execution operations aligned with modern
 * AI canvas experiences (Integrated Run All CTA, FitView, Zoom In/Out, Align Grid,
 * Minimap Popover toggle, and Split Layout mode dropdown).
 *
 * Like Toolbar, this component is a ReactFlow sibling: root must include
 * .nodrag .nopan and stop native pointer/mouse events.
 */

import { memo, useCallback } from 'react';
import {
  useReactFlow,
  useStore,
  type ReactFlowState,
} from '@xyflow/react';
import {
  Maximize,
  Minus,
  Plus,
  LayoutGrid,
  Map,
  SplitSquareVertical,
  Waypoints,
  Play,
  Pause,
  X,
  RotateCcw,
  Share2,
} from 'lucide-react';
import { useExecutionStore, type ExecutionUiStatus } from '../../store/executionStore';
import { useT, type DictKey } from '../../i18n';
import { CustomDropdown, type DropdownMenuItem } from '../../ui';
import { stopToolbarNativeEvent } from './toolbarPointerGuard';

export type SplitLayoutMode = 'split-left' | 'split-right' | 'canvas-only' | 'chat-only';

export interface HeaderControlsProps {
  isMinimapOpen: boolean;
  onToggleMinimap: () => void;
  onAlignGrid?: () => void;
  layoutMode?: SplitLayoutMode;
  onLayoutModeChange?: (mode: SplitLayoutMode) => void;
  onStartExecution?: () => void;
  onPauseExecution?: () => void;
  onResumeExecution?: () => void;
  onCancelExecution?: () => void;
  onResetExecution?: () => void;
  onOpenPublish?: () => void;
}

const STATUS_LABEL_KEYS: Record<ExecutionUiStatus, DictKey> = {
  idle: 'exec.status.idle',
  pending: 'exec.status.pending',
  running: 'exec.status.running',
  paused: 'exec.status.paused',
  completed: 'exec.status.completed',
  error: 'exec.status.error',
  cancelled: 'exec.status.cancelled',
};

const zoomSelector = (s: ReactFlowState) => Math.round(s.transform[2] * 100);

const HeaderControls: React.FC<HeaderControlsProps> = ({
  isMinimapOpen,
  onToggleMinimap,
  onAlignGrid,
  layoutMode = 'split-left',
  onLayoutModeChange,
  onStartExecution,
  onPauseExecution,
  onResumeExecution,
  onCancelExecution,
  onResetExecution,
  onOpenPublish,
}) => {
  const t = useT();
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoomPercent = useStore(zoomSelector);

  const status = useExecutionStore((state) => state.status);
  const progress = useExecutionStore((state) => state.progress);
  const error = useExecutionStore((state) => state.error);

  const busy = status === 'pending' || status === 'running';
  const paused = status === 'paused';
  const terminal = status === 'completed' || status === 'error' || status === 'cancelled';
  const hasProgress = progress.total > 0;

  const handleFitView = useCallback(() => {
    fitView({ duration: 250, padding: 0.1 });
  }, [fitView]);

  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: 150 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: 150 });
  }, [zoomOut]);

  const layoutMenuItems: DropdownMenuItem[] = [
    {
      key: 'split-left',
      label: t('header.splitLeft'),
      onClick: () => onLayoutModeChange?.('split-left'),
    },
    {
      key: 'split-right',
      label: t('header.splitRight'),
      onClick: () => onLayoutModeChange?.('split-right'),
    },
    {
      key: 'canvas-only',
      label: t('header.canvasOnly'),
      onClick: () => onLayoutModeChange?.('canvas-only'),
    },
    {
      key: 'chat-only',
      label: t('header.chatOnly'),
      onClick: () => onLayoutModeChange?.('chat-only'),
    },
  ];

  return (
    <div
      className="wf-header-controls nodrag nopan"
      onPointerDown={stopToolbarNativeEvent}
      onMouseDown={stopToolbarNativeEvent}
    >
      {/* 1. 执行控制（闲态为独立的纯圆按钮；执行/终态时展开为状态胶囊） */}
      {onStartExecution && (
        busy || paused || (terminal && onResetExecution) ? (
          <div
            className={`wf-header-capsule wf-header-capsule--exec ${
              busy || paused ? 'wf-header-capsule--busy' : 'wf-header-capsule--terminal'
            }`}
          >
            {busy || paused ? (
              <>
                <span className={`wf-header-capsule__status-pill wf-header-capsule__status-pill--${status}`}>
                  {t(STATUS_LABEL_KEYS[status])}
                  {hasProgress && ` (${progress.completed}/${progress.total})`}
                </span>

                {busy ? (
                  <button
                    type="button"
                    className="wf-header-capsule__btn"
                    onClick={onPauseExecution}
                    title={t('exec.pauseTitle')}
                  >
                    <Pause size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="wf-header-capsule__btn wf-header-capsule__btn--active"
                    onClick={onResumeExecution}
                    title={t('exec.resumeTitle')}
                  >
                    <Play size={14} />
                  </button>
                )}

                <button
                  type="button"
                  className="wf-header-capsule__btn wf-header-capsule__btn--danger"
                  onClick={onCancelExecution}
                  title={t('exec.cancelTitle')}
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="wf-header-capsule__btn wf-header-capsule__btn--run-all"
                onClick={onStartExecution}
                title={error ? error : t('exec.runAll')}
                aria-label={t('exec.runAll')}
              >
                <Play size={14} fill="currentColor" style={{ marginLeft: 2 }} />
              </button>
            )}

            {terminal && onResetExecution && (
              <button
                type="button"
                className="wf-header-capsule__btn"
                onClick={onResetExecution}
                title={t('exec.resetTitle')}
              >
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="wf-header-capsule wf-header-capsule--exec-standalone"
            onClick={onStartExecution}
            title={error ? error : t('exec.runAll')}
            aria-label={t('exec.runAll')}
          >
            <Play size={14} fill="currentColor" style={{ marginLeft: 2 }} />
          </button>
        )
      )}

      {/* 2. 视口与缩放胶囊 */}
      <div className="wf-header-capsule">
        <button
          type="button"
          className="wf-header-capsule__btn"
          onClick={handleFitView}
          title={t('header.fitView')}
        >
          <Maximize size={15} />
        </button>

        <div className="wf-header-capsule__divider" />

        <button
          type="button"
          className="wf-header-capsule__btn"
          onClick={handleZoomOut}
          title={t('header.zoomOut')}
        >
          <Minus size={15} />
        </button>

        <span className="wf-header-capsule__zoom-text" onClick={handleFitView} title={t('header.fitView')}>
          {zoomPercent}%
        </span>

        <button
          type="button"
          className="wf-header-capsule__btn"
          onClick={handleZoomIn}
          title={t('header.zoomIn')}
        >
          <Plus size={15} />
        </button>
      </div>

      {/* 3. 辅助工具与小地图胶囊 */}
      <div className="wf-header-capsule">
        {onAlignGrid && (
          <button
            type="button"
            className="wf-header-capsule__btn"
            onClick={onAlignGrid}
            title={t('header.alignGrid')}
          >
            <LayoutGrid size={15} />
          </button>
        )}

        <button
          type="button"
          className="wf-header-capsule__btn"
          title={t('header.routingCurved')}
        >
          <Waypoints size={15} />
        </button>

        <button
          type="button"
          className={`wf-header-capsule__btn ${isMinimapOpen ? 'wf-header-capsule__btn--active' : ''}`}
          onClick={onToggleMinimap}
          title={t('header.minimap')}
        >
          <Map size={15} />
        </button>

        {onOpenPublish && (
          <button
            type="button"
            className={`wf-header-capsule__btn ${busy || paused ? 'wf-header-capsule__btn--disabled' : ''}`}
            onClick={onOpenPublish}
            disabled={busy || paused}
            title="发布为 AI 应用"
            aria-label="发布为 AI 应用"
          >
            <Share2 size={15} />
          </button>
        )}

        {onLayoutModeChange && (
          <>
            <div className="wf-header-capsule__divider" />
            <CustomDropdown items={layoutMenuItems} selectedKeys={[layoutMode]} placement="bottomRight">
              <button
                type="button"
                className="wf-header-capsule__btn"
                title={t('header.splitLayout')}
              >
                <SplitSquareVertical size={15} />
              </button>
            </CustomDropdown>
          </>
        )}
      </div>
    </div>
  );
};

export default memo(HeaderControls);
