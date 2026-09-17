/**
 * useExecutionController — M3 port of Gxgen `useExecutionSSE` +
 * `useExecutionSync` (island flavor).
 *
 * Owns the execution lifecycle for the canvas:
 *  - startExecution: POST create (full / subset / single) -> subscribe SSE
 *  - pause / resume / cancel control calls
 *  - SSE event handling: control state -> executionStore; per-node states
 *    and mock results -> canvasStore node.data (only the changed node is
 *    updated — the Gxgen performance pattern; result writes also trigger
 *    the M2 autosave layer)
 *  - island reload: restore every still-live execution by executionId
 *    (GET list -> snapshot backfill -> re-subscribe)
 *
 * #2255 — every manual submit owns its own run: its own execution id, its own
 * SSE stream, and its own node statuses. The canvas used to hold one execution
 * slot, so a submit arriving while another run was live was dropped without a
 * word. Events are attributed through the `executionId` every payload carries,
 * which is what keeps concurrent runs from settling each other's nodes.
 *
 * Differences from Gxgen: EventSource instead of fetch-stream (the plugin
 * exposes a dedicated GET /events route), no auth token (local same-origin).
 */

import { useCallback, useEffect, useRef } from 'react';
import { WORKFLOW_API_ROUTES } from '../../shared/api';
import type { ExecutionSnapshotDto, NodeExecutionApiStatus } from '../../shared/api';
import {
  createExecution,
  executionAction,
  getExecution,
  listExecutions,
} from '../bridge/apiClient';
import { useCanvasStore } from '../store/canvasStore';
import {
  useExecutionStore,
  isLiveExecutionStatus,
  LOCAL_RUN_ID,
  type ExecutionUiStatus,
} from '../store/executionStore';
import { t } from '../i18n';
import { signatureOf } from '../bridge/persistSanitize';

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

/** Node statuses owned by a live executor (a terminal run keeps none). */
const IN_FLIGHT_STATUSES = new Set<NodeExecutionApiStatus>(['pending', 'running']);

/**
 * Converge every node still in flight into a terminal status.
 *
 * `node_start` writes `executionStatus: 'running'` into node.data (single-node
 * mode writes `'pending'` first) and the terminal execution events carry no
 * per-node event, so without this the GSC stays on 「生成中…」 — and the stale
 * marker is autosaved with the canvas document, so reloading brings it back.
 * Writes follow the existing `node_error` / `node_skipped` branches.
 *
 * @param status Terminal node status: `skipped` for a cancelled run, `error`
 *   for a failed one, `completed` for one that finished.
 * @param error Error message recorded on the `error` convergence.
 * @param executionId The run whose terminal event triggered the convergence.
 *   Nodes still owned by a **different** live run are left untouched — that is
 *   what stops one run's end from settling another run's in-flight nodes.
 *   Omitted on the reload path, where the question is 「does any live run still
 *   own this node」 rather than 「did this run finish」.
 * @returns The converged node ids (assertions / logging).
 */
export function settleInFlightNodes(
  status: 'skipped' | 'error' | 'completed',
  error?: string,
  executionId?: string,
): string[] {
  const exec = useExecutionStore.getState();
  const ownedByOtherLiveRun = (nodeId: string): boolean =>
    exec.runs.some(
      (run) =>
        run.executionId !== executionId
        && isLiveExecutionStatus(run.status)
        && IN_FLIGHT_STATUSES.has(run.nodeStatuses[nodeId] as NodeExecutionApiStatus),
    );

  const nodeIds = new Set<string>();
  for (const [nodeId, nodeStatus] of Object.entries(exec.nodeStatuses)) {
    if (IN_FLIGHT_STATUSES.has(nodeStatus) && !ownedByOtherLiveRun(nodeId)) nodeIds.add(nodeId);
  }
  for (const node of useCanvasStore.getState().nodes) {
    const executionStatus = (node.data as { executionStatus?: NodeExecutionApiStatus }).executionStatus;
    if (
      executionStatus !== undefined
      && IN_FLIGHT_STATUSES.has(executionStatus)
      && !ownedByOtherLiveRun(node.id)
    ) {
      nodeIds.add(node.id);
    }
  }

  const settled = [...nodeIds];
  for (const nodeId of settled) {
    if (executionId !== undefined) exec.setRunNodeStatus(executionId, nodeId, status);
    else exec.setNodeStatus(nodeId, status);
    writeNodeData(nodeId, {
      executionStatus: status,
      executionError: status === 'error' ? (error ?? t('error.nodeExecutionFailed')) : undefined,
    });
  }
  return settled;
}

