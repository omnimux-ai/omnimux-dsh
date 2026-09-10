/**
 * useExecutionController — M3 port of Gxgen `useExecutionSSE` +
 * `useExecutionSync` (island flavor).
 *
 * Owns the execution lifecycle for the canvas:
 *  - startExecution: POST create (full / subset) -> subscribe SSE
 *  - pause / resume / cancel control calls
 *  - SSE event handling: control state -> executionStore; per-node states
 *    and mock results -> canvasStore node.data (only the changed node is
 *    updated — the Gxgen performance pattern; result writes also trigger
 *    the M2 autosave layer)
 *  - island reload: restore a still-live execution by executionId
 *    (GET list -> snapshot backfill -> re-subscribe)
 *
 * Differences from Gxgen: EventSource instead of fetch-stream (the plugin
 * exposes a dedicated GET /events route), no auth token (local same-origin).
 */

import { useCallback, useEffect, useRef } from 'react';
import { WORKFLOW_API_ROUTES } from '../../shared/api';
import type { ExecutionSnapshotDto } from '../../shared/api';
import {
  createExecution,
  executionAction,
  getExecution,
  listExecutions,
} from '../bridge/apiClient';
import { useCanvasStore } from '../store/canvasStore';
import { useExecutionStore, type ExecutionUiStatus } from '../store/executionStore';
import { t } from '../i18n';
import { signatureOf } from '../bridge/persistSanitize';

const LIVE_STATUSES = new Set<ExecutionUiStatus>(['pending', 'running', 'paused']);
const TERMINAL_STATUSES = new Set<ExecutionUiStatus>(['completed', 'error', 'cancelled']);

interface SseEventData {
  executionId?: string;
  nodeId?: string;
  label?: string;
  type?: string;
  progress?: number;
  message?: string;
  error?: string;
  reason?: string;
  duration?: number;
  totalNodes?: number;
  completedNodes?: number;
  workflowId?: string;
  failedNode?: string | null;
  output?: {
    mediaAssets?: Array<{
      type: 'image' | 'video' | 'audio';
      url: string;
      relativePath?: string;
      assetId?: string;
      mimeType?: string;
      sizeBytes?: number;
      durationSec?: number;
    }>;
    text?: string;
    relativePath?: string;
    assetId?: string;
    simulated?: boolean;
  };
}

export interface ExecutionNodeOutput {
  mediaAssets?: Array<{
    type: 'image' | 'video' | 'audio';
    url: string;
    relativePath?: string;
    assetId?: string;
    mimeType?: string;
    sizeBytes?: number;
    durationSec?: number;
  }>;
  text?: string;
  relativePath?: string;
  assetId?: string;
  simulated?: boolean;
}

/** Apply transport output to node.data and recompute dependent contracts. */
export function applyExecutionNodeOutput(
  nodeId: string,
  output: ExecutionNodeOutput,
  basePatch: Record<string, unknown> = {},
): void {
  const patch: Record<string, unknown> = { ...basePatch };
  patch.simulated = output.simulated === true ? true : undefined;
  if (typeof output.text === 'string') patch.generatedContent = output.text;
  const first = output.mediaAssets?.[0];
  if (output.mediaAssets && output.mediaAssets.length > 0 && first) {
    patch.mediaAssets = output.mediaAssets;
    if (first.url) {
      patch.mediaUrl = first.url;
      // A new video output must not inherit a poster from the previous output.
      if (first.type === 'video') {
        patch.thumbnailUrl = undefined;
        patch.outputThumbnailUrl = undefined;
        patch.coverUrl = undefined;
      }
    }
    const relativePath = output.relativePath || first.relativePath;
    const assetId = output.assetId || first.assetId;
    if (relativePath) patch.relativePath = relativePath;
    if (assetId) patch.assetId = assetId;
    if (first.mimeType) patch.mimeType = first.mimeType;
    if (first.sizeBytes !== undefined) patch.sizeBytes = first.sizeBytes;
    if (first.durationSec !== undefined) patch.durationSec = first.durationSec;
    delete patch.realPath;
  }
  writeNodeData(nodeId, patch, Boolean(first));
}

