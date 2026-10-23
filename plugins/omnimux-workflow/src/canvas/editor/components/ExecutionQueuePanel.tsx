/**
 * ExecutionQueuePanel — 执行队列面板（Issue #3625 工作流 2）。
 *
 * 四区可视化：Queue / Pending / Running / History。**纯只读消费**
 * `executionStore` 的既有状态（+ 画布文档里的节点名），不排队、不暂停、
 * 不取消、不改并发上限 —— 控制语义仍归 ExecutionBar / HeaderControls。
 *
 * 面板关闭时不订阅任何 store（内容组件仅在 open 时挂载），因此画布拖拽
 * 不会被一个隐藏面板拖着重渲染。
 */

import { memo, useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { NodeExecutionApiStatus } from '../../../shared/api.ts';
import { useExecutionStore, type ExecutionUiStatus } from '../../store/executionStore.ts';
import { useCanvasStore } from '../../store/canvasStore';
import { useT, type DictKey } from '../../i18n';
import {
  buildExecutionQueueView,
  formatDuration,
  shortExecutionId,
  type QueueNodeRow,
  type QueueRunRow,
} from './executionQueue.ts';

const RUN_STATUS_KEYS: Record<ExecutionUiStatus, DictKey> = {
  idle: 'exec.status.idle',
  pending: 'exec.status.pending',
  running: 'exec.status.running',
  paused: 'exec.status.paused',
  completed: 'exec.status.completed',
  error: 'exec.status.error',
  cancelled: 'exec.status.cancelled',
};

const NODE_STATUS_KEYS: Record<NodeExecutionApiStatus, DictKey> = {
  pending: 'exec.status.pending',
  running: 'exec.status.running',
  completed: 'exec.status.completed',
  error: 'exec.status.error',
  skipped: 'exec.status.skipped',
};

/** 画布文档里的节点展示名：label → title → 未命名。 */
function canvasNodeLabel(node: { data?: Record<string, unknown> }): string | undefined {
  const data = node.data ?? {};
  for (const field of ['label', 'title'] as const) {
    const value = data[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/** 每秒推进的时钟，仅在面板打开且确有存活执行时启用（避免空转定时器）。 */
function useTickingNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function DurationCell({ durationMs, source }: { durationMs?: number; source?: 'host' | 'observed' }) {
  const t = useT();
  if (typeof durationMs !== 'number') return null;
  const title = source === 'host' ? t('queue.durationHost') : t('queue.durationObserved');
  return (
    <span className={`wf-exec-queue__duration wf-exec-queue__duration--${source ?? 'host'}`} title={title}>
      {formatDuration(durationMs)}
    </span>
  );
}

function NodeRow({ row }: { row: QueueNodeRow }) {
  const t = useT();
  return (
    <li className="wf-exec-queue__row" data-status={row.status}>
      <span className="wf-exec-queue__row-name" title={row.nodeId}>
        {row.label}
      </span>
      <span className={`wf-exec-queue__pill wf-exec-queue__pill--${row.status}`}>
        {t(NODE_STATUS_KEYS[row.status])}
      </span>
      {typeof row.progress === 'number' ? (
        <span className="wf-exec-queue__progress">{row.progress}%</span>
      ) : null}
      <DurationCell durationMs={row.durationMs} source={row.durationSource} />
    </li>
  );
}

/**
 * 一次执行的展示行。
 *
 * `showNodes` 只在 History 分区开启：存活执行的节点已经由 Pending / Running
 * 两个分区逐条列出，重复渲染同一批节点只会让人以为有两个实例。
 */
function RunRow({ row, showNodes = false }: { row: QueueRunRow; showNodes?: boolean }) {
  const t = useT();
  return (
    <li className="wf-exec-queue__run" data-status={row.status}>
      <span className="wf-exec-queue__row-name" title={row.executionId}>
        {t('queue.runLabel').replace('{id}', shortExecutionId(row.executionId))}
      </span>
      <span className={`wf-exec-queue__pill wf-exec-queue__pill--${row.status}`}>
        {t(RUN_STATUS_KEYS[row.status])}
      </span>
      <span className="wf-exec-queue__counts">
        {row.completed}/{row.total}
      </span>
      <DurationCell durationMs={row.durationMs} source={row.durationSource} />
      {row.error ? (
        <span className="wf-exec-queue__error" title={row.error}>
          {row.error}
        </span>
      ) : null}
      {showNodes && row.nodes.length > 0 ? (
        <ul className="wf-exec-queue__nodes">
          {row.nodes.map((node) => (
            <NodeRow key={node.nodeId} row={node} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Section({
  titleKey,
  count,
  emptyKey,
  children,
  extra,
}: {
  titleKey: DictKey;
  count: number;
  emptyKey: DictKey;
  children: ReactNode;
  extra?: ReactNode;
}) {
  const t = useT();
  return (
    <section className="wf-exec-queue__section" aria-label={t(titleKey)}>
      <div className="wf-exec-queue__section-header">
        <span className="wf-exec-queue__section-title">{t(titleKey)}</span>
        <span className="wf-exec-queue__section-count">{count}</span>
      </div>
      {count === 0 ? (
        <p className="wf-exec-queue__empty">{t(emptyKey)}</p>
      ) : (
        <ul className="wf-exec-queue__list">{children}</ul>
      )}
      {extra}
    </section>
  );
}

const ExecutionQueuePanelBody: FC<{ onClose: () => void }> = ({ onClose }) => {
  const t = useT();
  const runs = useExecutionStore((state) => state.runs);
  const nodes = useCanvasStore((state) => state.nodes);

  const nodeLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const node of nodes) {
      const label = canvasNodeLabel(node as { data?: Record<string, unknown> });
      if (label) labels.set(node.id, label);
    }
    return labels;
  }, [nodes]);

  const hasLiveRun = runs.some(
    (run) => run.status === 'pending' || run.status === 'running' || run.status === 'paused',
  );
  const now = useTickingNow(hasLiveRun);

  const view = useMemo(
    () => buildExecutionQueueView({ runs, nodeLabels, now }),
    [runs, nodeLabels, now],
  );

  return (
    <aside className="wf-exec-queue" role="region" aria-label={t('queue.ariaLabel')}>
      <div className="wf-exec-queue__header">
        <span className="wf-exec-queue__title">{t('queue.title')}</span>
        <button
          type="button"
          className="wf-exec-queue__close"
          onClick={onClose}
          title={t('queue.closeTitle')}
        >
          <X size={14} />
        </button>
      </div>

      <div className="wf-exec-queue__body">
        <Section
          titleKey="queue.section.queue"
          count={view.queue.length}
          emptyKey="queue.empty.queue"
        >
          {view.queue.map((row) => (
            <RunRow key={row.executionId} row={row} />
          ))}
        </Section>

        <Section
          titleKey="queue.section.pending"
          count={view.pending.length}
          emptyKey="queue.empty.pending"
          extra={
            view.unreportedPending > 0 ? (
              <p className="wf-exec-queue__note">
                {t('queue.pendingUnreported').replace('{count}', String(view.unreportedPending))}
              </p>
            ) : null
          }
        >
          {view.pending.map((row) => (
            <NodeRow key={row.nodeId} row={row} />
          ))}
        </Section>

        <Section
          titleKey="queue.section.running"
          count={view.running.length}
          emptyKey="queue.empty.running"
        >
          {view.running.map((row) => (
            <NodeRow key={row.nodeId} row={row} />
          ))}
        </Section>

        <Section
          titleKey="queue.section.history"
          count={view.history.length}
          emptyKey="queue.empty.history"
        >
          {view.history.map((row) => (
            <RunRow key={row.executionId} row={row} showNodes />
          ))}
        </Section>
      </div>
    </aside>
  );
};

export interface ExecutionQueuePanelProps {
  /** 面板是否展开；由宿主（画布）控制布局。 */
  open: boolean;
  onClose: () => void;
}

const ExecutionQueuePanel: FC<ExecutionQueuePanelProps> = ({ open, onClose }) =>
  open ? <ExecutionQueuePanelBody onClose={onClose} /> : null;

export default memo(ExecutionQueuePanel);
