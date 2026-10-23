/**
 * 执行队列面板的只读投影（Issue #3625 工作流 2）。
 *
 * 纯函数：输入是 executionStore 已经暴露的状态，输出是四个分区
 * （Queue / Pending / Running / History）的展示行。**不新增任何调度语义** ——
 * 不排队、不暂停、不取消、不改并发上限，只是把既有状态整理成可读列表。
 *
 * 两条不伪造数据的规则：
 *  1. 节点显示名按「画布文档 label → node_start 上报 label → nodeId」逐级回退，
 *     全都没有时显示 id，而不是编一个名字；
 *  2. 耗时区分来源：调度器上报的 `durationMs` 记 `host`，界面观测的时间差记
 *     `observed`，UI 必须分别标注，不能把近似值冒充成权威值。
 */

import type { NodeExecutionApiStatus } from '../../../shared/api.ts';
import {
  LIVE_EXECUTION_STATUSES,
  TERMINAL_EXECUTION_STATUSES,
  type ExecutionNodeRecord,
  type ExecutionRun,
  type ExecutionUiStatus,
} from '../../store/executionStore.ts';

const LIVE_STATUS_SET = new Set<ExecutionUiStatus>(LIVE_EXECUTION_STATUSES);
const TERMINAL_STATUS_SET = new Set<ExecutionUiStatus>(TERMINAL_EXECUTION_STATUSES);

/** 耗时来源：host = 调度器上报；observed = 界面观测（近似）。 */
export type QueueDurationSource = 'host' | 'observed';

export interface QueueNodeRow {
  nodeId: string;
  /** 展示名：画布 label → 事件 label → nodeId。 */
  label: string;
  status: NodeExecutionApiStatus;
  progress?: number;
  message?: string;
  error?: string;
  durationMs?: number;
  durationSource?: QueueDurationSource;
}

export interface QueueRunRow {
  executionId: string;
  status: ExecutionUiStatus;
  error: string | null;
  total: number;
  completed: number;
  running: number;
  pending: number;
  percentage: number;
  /** 界面观测到的开始时间（epoch ms），没有则为 undefined。 */
  observedStartedAt?: number;
  durationMs?: number;
  durationSource?: QueueDurationSource;
  /** 该执行已上报的节点行，按首次出现顺序。 */
  nodes: QueueNodeRow[];
}

export interface ExecutionQueueView {
  /** 存活执行（pending / running / paused），store 顺序（最早在前）。 */
  queue: QueueRunRow[];
  /** 存活执行里状态为 pending 的节点。 */
  pending: QueueNodeRow[];
  /** 存活执行里状态为 running 的节点。 */
  running: QueueNodeRow[];
  /** 终态执行（completed / error / cancelled），最新在前。 */
  history: QueueRunRow[];
  /**
   * 存活执行自报「等待中」但尚未上报任何节点的数量。
   *
   * 单列出来而不是丢掉：调度器的 pending 计数可能大于面板已具名的节点数，
   * 把差额吞掉会让面板看起来比实际少。
   */
  unreportedPending: number;
}

export interface ExecutionQueueInput {
  runs: readonly ExecutionRun[];
  /** nodeId → 画布文档里的展示名。 */
  nodeLabels?: ReadonlyMap<string, string>;
  /** 可注入时钟，便于测试；缺省取 Date.now()。 */
  now?: number;
}

function nodeDuration(
  record: ExecutionNodeRecord,
  now: number,
): { durationMs?: number; durationSource?: QueueDurationSource } {
  if (typeof record.durationMs === 'number') {
    return { durationMs: record.durationMs, durationSource: 'host' };
  }
  if (typeof record.observedStartedAt === 'number') {
    const end = typeof record.observedCompletedAt === 'number' ? record.observedCompletedAt : now;
    return { durationMs: Math.max(0, end - record.observedStartedAt), durationSource: 'observed' };
  }
  return {};
}

function toNodeRow(
  record: ExecutionNodeRecord,
  nodeLabels: ReadonlyMap<string, string> | undefined,
  now: number,
): QueueNodeRow {
  const { durationMs, durationSource } = nodeDuration(record, now);
  return {
    nodeId: record.nodeId,
    label: nodeLabels?.get(record.nodeId) ?? record.label ?? record.nodeId,
    status: record.status,
    progress: record.progress,
    message: record.message,
    error: record.error,
    durationMs,
    durationSource,
  };
}

function toRunRow(
  run: ExecutionRun,
  nodeLabels: ReadonlyMap<string, string> | undefined,
  now: number,
): QueueRunRow {
  const nodes = Object.values(run.nodeRecords ?? {}).map((record) => toNodeRow(record, nodeLabels, now));
  const observedEnd = run.observedCompletedAt;
  const runDuration = typeof run.observedStartedAt === 'number'
    ? { durationMs: Math.max(0, (observedEnd ?? now) - run.observedStartedAt), durationSource: 'observed' as const }
    : { durationMs: undefined, durationSource: undefined };

  return {
    executionId: run.executionId,
    status: run.status,
    error: run.error,
    total: run.progress.total,
    completed: run.progress.completed,
    running: run.progress.running,
    pending: run.progress.pending,
    percentage: run.progress.percentage,
    observedStartedAt: run.observedStartedAt,
    ...runDuration,
    nodes,
  };
}

/** 按四区整理执行状态；纯只读，不改动任何入参。 */
export function buildExecutionQueueView(input: ExecutionQueueInput): ExecutionQueueView {
  const now = input.now ?? Date.now();
  const live = input.runs.filter((run) => LIVE_STATUS_SET.has(run.status));
  const terminal = input.runs.filter((run) => TERMINAL_STATUS_SET.has(run.status));

  const queue = live.map((run) => toRunRow(run, input.nodeLabels, now));
  const pending: QueueNodeRow[] = [];
  const running: QueueNodeRow[] = [];
  let unreportedPending = 0;

  for (const run of live) {
    const rows = Object.values(run.nodeRecords ?? {}).map((record) => toNodeRow(record, input.nodeLabels, now));
    const namedPending = rows.filter((row) => row.status === 'pending').length;
    pending.push(...rows.filter((row) => row.status === 'pending'));
    running.push(...rows.filter((row) => row.status === 'running'));
    unreportedPending += Math.max(0, run.progress.pending - namedPending);
  }

  return {
    queue,
    pending,
    running,
    history: terminal.map((run) => toRunRow(run, input.nodeLabels, now)).reverse(),
    unreportedPending,
  };
}

/** 耗时展示：`820ms` / `1.2s` / `1m 05s`。负数按 0 处理（时钟回拨不显示负值）。 */
export function formatDuration(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  if (safe < 1000) return `${safe}ms`;
  const totalSeconds = safe / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds - minutes * 60);
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** 执行 id 的短展示（前 8 位），完整 id 由 title 承载。 */
export function shortExecutionId(executionId: string): string {
  return executionId.length <= 8 ? executionId : executionId.slice(0, 8);
}