/**
 * Merge one node's execution fields into canvasStore node.data.
 *
 * Completed output can change the contract fingerprint seen by downstream
 * generate nodes, so it asks the existing mutation gateway to soft-recompute
 * those targets after the source data has been written.
 */
function writeNodeData(
  nodeId: string,
  patch: Record<string, unknown>,
  recomputeDownstream = false,
): void {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) return;
  store.setNodes((nodes) =>
    nodes.map((candidate) =>
      candidate.id === nodeId ? { ...candidate, data: { ...candidate.data, ...patch } } : candidate,
    ),
  );
  if (!recomputeDownstream) return;

  const current = useCanvasStore.getState();
  const targetIds = [...new Set(
    current.edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target),
  )];
  const nodePatches = targetIds.flatMap((targetId) => {
    const target = current.nodes.find((candidate) => candidate.id === targetId);
    if (!target) return [];
    const data = target.data as Record<string, unknown>;
    return [{ nodeId: targetId, data: { prompt: typeof data.prompt === 'string' ? data.prompt : '' } }];
  });
  if (nodePatches.length > 0) {
    current.applyCanvasInputMutation({ nodePatches });
  }
}

export interface ExecutionControllerOptions {
  /** Optional pre-flight hook (e.g. flush canvas persistence before creating run). */
  onBeforeStart?: () => Promise<number | void> | number | void;
}

export interface ExecutionController {
  startExecution: (opts?: { mode?: 'full' | 'subset' | 'single'; nodeIds?: string[] }) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
}

