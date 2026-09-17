/**
 * ExecutionBar — M3 execution control strip (Gxgen 执行控制条, island flavor).
 *
 * Pause/resume/cancel + live progress (completed/total), driven by the
 * executionStore. Rendered above the canvas in App.
 *
 * #2255: the bar reports the canvas's concurrent runs — status and progress
 * are aggregates over every run, and the count tells the user how many are
 * live at once. Its control buttons act on all of them, which is what the
 * single-run bar did implicitly.
 */

import { memo } from 'react';
import { Pause, Play, X } from 'lucide-react';
import { useExecutionStore, type ExecutionUiStatus } from '../../store/executionStore';
import { useT, type DictKey } from '../../i18n';

const STATUS_LABEL_KEYS: Record<ExecutionUiStatus, DictKey> = {
  idle: 'exec.status.idle',
  pending: 'exec.status.pending',
  running: 'exec.status.running',
  paused: 'exec.status.paused',
  completed: 'exec.status.completed',
  error: 'exec.status.error',
  cancelled: 'exec.status.cancelled',
};

export interface ExecutionBarProps {
  onStart?: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onReset: () => void;
}

const ExecutionBar: React.FC<ExecutionBarProps> = ({ onStart, onPause, onResume, onCancel, onReset }) => {
  const t = useT();
  const status = useExecutionStore((state) => state.status);
  const progress = useExecutionStore((state) => state.progress);
  const error = useExecutionStore((state) => state.error);
  const activeRunCount = useExecutionStore((state) => state.activeRunCount);

  const busy = status === 'pending' || status === 'running';
  const paused = status === 'paused';
  const terminal = status === 'completed' || status === 'error' || status === 'cancelled';
  const hasProgress = progress.total > 0;

  return (
    <div className={`wf-exec-bar wf-exec-bar--${status}`} role="toolbar" aria-label={t('exec.ariaLabel')}>
      <span className={`wf-exec-bar__status wf-exec-bar__status--${status}`}>
        {t(STATUS_LABEL_KEYS[status])}
      </span>

      {activeRunCount > 1 ? (
        <span className="wf-exec-bar__concurrent" data-testid="wf-exec-active-count">
          {t('exec.activeCount').replace('{count}', String(activeRunCount))}
        </span>
      ) : null}

      {hasProgress ? (
        <span className="wf-exec-bar__progress">
          <span className="wf-exec-bar__progress-text">
            {progress.completed}/{progress.total}
          </span>
          <span className="wf-exec-bar__progress-track">
            <span
              className="wf-exec-bar__progress-fill"
              style={{ width: `${Math.min(100, progress.percentage)}%` }}
            />
          </span>
          <span className="wf-exec-bar__progress-percent">{progress.percentage}%</span>
        </span>
      ) : null}

      {busy || paused ? (
        <>
          {busy ? (
            <button type="button" className="wf-exec-bar__button" onClick={onPause} title={t('exec.pauseTitle')}>
              <Pause size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              {t('exec.pause')}
            </button>
          ) : (
            <button type="button" className="wf-exec-bar__button wf-exec-bar__button--primary" onClick={onResume} title={t('exec.resumeTitle')}>
              <Play size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              {t('exec.resume')}
            </button>
          )}
          <button type="button" className="wf-exec-bar__button wf-exec-bar__button--danger" onClick={onCancel} title={t('exec.cancelTitle')}>
            <X size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
            {t('exec.cancel')}
          </button>
        </>
      ) : null}

      {terminal ? (
        <button type="button" className="wf-exec-bar__button wf-exec-bar__button--ghost" onClick={onReset} title={t('exec.resetTitle')}>
          {t('exec.reset')}
        </button>
      ) : null}

      {error ? <span className="wf-exec-bar__error" title={error}>{error}</span> : null}
    </div>
  );
};

export default memo(ExecutionBar);
