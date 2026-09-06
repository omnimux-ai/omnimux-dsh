/**
 * useWorkspacePersistence — M2 auto-save layer (replaces the M1 manual
 * save button).
 *
 * Behavior:
 * - Subscribes to the canvasStore graph; changes are debounced (1s) and
 *   saved via PUT with the optimistic-lock version.
 * - 409 / external version poll: compare signatures. Same graph → adopt
 *   the remote version (self-collision from open/flush). Local still equal
 *   to last-saved → reload. Only a real content split surfaces 'conflict'.
 * - Selection / measure-only / media nodeHeight changes are NOT saved
 *   (signature strips `selected`, `measured`, `dragging`, `positionAbsolute`,
 *   `__catalog`, `nodeHeight`, blob: URLs), so casual clicking, first layout
 *   measure, and media onLoad never dirty the doc.
 * - Best-effort flush on unmount / pagehide.
 *
 * 空图保护（persistPolicy）：
 * - 决定保存的瞬间同步拷贝 {nodes, edges}，await 后只用这份快照。
 * - 未观察到用户删光时，禁止把非空图覆盖成空（reset / flush / autosave）。
 * - hydrate 完成前（enabled=false）不订阅、不 flush。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { getWorkspace, getWorkspaceVersion, saveWorkspace } from './apiClient';
import type {
  CanvasWorkspaceSnapshot,
  SerializedCanvasEdge,
  SerializedCanvasNode,
} from '../../shared/canvasTypes';
import {
  decidePersist,
  inferPersistCause,
  shouldPersistEmptyGraph,
  snapshotGraph,
  type PersistCause,
} from './persistPolicy';
import { decideRemoteVersionAdvance } from './persistConflict';
import { sanitizeEdges, sanitizeNodes, signatureOf } from './persistSanitize';

const AUTOSAVE_DEBOUNCE_MS = 1000;
const SAVED_BADGE_MS = 2500;
/** PR3: external-edit version poll interval (visible tab only). */
const EXTERNAL_WATCH_INTERVAL_MS = 3000;

export type AutosaveStatus =
  | 'idle'
  | 'pending'
  | 'saving'
  | 'saved'
  | 'error'
  | 'conflict';

export interface PersistenceController {
  status: AutosaveStatus;
  /** Whether the local graph differs from the last saved snapshot. */
  isDirty: boolean;
  /** Force an immediate save (flushes the debounce timer). */
  saveNow: () => Promise<void>;
  /**
   * 卸载硬闸：清 debounce，同步 `readStoreCapture()`，再 `void performSave`。
   * 必须在 `resetStore()` 之前调用；PUT 可以异步，capture 必须钉死。
   */
  flushPendingSave: () => void;
  /** Conflict recovery: pull the server version and re-save local content. */
  resolveConflict: () => Promise<void>;
  /** Discard local changes and re-hydrate from the server snapshot. */
  reloadFromServer: () => Promise<void>;
}

export interface UseWorkspacePersistenceOptions {
  /** Called with the fresh server snapshot after every successful save. */
  onSaved?: (workspace: CanvasWorkspaceSnapshot) => void;
  /**
   * hydrate 完成前必须为 false：不订阅 store、不 flush。
   * App 绑 `boot.phase === 'ready'`。
   */
  enabled?: boolean;
}

interface GraphCapture {
  nodes: SerializedCanvasNode[];
  edges: SerializedCanvasEdge[];
}

function readStoreCapture(): GraphCapture {
  const { nodes, edges } = useCanvasStore.getState();
  const snap = snapshotGraph(nodes as SerializedCanvasNode[], edges as SerializedCanvasEdge[]);
  return { nodes: snap.nodes, edges: snap.edges };
}