/**
 * Island-reload guard for the 「no live execution」 branch: may the autosaved
 * in-flight markers be converged now?
 *
 * The store status alone is not enough. `startExecution` awaits
 * `createExecution` while its run is not registered yet (the run is created
 * only after the POST returns), so a list call that resolves inside that window
 * looks like 「no surviving run」 and would flash every pending node to
 * `'skipped'` until the SSE `node_start` corrects it.
 *
 * @param startInFlight True while at least one `startExecution` holds a
 *   submission slot: from the save preflight onwards, across the create POST,
 *   until the run is registered and `subscribe` has returned.
 * @returns True when the caller may settle the in-flight nodes.
 */
export function shouldConvergeInFlightOnReload(startInFlight: boolean): boolean {
  if (startInFlight) return false;
  return useExecutionStore.getState().activeRunCount === 0;
}

/** Terminal state for one run: nothing is in flight in it any more. */
function applyTerminalStatus(
  executionId: string,
  status: ExecutionUiStatus,
  error: string | null,
): void {
  const exec = useExecutionStore.getState();
  const run = exec.runs.find((candidate) => candidate.executionId === executionId);
  const progress = run?.progress ?? { total: 0, completed: 0, running: 0, pending: 0, percentage: 0 };
  exec.patchRun(executionId, {
    status,
    error,
    progress: {
      ...progress,
      running: 0,
      percentage: status === 'completed' ? 100 : progress.percentage,
    },
  });
}

/**
 * Parse and apply one SSE execution event.
 *
 * Module-level (the hook only supplies the stream handle) so the island's event
 * handling is exercisable headlessly by tests. The run an event belongs to is
 * the `executionId` in its own payload — every server event carries one, which
 * is what makes concurrent runs separable; payloads without one fall back to
 * the focused run.
 */
