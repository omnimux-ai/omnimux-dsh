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
import { decideRemoteVersionAdvance, type GraphReconcileDecision } from './persistConflict';
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

export const WORKSPACE_SAVED_EVENT = 'canvas:workspace-saved';

export function notifyWorkspaceSaved(workspace: CanvasWorkspaceSnapshot): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(WORKSPACE_SAVED_EVENT, { detail: workspace }));
  }
}

export interface PersistenceController {
  status: AutosaveStatus;
  /** Whether the local graph differs from the last saved snapshot. */
  isDirty: boolean;
  /** Save the current graph or reject; returns the version safe to submit. */
  saveNow: () => Promise<number>;
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

type SavedGraphState = { version: number; signature: string; nodeCount: number };
type SaveOutcome = SavedGraphState | { error: string; skipped?: true; saved?: SavedGraphState };

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
  const currentSigRef = useRef('');
  const conflictRef = useRef(false);
  const lastSavedNodeCountRef = useRef(0);
  const lastInitIdRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef<Promise<SaveOutcome> | null>(null);
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
      savingRef.current = null;
      return;
    }
    serverVersionRef.current = workspace.version;
    if (lastInitIdRef.current === workspace.id) return;
    lastInitIdRef.current = workspace.id;
    savingRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (savedBadgeTimerRef.current) clearTimeout(savedBadgeTimerRef.current);
    savedBadgeTimerRef.current = null;
    conflictRef.current = false;
    // 以磁盘/服务端快照为 last-saved，不读可能已被 reset 的 store
    lastSavedSigRef.current = graphSig(workspace.nodes, workspace.edges);
    currentSigRef.current = lastSavedSigRef.current;
    lastSavedNodeCountRef.current = workspace.nodes.length;
    setIsDirty(false);
    setStatus('idle');
  }, [workspace?.id, workspace?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  // 监听外部（如服务端原子写入或拆解完成）的已保存快照广播，对齐本地版本并触发 onSaved
  useEffect(() => {
    const handleRemoteSaved = (e: Event) => {
      const snap = (e as CustomEvent<CanvasWorkspaceSnapshot>).detail;
      if (!snap || snap.id !== workspaceRef.current?.id) return;
      serverVersionRef.current = snap.version;
      lastSavedSigRef.current = graphSig(snap.nodes, snap.edges);
      currentSigRef.current = lastSavedSigRef.current;
      lastSavedNodeCountRef.current = snap.nodes.length;
      conflictRef.current = false;
      setIsDirty(false);
      setStatus('idle');
      onSavedRef.current?.(snap);
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener(WORKSPACE_SAVED_EVENT, handleRemoteSaved);
      return () => {
        window.removeEventListener(WORKSPACE_SAVED_EVENT, handleRemoteSaved);
      };
    }
  }, []);

  const clearSavedBadgeTimer = () => {
    if (savedBadgeTimerRef.current) {
      clearTimeout(savedBadgeTimerRef.current);
      savedBadgeTimerRef.current = null;
    }
  };

  const performSaveRef = useRef<
    ((capture: GraphCapture, cause: PersistCause, force?: boolean, resolveConflict?: boolean) => Promise<SaveOutcome>) | null
  >(null);

  /** 1s 去抖后保存钉死的 capture（冲突期间由 performSave 自己拒绝）。 */
  const armAutosave = useCallback((capture: GraphCapture, cause: PersistCause = 'autosave') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const scheduled: GraphCapture = { nodes: capture.nodes, edges: capture.edges };
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void performSaveRef.current?.(scheduled, cause);
    }, AUTOSAVE_DEBOUNCE_MS);
  }, []);

  /**
   * 远端 version 超前：先拉快照比签名。
   *
   * 判定必须用 await 之后的**当前** store 快照：版本探测与本地捕获不同源，
   * 沿用探测前的旧快照会把探测窗口内的编辑（典型：导入素材插入节点）
   * 误判成真分叉并冻结自动保存（Issue #3595）。四态见 persistConflict。
   */
  const resolveRemoteAdvance = useCallback(async (): Promise<GraphReconcileDecision | 'unavailable'> => {
    const ws = workspaceRef.current;
    const scope = scopeRef.current;
    if (!ws) {
      setStatus('error');
      return 'unavailable';
    }
    const latest = await getWorkspace(ws.id);
    if (!isCurrentScope(scope)) return 'unavailable';
    if (!latest.ok || !latest.body.workspace) {
      setStatus('error');
      return 'unavailable';
    }
    const snapshot = latest.body.workspace;
    // 期间若有自己的保存在飞/已完成，快照可能比本地记录的版本还旧：
    // 版本只能前进，过旧快照直接放弃应用，避免把版本写回去再撞 409。
    if (snapshot.version < serverVersionRef.current) return 'unavailable';
    serverVersionRef.current = snapshot.version;
    // Only the explicit resolution controls may release an existing conflict.
    if (conflictRef.current) return 'conflict';
    const current = readStoreCapture();
    const currentSignature = graphSig(current.nodes, current.edges);
    const remoteSignature = graphSig(snapshot.nodes, snapshot.edges);
    const decision = decideRemoteVersionAdvance({
      localSignature: currentSignature,
      lastSavedSignature: lastSavedSigRef.current,
      remoteSignature,
    });
    currentSigRef.current = currentSignature;
    if (decision === 'conflict') {
      conflictRef.current = true;
      setIsDirty(true);
      setStatus('conflict');
      return 'conflict';
    }
    lastSavedSigRef.current = remoteSignature;
    lastSavedNodeCountRef.current = snapshot.nodes.length;
    if (decision === 'reload') {
      useCanvasStore.getState().hydrateGraph(snapshot.nodes, snapshot.edges);
      setIsDirty(false);
      setStatus('idle');
      onSavedRef.current?.(snapshot);
      return 'reload';
    }
    if (decision === 'resave') {
      // 远端没有本地尚未拥有的内容：本地领先，续存即可，不弹条。
      // 这里还没有保存成功，不能当成「已保存」广播给宿主。
      setIsDirty(true);
      setStatus((prev) => (prev === 'saving' ? prev : 'pending'));
      return 'resave';
    }
    setIsDirty(false);
    setStatus('idle');
    onSavedRef.current?.(snapshot);
    return 'adopt';
  }, []);

  /**
   * 只用调用瞬间传入的 capture；await 之后禁止再读 store。
   */
  const performSave = useCallback((
    capture: GraphCapture,
    cause: PersistCause,
    force = false,
    resolveConflict = false,
  ): Promise<SaveOutcome> => {
    const ws = workspaceRef.current;
    const scope = scopeRef.current;
    const previous = savingRef.current;
    const capturedSaved: SavedGraphState = {
      version: serverVersionRef.current,
      signature: lastSavedSigRef.current,
      nodeCount: lastSavedNodeCountRef.current,
    };
    const capturedConflict = conflictRef.current;
    const pending = (async (): Promise<SaveOutcome> => {
      const prior = previous ? await previous : null;
      const current = isCurrentScope(scope);
      const priorSaved = prior && 'error' in prior ? prior.saved : prior;
      const saved = current ? {
        version: serverVersionRef.current,
        signature: lastSavedSigRef.current,
        nodeCount: lastSavedNodeCountRef.current,
      } : priorSaved ?? capturedSaved;
      if (!ws || scope.workspaceId !== ws.id) {
        return { error: '画布尚未就绪，请重新打开后再试' };
      }
      if (!current && prior && 'error' in prior && !prior.skipped) return prior;
      // A flush captured before leaving still belongs to this workspace. Its
      // version follows this queue's successful PUT, never the new canvas refs.
      if ((!current && !force && cause !== 'flush') || (!force && current && !enabledRef.current)) {
        return { error: '画布已切换，请重新发起生成', skipped: true, saved };
      }
      const conflict = current ? conflictRef.current : capturedConflict;
      if (conflict && !resolveConflict) {
        return { error: '画布版本冲突，请先保留本地内容或重新加载' };
      }
      const signature = signatureOf(capture.nodes, capture.edges, { workspaceId: ws.id });
      const decision = decidePersist({
        lastSavedNodeCount: saved.nodeCount,
        nextNodes: capture.nodes,
        nextEdges: capture.edges,
        cause,
        lastSavedSignature: resolveConflict && conflict ? '' : saved.signature,
        nextSignature: signature,
      });
      if (!decision.persist || !decision.snapshot) {
        return decision.reason === 'unchanged'
          ? saved
          : { error: '画布内容尚未保存，请重新打开后再试' };
      }
      const { nodes, edges } = decision.snapshot;
      if (current) setStatus('saving');
      try {
        const payload = {
          name: ws.name,
          nodes: sanitizeNodes(nodes, { workspaceId: ws.id }),
          edges: sanitizeEdges(edges),
        };
        let result = await saveWorkspace(ws.id, { ...payload, expectedVersion: saved.version });
        if (result.status === 409) {
          if (!isCurrentScope(scope)) return { error: '画布版本冲突，未保存离开前的修改' };
          const reconcile = await resolveRemoteAdvance();
          if (!isCurrentScope(scope)) return { error: '画布已切换，请重新发起生成' };
          if (reconcile === 'adopt') {
            // 远端已经等于当前本地内容：内容其实已在服务端，不弹冲突条、不重复写；
            // 但这次点击仍按「未保存成功」阻断（同一张图也不重发提交）。
            if (isCurrentScope(scope)) {
              setIsDirty(currentSigRef.current !== lastSavedSigRef.current);
              setStatus('idle');
            }
            return { error: '画布版本冲突，请确认最新内容后重新生成' };
          }
          if (reconcile === 'reload') {
            // 本地相对服务端没有未存内容，已载入远端图；不要让页面停在冲突态。
            return { error: '画布已被其它会话更新，已载入最新内容，请重新发起生成' };
          }
          if (reconcile === 'resave') {
            // 远端只是落后于本地（不含任何别人的新内容）：带最新版本重试一次，
            // 不把「自己的保存推进了版本」误报成内容冲突（Issue #3595）。
            result = await saveWorkspace(ws.id, { ...payload, expectedVersion: serverVersionRef.current });
            if (!isCurrentScope(scope)) return { error: '画布已切换，请重新发起生成' };
            if (result.status === 409) {
              // 重试前远端又被推进：这才是真的没法自动合并。
              conflictRef.current = true;
              setStatus('conflict');
              return { error: '画布版本冲突，请确认最新内容后重新生成' };
            }
          } else {
            // reconcile === 'conflict'，或快照不可用：交给用户显式选择。
            conflictRef.current = true;
            setStatus('conflict');
            return { error: '画布版本冲突，请确认最新内容后重新生成' };
          }
        }
        if (!result.ok || !result.body.workspace) {
          if (isCurrentScope(scope)) setStatus(conflictRef.current ? 'conflict' : 'error');
          return { error: result.body.message ?? '画布保存失败，请重试' };
        }
        const version = result.body.workspace.version;
        const nextSaved = { version, signature, nodeCount: nodes.length };
        if (!isCurrentScope(scope)) return nextSaved;
        if (resolveConflict) conflictRef.current = false;
        serverVersionRef.current = version;
        lastSavedSigRef.current = signature;
        lastSavedNodeCountRef.current = nodes.length;
        const dirty = currentSigRef.current !== signature;
        setIsDirty(dirty);
        setStatus(dirty ? 'pending' : 'saved');
        clearSavedBadgeTimer();
        savedBadgeTimerRef.current = setTimeout(() => {
          if (isCurrentScope(scope)) setStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, SAVED_BADGE_MS);
        onSavedRef.current?.(result.body.workspace);
        return nextSaved;
      } catch {
        if (!isCurrentScope(scope)) return { error: '画布已切换，请重新发起生成' };
        setStatus(conflictRef.current ? 'conflict' : 'error');
        return { error: '画布保存失败，请重试' };
      }
    })();
    savingRef.current = pending;
    void pending.then(() => {
      if (savingRef.current === pending) savingRef.current = null;
    });
    return pending;
  }, [resolveRemoteAdvance]);
  // armAutosave / 冲突恢复都要能在 performSave 之外排程同一份保存逻辑。
  performSaveRef.current = performSave;

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
      currentSigRef.current = sig;
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
      // 决定保存的瞬间钉死 capture；1s 后只用这份，禁止再读 store
      armAutosave({ nodes: capture.nodes, edges: capture.edges }, inferred);
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
  }, [armAutosave, enabled]);

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

  const saveNow = useCallback(async (): Promise<number> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const scope = scopeRef.current;
    const capture = readStoreCapture();
    const signature = graphSig(capture.nodes, capture.edges);
    const assertCurrent = () => {
      const current = readStoreCapture();
      if (!enabledRef.current || !isCurrentScope(scope)
        || graphSig(current.nodes, current.edges) !== signature) {
        throw new Error('保存期间输入已变化，请确认内容后重新生成');
      }
    };
    // An autosave may have captured an older graph. Wait for it before saving
    // this click's snapshot, and never submit if that snapshot has changed.
    if (savingRef.current) {
      const previous = await savingRef.current;
      if ('error' in previous) throw new Error(previous.error);
    }
    assertCurrent();
    const result = await performSave(capture, inferPersistCause(capture.nodes.length, 'autosave'));
    if ('error' in result) throw new Error(result.error);
    assertCurrent();
    return result.version;
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
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const capture = readStoreCapture();
    await performSave(capture, inferPersistCause(capture.nodes.length, 'autosave'), false, true);
  }, [performSave]);

  const reloadFromServer = useCallback(async () => {
    const ws = workspaceRef.current;
    const scope = scopeRef.current;
    if (!ws) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      if (savingRef.current) await savingRef.current;
      if (!isCurrentScope(scope)) return;
      const latest = await getWorkspace(ws.id);
      if (!isCurrentScope(scope)) return;
      if (!latest.ok || !latest.body.workspace) {
        setStatus('error');
        return;
      }
      const snapshot = latest.body.workspace;
      conflictRef.current = false;
      serverVersionRef.current = snapshot.version;
      lastSavedSigRef.current = graphSig(snapshot.nodes, snapshot.edges);
      lastSavedNodeCountRef.current = snapshot.nodes.length;
      useCanvasStore.getState().hydrateGraph(snapshot.nodes, snapshot.edges);
      setIsDirty(false);
      setStatus('idle');
      onSavedRef.current?.(snapshot);
    } catch {
      if (isCurrentScope(scope)) setStatus(conflictRef.current ? 'conflict' : 'error');
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
      if (!ws || savingRef.current || conflictRef.current) return;
      inFlight = true;
      try {
        const probe = await getWorkspaceVersion(ws.id);
        if (!isCurrentScope(scope)) return;
        // 两次 await 期间可能有自己的保存开始/完成：它已经处理过版本，
        // 这里再判会用旧快照覆盖新版本。
        if (savingRef.current || conflictRef.current) return;
        if (!probe.ok || typeof probe.body.version !== 'number') return;
        if (probe.body.version <= serverVersionRef.current) return;
        const decision = await resolveRemoteAdvance();
        if (!isCurrentScope(scope)) return;
        // 远端只是落后于本地：立即续存，不弹冲突条（Issue #3595）。
        // 已有排程时不动它：那笔保存会带更新的本地图，也保留用户删除的 cause。
        if (decision === 'resave' && !timerRef.current) {
          const capture = readStoreCapture();
          armAutosave(capture, inferPersistCause(capture.nodes.length, 'autosave'));
        }
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
  }, [armAutosave, enabled, resolveRemoteAdvance]);

  return { status, isDirty, saveNow, flushPendingSave, resolveConflict, reloadFromServer };
}