export function useWorkspacePersistence(
  workspace: CanvasWorkspaceSnapshot | null,
  opts: UseWorkspacePersistenceOptions = {},
): PersistenceController {
  const enabled = opts.enabled !== false;
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [isDirty, setIsDirty] = useState(false);

  const workspaceRef = useRef<CanvasWorkspaceSnapshot | null>(workspace);
  const scopeRef = useRef({ workspaceId: workspace?.id ?? null });
  if (scopeRef.current.workspaceId !== (workspace?.id ?? null)) {
    scopeRef.current = { workspaceId: workspace?.id ?? null };
  }
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const isCurrentScope = (scope: typeof scopeRef.current) =>
    mountedRef.current && scopeRef.current === scope
    && workspaceRef.current?.id === scope.workspaceId;
  const serverVersionRef = useRef(0);
  const lastSavedSigRef = useRef('');
  const lastSavedNodeCountRef = useRef(0);
  const lastInitIdRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onSavedRef = useRef(opts.onSaved);
  onSavedRef.current = opts.onSaved;

  const graphSig = (
    nodes: SerializedCanvasNode[],
    edges: SerializedCanvasEdge[],
  ) => signatureOf(nodes, edges, { workspaceId: workspaceRef.current?.id });

  // (Re)initialize tracking on workspace switch / initial load. A mere
  // version bump from our own successful save only refreshes the server
  // version — it must not clobber the 'saved' badge or dirty tracking.
  useEffect(() => {
    workspaceRef.current = workspace;
    if (!workspace) {
      lastInitIdRef.current = '';
      savingRef.current = false;
      return;
    }
    serverVersionRef.current = workspace.version;
    if (lastInitIdRef.current === workspace.id) return;
    lastInitIdRef.current = workspace.id;
    savingRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (savedBadgeTimerRef.current) clearTimeout(savedBadgeTimerRef.current);
    savedBadgeTimerRef.current = null;
    // 以磁盘/服务端快照为 last-saved，不读可能已被 reset 的 store
    lastSavedSigRef.current = graphSig(workspace.nodes, workspace.edges);
    lastSavedNodeCountRef.current = workspace.nodes.length;
    setIsDirty(false);
    setStatus('idle');
  }, [workspace?.id, workspace?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearSavedBadgeTimer = () => {
    if (savedBadgeTimerRef.current) {
      clearTimeout(savedBadgeTimerRef.current);
      savedBadgeTimerRef.current = null;
    }
  };

  /**
   * 远端 version 超前：先拉快照比签名。同图只 adopt version，不弹冲突条。
   */
  const resolveRemoteAdvance = useCallback(async (input: {
    localNodes: SerializedCanvasNode[];
    localEdges: SerializedCanvasEdge[];
  }): Promise<void> => {
    const ws = workspaceRef.current;
    const scope = scopeRef.current;
    if (!ws) {
      setStatus('error');
      return;
    }
    const latest = await getWorkspace(ws.id);
    if (!isCurrentScope(scope)) return;
    if (!latest.ok || !latest.body.workspace) {
      setStatus('error');
      return;
    }
    const snapshot = latest.body.workspace;
    const decision = decideRemoteVersionAdvance({
      localSignature: graphSig(input.localNodes, input.localEdges),
      lastSavedSignature: lastSavedSigRef.current,
      remoteSignature: graphSig(snapshot.nodes, snapshot.edges),
    });
    serverVersionRef.current = snapshot.version;
    if (decision === 'conflict') {
      setStatus('conflict');
      return;
    }
    lastSavedSigRef.current = graphSig(snapshot.nodes, snapshot.edges);
    lastSavedNodeCountRef.current = snapshot.nodes.length;
    if (decision === 'reload') {
      useCanvasStore.getState().hydrateGraph(snapshot.nodes, snapshot.edges);
    }
    setIsDirty(false);
    setStatus('idle');
    onSavedRef.current?.(snapshot);
  }, []);

  /**
   * 只用调用瞬间传入的 capture；await 之后禁止再读 store。
   */
  const performSave = useCallback(async (
    capture: GraphCapture,
    cause: PersistCause,
    force = false,
  ): Promise<void> => {
    const ws = workspaceRef.current;
    const scope = scopeRef.current;
    if (!ws || scope.workspaceId !== ws.id) return;
    // 卸载硬闸（force）必须在 enabled 被打成 false 时仍能发出已钉死的快照
    if (!force && !enabledRef.current) return;
    if (savingRef.current) {
      // A save is in flight; the trailing store notification re-schedules.
      return;
    }

    const decision = decidePersist({
      lastSavedNodeCount: lastSavedNodeCountRef.current,
      nextNodes: capture.nodes,
      nextEdges: capture.edges,
      cause,
      lastSavedSignature: lastSavedSigRef.current,
      nextSignature: graphSig(capture.nodes, capture.edges),
    });
    if (!decision.persist || !decision.snapshot) return;

    const { nodes, edges } = decision.snapshot;
    const name = ws.name;
    savingRef.current = true;
    setStatus('saving');
    try {
      const result = await saveWorkspace(ws.id, {
        name,
        nodes: sanitizeNodes(nodes, { workspaceId: ws.id }),
        edges: sanitizeEdges(edges),
        expectedVersion: serverVersionRef.current,
      });

      if (!isCurrentScope(scope)) return;

      // 409: the doc moved on under us (another window, an agent edit, or
      // this island's own overlapping autosave/flush). Same-graph advances
      // only adopt the remote version — do not scare the user with a banner.
      if (result.status === 409) {
        await resolveRemoteAdvance({
          localNodes: nodes,
          localEdges: edges,
        });
        return;
      }

      if (result.ok && result.body.workspace) {
        serverVersionRef.current = result.body.workspace.version;
        lastSavedSigRef.current = graphSig(nodes, edges);
        lastSavedNodeCountRef.current = nodes.length;
        setIsDirty(false);
        setStatus('saved');
        clearSavedBadgeTimer();
        savedBadgeTimerRef.current = setTimeout(() => {
          if (isCurrentScope(scope)) setStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, SAVED_BADGE_MS);
        onSavedRef.current?.(result.body.workspace);
      } else {
        setStatus('error');
      }
    } catch {
      if (isCurrentScope(scope)) setStatus('error');
    } finally {
      if (isCurrentScope(scope)) savingRef.current = false;
    }
  }, [resolveRemoteAdvance]);

  // Core subscription: debounce store changes, skip no-op notifications.
  // hydrate 完成前不订阅。
  useEffect(() => {
    if (!enabled) return;
    const evaluate = (cause: PersistCause = 'autosave') => {
      const ws = workspaceRef.current;
      if (!ws) return;
      if (!enabledRef.current) return;
      const capture = readStoreCapture();
      const sig = graphSig(capture.nodes, capture.edges);
      const dirty = sig !== lastSavedSigRef.current;
      setIsDirty(dirty);
      if (!dirty) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setStatus((prev) => (prev === 'pending' ? 'idle' : prev));
        return;
      }
      const inferred = inferPersistCause(capture.nodes.length, cause);
      if (
        !shouldPersistEmptyGraph({
          lastSavedNodeCount: lastSavedNodeCountRef.current,
          nextNodeCount: capture.nodes.length,
          cause: inferred,
        })
      ) {
        // 从有节点跳到 0 但不是 user-delete：跳过，不要 debounce 存空
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setIsDirty(false);
        setStatus((prev) => (prev === 'pending' ? 'idle' : prev));
        return;
      }
      setStatus((prev) => (prev === 'saving' || prev === 'conflict' ? prev : 'pending'));
      if (timerRef.current) clearTimeout(timerRef.current);
      // 决定保存的瞬间钉死 capture；1s 后只用这份，禁止再读 store
      const scheduled: GraphCapture = { nodes: capture.nodes, edges: capture.edges };
      const scheduledCause = inferred;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void performSave(scheduled, scheduledCause);
      }, AUTOSAVE_DEBOUNCE_MS);
    };

    const unsubscribe = useCanvasStore.subscribe(() => {
      evaluate('autosave');
    });
    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [performSave, enabled]);

  // Best-effort flush on unmount / pagehide.
  // 先同步签名+拷贝，再交给 save（禁止 void performSave() 无快照）。
  useEffect(() => {
    if (!enabled) return;
    const flushIfDirty = () => {
      if (!enabledRef.current) return;
      const ws = workspaceRef.current;
      if (!ws) return;
      const capture = readStoreCapture();
      const cause = inferPersistCause(capture.nodes.length, 'flush');
      const decision = decidePersist({
        lastSavedNodeCount: lastSavedNodeCountRef.current,
        nextNodes: capture.nodes,
        nextEdges: capture.edges,
        cause,
        lastSavedSignature: lastSavedSigRef.current,
        nextSignature: graphSig(capture.nodes, capture.edges),
      });
      if (!decision.persist || !decision.snapshot) return;
      void performSave(decision.snapshot, cause);
    };
    window.addEventListener('pagehide', flushIfDirty);
    return () => {
      window.removeEventListener('pagehide', flushIfDirty);
      flushIfDirty();
      clearSavedBadgeTimer();
    };
  }, [performSave, enabled]);

  const saveNow = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const capture = readStoreCapture();
    await performSave(capture, inferPersistCause(capture.nodes.length, 'autosave'));
  }, [performSave]);

  /**
   * 必须同步：先读 store 再交给 PUT。调用方保证发生在 resetStore() 之前。
   */
  const flushPendingSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const ws = workspaceRef.current;
    if (!ws) return;
    const capture = readStoreCapture();
    const cause: PersistCause = 'flush';
    const decision = decidePersist({
      lastSavedNodeCount: lastSavedNodeCountRef.current,
      nextNodes: capture.nodes,
      nextEdges: capture.edges,
      cause,
      lastSavedSignature: lastSavedSigRef.current,
      nextSignature: graphSig(capture.nodes, capture.edges),
    });
    if (!decision.persist || !decision.snapshot) return;
    void performSave(decision.snapshot, cause, true);
  }, [performSave]);

  const resolveConflict = useCallback(async () => {
    const capture = readStoreCapture();
    await performSave(capture, inferPersistCause(capture.nodes.length, 'autosave'));
  }, [performSave]);

  const reloadFromServer = useCallback(async () => {
    const ws = workspaceRef.current;
    const scope = scopeRef.current;
    if (!ws) return;
    try {
      const latest = await getWorkspace(ws.id);
      if (!isCurrentScope(scope)) return;
      if (!latest.ok || !latest.body.workspace) {
        setStatus('error');
        return;
      }
      const snapshot = latest.body.workspace;
      serverVersionRef.current = snapshot.version;
      lastSavedSigRef.current = graphSig(snapshot.nodes, snapshot.edges);
      lastSavedNodeCountRef.current = snapshot.nodes.length;
      useCanvasStore.getState().hydrateGraph(snapshot.nodes, snapshot.edges);
      setIsDirty(false);
      setStatus('idle');
      onSavedRef.current?.(snapshot);
    } catch {
      if (isCurrentScope(scope)) setStatus('error');
    }
  }, []);

  // PR3 external-edit watcher: agent tools bump version without this window
  // noticing. Poll /version while visible; same-graph advances adopt the
  // remote version, clean local reloads, only a real split surfaces conflict.
  useEffect(() => {
    if (!enabled) return;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      if (!enabledRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const ws = workspaceRef.current;
      const scope = scopeRef.current;
      if (!ws || savingRef.current) return;
      inFlight = true;
      try {
        const probe = await getWorkspaceVersion(ws.id);
        if (!isCurrentScope(scope)) return;
        if (!probe.ok || typeof probe.body.version !== 'number') return;
        if (probe.body.version <= serverVersionRef.current) return;
        const capture = readStoreCapture();
        await resolveRemoteAdvance({
          localNodes: capture.nodes,
          localEdges: capture.edges,
        });
      } catch {
        // Probe failures are silent — the next tick retries.
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(() => {
      void tick();
    }, EXTERNAL_WATCH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, resolveRemoteAdvance]);

  return { status, isDirty, saveNow, flushPendingSave, resolveConflict, reloadFromServer };
}
