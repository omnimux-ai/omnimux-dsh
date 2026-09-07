/**
 * useTablePersistence — Autosave and Flush pipeline for tabular documents (.htable).
 *
 * Parallel to useWorkspacePersistence:
 * - Listens to tableDocumentCache dirty events.
 * - Debounced (800ms) PUT to /omnimux-workflow/api/workspaces/:wsId/tables/:tableId.
 * - Provides flushDirtyTables() for unmount / beforeReset / pagehide hard gates.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { tableDocumentCache, type DirtyTableCapture } from '../store/tableDocumentCache.ts';
import { saveWorkspaceTable } from './apiClient.ts';

const TABLE_AUTOSAVE_DEBOUNCE_MS = 800;

export interface TablePersistenceController {
  isDirty: boolean;
  saveNow: () => Promise<void>;
  flushDirtyTables: (opts?: { force?: boolean }) => void;
}

export interface UseTablePersistenceOptions {
  workspaceId: string | null;
  enabled?: boolean;
}

export function useTablePersistence(
  opts: UseTablePersistenceOptions,
): TablePersistenceController {
  const { workspaceId, enabled = true } = opts;
  const [isDirty, setIsDirty] = useState(false);

  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeRef = useRef({ workspaceId });
  const savingRef = useRef<Promise<Map<string, number>> | null>(null);
  if (scopeRef.current.workspaceId !== workspaceId) {
    scopeRef.current = { workspaceId };
    savingRef.current = null;
  }
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const performSave = useCallback(
    (captures?: DirtyTableCapture[], force = false): Promise<void> => {
      const wsId = workspaceIdRef.current;
      if (!wsId || (!force && !enabledRef.current)) return Promise.resolve();

      // Capture before queueing: neither the target nor the document may follow
      // a later workspace's global cache after an in-flight PUT completes.
      const itemsToSave = (captures ?? tableDocumentCache.captureDirty()).map(item => ({
        ...item, session: tableDocumentCache.getSession(item.tableId),
      }));
      const scope = scopeRef.current;
      const isCurrent = () => mountedRef.current && scopeRef.current === scope;
      const ownsSession = (item: typeof itemsToSave[number]) =>
        isCurrent() && tableDocumentCache.getSession(item.tableId) === item.session;
      const previous = savingRef.current;
      const pending = (async () => {
        const revisions = new Map(previous ? await previous : []);
        await Promise.all(itemsToSave.map(async (item) => {
          if (ownsSession(item)) tableDocumentCache.setSaving(item.tableId, true);
          try {
            const res = await saveWorkspaceTable(wsId, item.tableId, {
              expectedRev: revisions.get(item.tableId) ?? item.expectedRev,
              document: item.document,
            });
            if (res.ok && res.body.table) {
              revisions.set(item.tableId, res.body.table.contentRev);
              if (ownsSession(item)) {
                tableDocumentCache.markSaved(item.tableId, res.body.table.contentRev, item.document);
              }
            } else if (ownsSession(item)) {
              tableDocumentCache.markSaveError(
                item.tableId, res.body.message || res.body.error || 'Save failed',
              );
            }
          } catch (err: unknown) {
            if (ownsSession(item)) {
              tableDocumentCache.markSaveError(
                item.tableId, err instanceof Error ? err.message : 'Network error',
              );
            }
          }
        }));
        if (isCurrent()) setIsDirty(tableDocumentCache.captureDirty().length > 0);
        return revisions;
      })();
      savingRef.current = pending;
      void pending.then(() => {
        if (savingRef.current === pending) savingRef.current = null;
      });
      return pending.then(() => {});
    },
    [],
  );

  const scheduleSave = useCallback(() => {
    if (!enabledRef.current || !workspaceIdRef.current) return;
    setIsDirty(true);
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void performSave();
    }, TABLE_AUTOSAVE_DEBOUNCE_MS);
  }, [performSave]);

  const flushDirtyTables = useCallback(
    (opts: { force?: boolean } = {}) => {
      clearTimer();
      const wsId = workspaceIdRef.current;
      if (!wsId) return;

      const captures = tableDocumentCache.captureDirty();
      if (captures.length === 0) return;

      void performSave(captures, opts.force);
    },
    [performSave],
  );

  const saveNow = useCallback(async () => {
    clearTimer();
    await performSave();
  }, [performSave]);

  // Subscribe to table cache mutations
  useEffect(() => {
    if (!enabled || !workspaceId) return;

    const unsubscribe = tableDocumentCache.subscribeGlobal(() => {
      const dirtyItems = tableDocumentCache.captureDirty();
      if (dirtyItems.length > 0) {
        scheduleSave();
      } else {
        setIsDirty(false);
      }
    });

    return () => {
      unsubscribe();
      clearTimer();
    };
  }, [enabled, workspaceId, scheduleSave]);

  // Best-effort flush on pagehide
  useEffect(() => {
    if (!enabled) return;

    const handlePageHide = () => {
      flushDirtyTables({ force: true });
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [enabled, flushDirtyTables]);

  return {
    isDirty,
    saveNow,
    flushDirtyTables,
  };
}
