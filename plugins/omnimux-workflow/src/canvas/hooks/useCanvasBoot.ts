/**
 * Island boot: ensure a workspace exists, hydrate canvasStore, load the
 * capability catalog. Extracted from App so chrome stays presentational.
 */
import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { loadGenerationPreferences } from '../store/generationPreferencesStore';
import { t } from '../i18n';
import {
  createWorkspace,
  getWorkspace,
  fetchCapabilities,
  probeLocalFiles,
} from '../bridge/apiClient';
import { applyLocalMediaProbe, collectRealPaths } from '../../shared/localMedia.ts';
import type { CapabilityCatalog } from '../../shared/api';
import type { CanvasWorkspaceSnapshot } from '../../shared/canvasTypes';
import {
  getCachedFingerprint,
  invalidateCachedCatalog,
  setCachedCatalog,
  shouldReplaceCatalogCache,
} from '../editor/hooks/useModelParameterSchema';
import { sortCatalogRows } from '../../shared/sortCatalog';
import { tableDocumentCache } from '../store/tableDocumentCache';

// Explicit empty catalog prevents consumers' nullish cache fallback while unavailable.
const UNAVAILABLE_CATALOG: CapabilityCatalog = {
  source: 'omnimux', models: [], text: [], image: [], video: [], audio: [],
};

export type BootState =
  | { phase: 'loading' }
  | { phase: 'ready'; workspace: CanvasWorkspaceSnapshot }
  | { phase: 'error'; message: string };

export interface UseCanvasBootOptions {
  /** 指定要加载的目标工作区/画布 ID（会话或创作页专属） */
  workspaceId?: string;
  /**
   * 卸载硬闸：必须同步读 canvas store（capture），再交给 persist PUT。
   * 调用发生在 `resetStore()` 之前；inline 回调用 ref 承接，避免进 effect deps。
   */
  beforeReset?: () => void;
}

export function useCanvasBoot(opts: UseCanvasBootOptions = {}) {
  const targetWorkspaceId = opts.workspaceId;
  const [boot, setBoot] = useState<BootState>({ phase: 'loading' });
  const [catalog, setCatalog] = useState<CapabilityCatalog | null>(UNAVAILABLE_CATALOG);
  const hydrateGraph = useCanvasStore((state) => state.hydrateGraph);
  const resetStore = useCanvasStore((state) => state.resetStore);
  const nodeCount = useCanvasStore((state) => state.nodes.length);
  const beforeResetRef = useRef(opts.beforeReset);
  beforeResetRef.current = opts.beforeReset;

  useEffect(() => {
    let cancelled = false;
    // 重跑时先退出 ready，persistence enabled=false，避免 resetStore 空图被 autosave
    setBoot({ phase: 'loading' });

    function normalizeCatalog(body: CapabilityCatalog): CapabilityCatalog {
      return {
        ...body,
        text: sortCatalogRows(body.text ?? []),
        image: sortCatalogRows(body.image ?? []),
        video: sortCatalogRows(body.video ?? []),
        audio: sortCatalogRows(body.audio ?? []),
      };
    }

    let catalogRequest = 0;
    async function refreshCatalog(force = false): Promise<void> {
      const request = ++catalogRequest;
      setCatalog(UNAVAILABLE_CATALOG);
      useCanvasStore.getState().setCatalogRuntime(UNAVAILABLE_CATALOG);
      try {
        const result = await fetchCapabilities();
        if (cancelled || request !== catalogRequest) return;
        if (!result.ok) {
          invalidateCachedCatalog();
          return;
        }
        const next = normalizeCatalog(result.body);
        if (shouldReplaceCatalogCache({
          cachedFingerprint: getCachedFingerprint(),
          nextFingerprint: next.fingerprint,
          force,
        })) {
          setCachedCatalog(next);
        }
        setCatalog(next);
        useCanvasStore.getState().setCatalogRuntime(next);
      } catch {
        if (cancelled || request !== catalogRequest) return;
        invalidateCachedCatalog();
      }
    }

    async function probeAndPatchImportedMedia(): Promise<void> {
      const store = useCanvasStore.getState();
      const paths = collectRealPaths(store.nodes);
      if (paths.length === 0) return;
      const probed = await probeLocalFiles(paths);
      if (cancelled || !probed.ok || !Array.isArray(probed.body.items)) return;
      const next = applyLocalMediaProbe(store.nodes, probed.body.items);
      const changed = next.some((node, index) => node !== store.nodes[index]);
      if (!changed || cancelled) return;
      store.setNodes(next);
    }

    const onCatalogUpdated = () => {
      invalidateCachedCatalog();
      void refreshCatalog(true);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('omnimux:model-catalog-updated', onCatalogUpdated);
    }

    (async () => {
      try {
        void refreshCatalog(false);

        // 会话画布必须带 workspaceId。sessionId 空窗时不得 fallback 到
        // list()[0]（会打开别人的最新图，cleanup flush 再和自己 409）。
        if (!targetWorkspaceId) return;

        await loadGenerationPreferences();
        if (cancelled) return;
        const loaded = await getWorkspace(targetWorkspaceId);
        if (cancelled) return;
        if (loaded.ok && loaded.body.workspace) {
          hydrateGraph(loaded.body.workspace.nodes, loaded.body.workspace.edges);
          await probeAndPatchImportedMedia();
          if (cancelled) return;
          setBoot({ phase: 'ready', workspace: loaded.body.workspace });
          return;
        }
        // 专属工作区尚不存在，创建属于该 ID 的纯净新工作区
        const created = await createWorkspace('工作流', targetWorkspaceId);
        if (cancelled) return;
        if (!created.ok || !created.body.workspace) {
          throw new Error(created.body.message ?? t('error.createWorkspaceFailed'));
        }
        hydrateGraph(created.body.workspace.nodes, created.body.workspace.edges);
        setBoot({ phase: 'ready', workspace: created.body.workspace });
      } catch (error) {
        if (!cancelled) {
          setBoot({ phase: 'error', message: error instanceof Error ? error.message : String(error) });
        }
      }
    })();
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener('omnimux:model-catalog-updated', onCatalogUpdated);
      }
      // 先 capture/flush 再清空，避免未 PUT 的新节点被 reset 吃掉
      beforeResetRef.current?.();
      tableDocumentCache.resetAll();
      resetStore();
    };
  }, [targetWorkspaceId, hydrateGraph, resetStore]);

  return { boot, setBoot, catalog, nodeCount };
}