export function useExecutionController(
  workspaceId: string | null,
  opts?: ExecutionControllerOptions,
): ExecutionController {
  const eventSourceRef = useRef<EventSource | null>( null);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const workspaceIdRef = useRef<string | null>(workspaceId);
  workspaceIdRef.current = workspaceId;
  const onBeforeStartRef = useRef(opts?.onBeforeStart);
  onBeforeStartRef.current = opts?.onBeforeStart;

  const closeStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const applyTerminal = useCallback((status: ExecutionUiStatus, error: string | null) => {
    useExecutionStore.getState().setExecution({
      status,
      error,
      progress: { ...useExecutionStore.getState().progress, percentage: status === 'completed' ? 100 : useExecutionStore.getState().progress.percentage },
    });
  }, []);

  const handleEvent = useCallback((eventType: string, raw: string) => {
    let data: SseEventData;
    try {
      data = JSON.parse(raw) as SseEventData;
    } catch {
      return;
    }
    const exec = useExecutionStore.getState();

    switch (eventType) {
      case 'execution_start': {
        exec.setExecution({
          status: 'running',
          error: null,
          progress: {
            total: data.totalNodes ?? 0,
            completed: 0,
            running: 0,
            pending: data.totalNodes ?? 0,
            percentage: 0,
          },
        });
        break;
      }
      case 'node_start': {
        if (!data.nodeId) break;
        exec.setNodeStatus(data.nodeId, 'running');
        exec.setExecution({
          progress: {
            ...exec.progress,
            running: exec.progress.running + 1,
            pending: Math.max(0, exec.progress.pending - 1),
          },
        });
        writeNodeData(data.nodeId, { executionStatus: 'running', executionError: undefined });
        break;
      }
      case 'node_complete': {
        if (!data.nodeId) break;
        exec.setNodeStatus(data.nodeId, 'completed');
        exec.setExecution({
          progress: {
            ...exec.progress,
            completed: exec.progress.completed + 1,
            running: Math.max(0, exec.progress.running - 1),
            percentage: data.progress ?? exec.progress.percentage,
          },
        });
        // Result backfill also marks the workspace dirty and triggers autosave.
        applyExecutionNodeOutput(data.nodeId, data.output ?? {}, {
          executionStatus: 'completed',
          executionError: undefined,
          taskId: 'exec-' + (data.executionId ?? ''),
        });
        break;
      }
      case 'node_error': {
        if (!data.nodeId) break;
        exec.setNodeStatus(data.nodeId, 'error');
        exec.setExecution({
          progress: { ...exec.progress, running: Math.max(0, exec.progress.running - 1) },
        });
        writeNodeData(data.nodeId, {
          executionStatus: 'error',
          executionError: data.error ?? t('error.nodeExecutionFailed'),
        });
        break;
      }
      case 'node_skipped': {
        if (!data.nodeId) break;
        exec.setNodeStatus(data.nodeId, 'skipped');
        writeNodeData(data.nodeId, {
          executionStatus: 'skipped',
          executionError: undefined,
        });
        break;
      }
      case 'execution_paused': {
        exec.setExecution({ status: 'paused' });
        break;
      }
      case 'execution_resumed': {
        exec.setExecution({ status: 'running' });
        break;
      }
      case 'execution_complete': {
        applyTerminal('completed', null);
        closeStream();
        break;
      }
      case 'execution_error': {
        applyTerminal('error', data.error ?? t('error.executionFailed'));
        closeStream();
        break;
      }
      case 'execution_cancelled': {
        applyTerminal('cancelled', null);
        closeStream();
        break;
      }
      default:
        break;
    }
  }, [applyTerminal, closeStream]);

  const subscribe = useCallback((executionId: string) => {
    closeStream();
    const workspace = workspaceIdRef.current;
    if (!workspace) return;

    const source = new EventSource(
      WORKFLOW_API_ROUTES.executionEvents(encodeURIComponent(workspace), encodeURIComponent(executionId)),
    );
    eventSourceRef.current = source;

    const events = [
      'execution_start',
      'node_start',
      'node_progress',
      'node_complete',
      'node_error',
      'node_skipped',
      'execution_paused',
      'execution_resumed',
      'execution_complete',
      'execution_error',
      'execution_cancelled',
    ];
    for (const event of events) {
      source.addEventListener(event, (message) => {
        handleEvent(event, (message as MessageEvent<string>).data);
      });
    }
    // EventSource auto-reconnects on transient drops; on hard errors the
    // status snapshot GET is the fallback (see restore()).
    source.onerror = () => {
      const status = useExecutionStore.getState().status;
      if (TERMINAL_STATUSES.has(status)) {
        closeStream();
      }
    };
  }, [closeStream, handleEvent]);

  /** Backfill node badges/results from a status snapshot (island reload). */
  const applySnapshot = useCallback((snapshot: ExecutionSnapshotDto) => {
    const exec = useExecutionStore.getState();
    exec.setExecution({
      executionId: snapshot.id,
      status: snapshot.status,
      error: snapshot.error,
      progress: {
        total: snapshot.progress.total,
        completed: snapshot.progress.completed,
        running: snapshot.progress.running,
        pending: snapshot.progress.pending,
        percentage: snapshot.progress.percentage,
      },
    });
    for (const [nodeId, state] of Object.entries(snapshot.nodeStates ?? {})) {
      exec.setNodeStatus(nodeId, state.status);
      const patch: Record<string, unknown> = { executionStatus: state.status };
      if (state.status === 'error' && state.error) patch.executionError = state.error;
      const output = snapshot.nodeOutputs?.[nodeId] as ExecutionNodeOutput | undefined;
      if (output) {
        applyExecutionNodeOutput(nodeId, output, patch);
      } else {
        writeNodeData(nodeId, patch);
      }
    }
  }, []);

  const startExecution = useCallback(
    async (opts: { mode?: 'full' | 'subset' | 'single'; nodeIds?: string[] } = {}) => {
      const workspace = workspaceIdRef.current;
      if (!workspace) return;
      if (startingRef.current || LIVE_STATUSES.has(useExecutionStore.getState().status)) return;
      startingRef.current = true;
      const graph = useCanvasStore.getState();
      const signature = signatureOf(graph.nodes, graph.edges, { workspaceId: workspace });
      try {
        const expectedVersion = await onBeforeStartRef.current?.();
        if (!mountedRef.current || workspaceIdRef.current !== workspace) return;
        const current = useCanvasStore.getState();
        if (signatureOf(current.nodes, current.edges, { workspaceId: workspace }) !== signature) {
          throw new Error('保存期间输入已变化，请确认内容后重新生成');
        }
        // Restoring an existing execution can finish while persistence is saving.
        if (LIVE_STATUSES.has(useExecutionStore.getState().status)) return;
        const result = await createExecution(workspace, {
          mode: opts.mode ?? 'full',
          nodeIds: opts.nodeIds,
          ...(typeof expectedVersion === 'number' ? { expectedVersion } : {}),
        });
        if (!mountedRef.current || workspaceIdRef.current !== workspace) return;
        if (!result.ok || !result.body.execution) {
          throw new Error(result.body.error === 'project-required'
            ? t('error.projectRequired')
            : (result.body.message ?? t('error.createExecutionFailed')));
        }
        closeStream();
        useExecutionStore.getState().resetExecution();
        useExecutionStore.getState().setExecution({
          executionId: result.body.execution.id,
          status: 'pending',
        });
        if (opts.mode === 'single' && opts.nodeIds?.[0]) {
          useExecutionStore.getState().setNodeStatus(opts.nodeIds[0], 'pending');
          writeNodeData(opts.nodeIds[0], {
            executionStatus: 'pending',
            executionError: undefined,
          });
        }
        subscribe(result.body.execution.id);
      } catch (error) {
        if (!mountedRef.current || workspaceIdRef.current !== workspace) return;
        // Keep an active run and its stream intact if restore raced preflight.
        if (LIVE_STATUSES.has(useExecutionStore.getState().status)) return;
        useExecutionStore.getState().setExecution({
          status: 'error',
          error: error instanceof Error ? error.message : t('error.createExecutionFailed'),
        });
      } finally {
        startingRef.current = false;
      }
    },
    [closeStream, subscribe],
  );

  const control = useCallback(
    async (action: 'pause' | 'resume' | 'cancel') => {
      const workspace = workspaceIdRef.current;
      const { executionId } = useExecutionStore.getState();
      if (!workspace || !executionId) return;
      const result = await executionAction(workspace, executionId, action);
      if (!result.ok && result.body.message) {
        useExecutionStore.getState().setExecution({ error: result.body.message });
      }
    },
    [],
  );

  const pause = useCallback(() => control('pause'), [control]);
  const resume = useCallback(() => control('resume'), [control]);
  const cancel = useCallback(() => control('cancel'), [control]);

  const reset = useCallback(() => {
    closeStream();
    useExecutionStore.getState().resetExecution();
  }, [closeStream]);

  /** Island reload: if an execution is still live, restore the subscription. */
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listExecutions(workspaceId);
        if (cancelled || !list.ok) return;
        const live = (list.body.executions ?? []).find((row) => LIVE_STATUSES.has(row.status));
        if (!live) return;
        const snapshot = await getExecution(workspaceId, live.id);
        if (cancelled || !snapshot.ok || !snapshot.body.execution) return;
        applySnapshot(snapshot.body.execution);
        if (LIVE_STATUSES.has(snapshot.body.execution.status)) {
          subscribe(live.id);
        }
      } catch {
        // Offline / no backend: stay idle.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, applySnapshot, subscribe]);

  // Single-node execution bridge for MaterialNode (in-place generation).
  useEffect(() => {
    const exec = useExecutionStore.getState();
    exec.setStartNodeExecution((nodeId: string) => {
      void startExecution({ mode: 'single', nodeIds: [nodeId] });
    });
    return () => {
      useExecutionStore.getState().setStartNodeExecution(null);
    };
  }, [startExecution]);

  // Unmount: close the stream (execution keeps running host-side).
  useEffect(() => closeStream, [closeStream]);

  return { startExecution, pause, resume, cancel, reset };
}