export function dispatchExecutionEvent(
  eventType: string,
  raw: string,
  closeStream: () => void,
): void {
  let data: SseEventData;
  try {
    data = JSON.parse(raw) as SseEventData;
  } catch {
    return;
  }
  const exec = useExecutionStore.getState();
  const executionId = typeof data.executionId === 'string' && data.executionId
    ? data.executionId
    : exec.focusExecutionId;
  if (!executionId) return;

  /** The run's own progress — never the canvas-wide projection. */
  const runProgress = () => {
    const run = useExecutionStore.getState().runs.find((c) => c.executionId === executionId);
    return run?.progress ?? { total: 0, completed: 0, running: 0, pending: 0, percentage: 0 };
  };

  switch (eventType) {
    case 'execution_start': {
      exec.patchRun(executionId, {
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
      const progress = runProgress();
      exec.setRunNodeStatus(executionId, data.nodeId, 'running');
      exec.patchRun(executionId, {
        progress: {
          ...progress,
          running: progress.running + 1,
          pending: Math.max(0, progress.pending - 1),
        },
      });
      writeNodeData(data.nodeId, { executionStatus: 'running', executionError: undefined });
      break;
    }
    case 'node_complete': {
      if (!data.nodeId) break;
      const progress = runProgress();
      exec.setRunNodeStatus(executionId, data.nodeId, 'completed');
      exec.patchRun(executionId, {
        progress: {
          ...progress,
          completed: progress.completed + 1,
          running: Math.max(0, progress.running - 1),
          percentage: data.progress ?? progress.percentage,
        },
      });
      // Result backfill also marks the workspace dirty and triggers autosave.
      applyExecutionNodeOutput(data.nodeId, data.output ?? {}, {
        executionStatus: 'completed',
        executionError: undefined,
        taskId: 'exec-' + executionId,
      });
      break;
    }
    case 'node_error': {
      if (!data.nodeId) break;
      const progress = runProgress();
      exec.setRunNodeStatus(executionId, data.nodeId, 'error');
      exec.patchRun(executionId, {
        progress: { ...progress, running: Math.max(0, progress.running - 1) },
      });
      writeNodeData(data.nodeId, {
        executionStatus: 'error',
        executionError: data.error ?? t('error.nodeExecutionFailed'),
      });
      break;
    }
    case 'node_skipped': {
      if (!data.nodeId) break;
      exec.setRunNodeStatus(executionId, data.nodeId, 'skipped');
      writeNodeData(data.nodeId, {
        executionStatus: 'skipped',
        executionError: undefined,
      });
      break;
    }
    case 'execution_paused': {
      exec.patchRun(executionId, { status: 'paused' });
      break;
    }
    case 'execution_resumed': {
      exec.patchRun(executionId, { status: 'running' });
      break;
    }
    case 'execution_complete': {
      applyTerminalStatus(executionId, 'completed', null);
      // #1386: symmetric with the error / cancelled branches. A node still marked
      // in flight when the run completed has no executor left (the run is over),
      // so leaving the marker is the same permanent 「生成中…」 those branches
      // already prevent — just through a narrower window (a lost `node_complete`).
      settleInFlightNodes('completed', undefined, executionId);
      closeStream();
      break;
    }
    case 'execution_error': {
      const message = data.error ?? t('error.executionFailed');
      applyTerminalStatus(executionId, 'error', message);
      settleInFlightNodes('error', message, executionId);
      closeStream();
      break;
    }
    case 'execution_cancelled': {
      applyTerminalStatus(executionId, 'cancelled', null);
      settleInFlightNodes('skipped', undefined, executionId);
      closeStream();
      break;
    }
    default:
      break;
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

type ControlAction = 'pause' | 'resume' | 'cancel';

/**
 * Which live runs a canvas-level control action applies to. Pause and resume
 * only make sense for the matching backend state (`pause` rejects anything not
 * RUNNING, `resume` anything not PAUSED), cancel takes every live run.
 */
const CONTROL_TARGET_STATUSES: Record<ControlAction, ReadonlySet<ExecutionUiStatus>> = {
  pause: new Set<ExecutionUiStatus>(['running']),
  resume: new Set<ExecutionUiStatus>(['paused']),
  cancel: new Set<ExecutionUiStatus>(['pending', 'running', 'paused']),
};

export function useExecutionController(
  workspaceId: string | null,
  opts?: ExecutionControllerOptions,
): ExecutionController {
  /** executionId -> its own event stream (one stream per concurrent run). */
  const streamsRef = useRef(new Map<string, EventSource>());
  /** Submission keys whose create POST is in flight (double-submit guard). */
  const startingRef = useRef(new Set<string>());
  /**
   * Bumped by `reset()`. A create POST that resolves after the user cleared the
   * canvas must not resurrect a run and open a stream nobody is watching, so
   * every post-await write re-checks the generation it started under.
   */
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const workspaceIdRef = useRef<string | null>(workspaceId);
  workspaceIdRef.current = workspaceId;
  const onBeforeStartRef = useRef(opts?.onBeforeStart);
  onBeforeStartRef.current = opts?.onBeforeStart;

  /** Close one run's stream, or every stream when no id is given. */
  const closeStream = useCallback((executionId?: string) => {
    const streams = streamsRef.current;
    if (executionId === undefined) {
      for (const source of streams.values()) source.close();
      streams.clear();
      return;
    }
    const source = streams.get(executionId);
    if (source) {
      source.close();
      streams.delete(executionId);
    }
  }, []);

  const handleEvent = useCallback((executionId: string, eventType: string, raw: string) => {
    dispatchExecutionEvent(eventType, raw, () => closeStream(executionId));
  }, [closeStream]);

  const subscribe = useCallback((executionId: string) => {
    closeStream(executionId);
    const workspace = workspaceIdRef.current;
    if (!workspace) return;

    const source = new EventSource(
      WORKFLOW_API_ROUTES.executionEvents(encodeURIComponent(workspace), encodeURIComponent(executionId)),
    );
    streamsRef.current.set(executionId, source);

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
        handleEvent(executionId, event, (message as MessageEvent<string>).data);
      });
    }
    // EventSource auto-reconnects on transient drops; on hard errors the
    // status snapshot GET is the fallback (see the reload effect).
    source.onerror = () => {
      const run = useExecutionStore.getState().runs.find((c) => c.executionId === executionId);
      if (!run || TERMINAL_STATUSES.has(run.status)) {
        closeStream(executionId);
      }
    };
  }, [closeStream, handleEvent]);

  /** Backfill one run's node badges/results from a status snapshot. */
  const applySnapshot = useCallback((snapshot: ExecutionSnapshotDto) => {
    const exec = useExecutionStore.getState();
    exec.ensureRun(snapshot.id);
    exec.patchRun(snapshot.id, {
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
      exec.setRunNodeStatus(snapshot.id, nodeId, state.status);
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
      if (opts.mode === 'full') {
        throw new Error('创作画布不支持全画布一键运行，请选择指定节点执行');
      }
      // #2255: a submit is no longer refused while another run is live. Only a
      // repeat of the *same* submission is guarded, so double-clicking one node
      // cannot fire two runs while clicks on other nodes go straight through.
      // Ids are sorted and NUL-joined: `['a','b']` and `['b','a']` are the same
      // node set, and a comma inside an id must not forge another key.
      const submissionKey = `${opts.mode ?? 'full'}:${[...(opts.nodeIds ?? [])].sort().join('\u0000')}`;
      if (startingRef.current.has(submissionKey)) return;
      startingRef.current.add(submissionKey);
      const generation = generationRef.current;
      const graph = useCanvasStore.getState();
      const signature = signatureOf(graph.nodes, graph.edges, { workspaceId: workspace });
      try {
        const expectedVersion = await onBeforeStartRef.current?.();
        if (!mountedRef.current || workspaceIdRef.current !== workspace) return;
        const current = useCanvasStore.getState();
        if (signatureOf(current.nodes, current.edges, { workspaceId: workspace }) !== signature) {
          throw new Error('保存期间输入已变化，请确认内容后重新生成');
        }
        const result = await createExecution(workspace, {
          mode: opts.mode ?? 'full',
          nodeIds: opts.nodeIds,
          ...(typeof expectedVersion === 'number' ? { expectedVersion } : {}),
        });
        if (!mountedRef.current || workspaceIdRef.current !== workspace) return;
        if (generationRef.current !== generation) return;
        if (!result.ok || !result.body.execution) {
          throw new Error(result.body.error === 'project-required'
            ? t('error.projectRequired')
            : (result.body.message ?? t('error.createExecutionFailed')));
        }
        const exec = useExecutionStore.getState();
        exec.ensureRun(result.body.execution.id);
        if (opts.mode === 'single' && opts.nodeIds?.[0]) {
          exec.setRunNodeStatus(result.body.execution.id, opts.nodeIds[0], 'pending');
          writeNodeData(opts.nodeIds[0], {
            executionStatus: 'pending',
            executionError: undefined,
          });
        }
        subscribe(result.body.execution.id);
      } catch (error) {
        if (!mountedRef.current || workspaceIdRef.current !== workspace) return;
        // A rejected submit belongs to the canvas, not to any live run: writing
        // it onto the focused run would flip a healthy run to `error`.
        useExecutionStore.getState().setExecution({
          executionId: LOCAL_RUN_ID,
          status: 'error',
          error: error instanceof Error ? error.message : t('error.createExecutionFailed'),
        });
      } finally {
        startingRef.current.delete(submissionKey);
      }
    },
    [subscribe],
  );

  /**
   * Canvas-level control: the bar's pause / resume / cancel apply to every run
   * the action is valid for, which is what a single-run canvas did implicitly.
   */
  const control = useCallback(
    async (action: ControlAction) => {
      const workspace = workspaceIdRef.current;
      if (!workspace) return;
      const targets = useExecutionStore
        .getState()
        .runs.filter((run) => CONTROL_TARGET_STATUSES[action].has(run.status));
      await Promise.all(targets.map(async (run) => {
        try {
          const result = await executionAction(workspace, run.executionId, action);
          if (!result.ok && result.body.message) {
            useExecutionStore.getState().patchRun(run.executionId, { error: result.body.message });
          }
        } catch (error) {
          // `executionAction` rejects on a transport failure rather than
          // returning `{ ok: false }`. Without this the whole fan-out rejects,
          // the caller's `void` call becomes an unhandled rejection, and the
          // other runs' outcomes are lost.
          useExecutionStore.getState().patchRun(run.executionId, {
            error: error instanceof Error ? error.message : t('error.executionFailed'),
          });
        }
      }));
    },
    [],
  );

  const pause = useCallback(() => control('pause'), [control]);
  const resume = useCallback(() => control('resume'), [control]);
  const cancel = useCallback(() => control('cancel'), [control]);

  const reset = useCallback(() => {
    closeStream();
    // A create POST still in flight must not re-register its run afterwards;
    // bumping the generation also releases the submission slots.
    generationRef.current += 1;
    startingRef.current.clear();
    useExecutionStore.getState().resetExecution();
  }, [closeStream]);

  /** Island reload: restore every execution still live in this workspace. */
  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listExecutions(workspaceId);
        if (cancelled || !list.ok) return;
        const live = (list.body.executions ?? []).filter((row) => isLiveExecutionStatus(row.status));
        if (live.length === 0) {
          // No live run for this workspace: the in-flight markers autosaved with
          // the canvas document belong to a run that ended while this island was
          // away, and nothing will ever correct them over SSE — converge them
          // here instead. A start that raced the list call stays untouched; see
          // `shouldConvergeInFlightOnReload` for the exact condition.
          if (shouldConvergeInFlightOnReload(startingRef.current.size > 0)) settleInFlightNodes('skipped');
          return;
        }
        // Independent, idempotent GETs: restore them together so the canvas
        // does not wait one round trip per live run.
        const snapshots = await Promise.all(live.map(async (row) => ({
          row,
          snapshot: await getExecution(workspaceId, row.id),
        })));
        if (cancelled) return;
        for (const { row, snapshot } of snapshots) {
          if (!snapshot.ok || !snapshot.body.execution) continue;
          applySnapshot(snapshot.body.execution);
          if (isLiveExecutionStatus(snapshot.body.execution.status)) subscribe(row.id);
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

  // Unmount: close every stream (executions keep running host-side).
  useEffect(() => () => closeStream(), [closeStream]);

  return { startExecution, pause, resume, cancel, reset };
}
