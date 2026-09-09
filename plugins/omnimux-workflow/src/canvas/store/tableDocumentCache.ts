/**
 * Multi-table document cache & session management.
 *
 * Provides isolated memory state per tableId, separating tabular documents (L2)
 * from the React Flow canvas graph (L1).
 */

import type { HTableDocument } from '../../shared/types/htable.ts';
import {
  createDefaultTextColumn,
  migrateLegacyTableDocument,
} from '../../shared/types/htable.ts';
import { getWorkspaceTable } from '../bridge/apiClient.ts';

export type TableLoadState = 'idle' | 'loading' | 'ready' | 'missing' | 'corrupted' | 'error';

export interface TableSession {
  tableId: string;
  tablePath: string;
  document: HTableDocument;
  loadState: TableLoadState;
  contentRev: number;
  dirty: boolean;
  saving: boolean;
  lastError?: string;
  undoStack: HTableDocument[];
  redoStack: HTableDocument[];
  updatedAt: number;
}

export interface DirtyTableCapture {
  tableId: string;
  tablePath: string;
  document: HTableDocument;
  expectedRev: number;
}

const MAX_HISTORY_DEPTH = 50;

function cloneDoc(doc: HTableDocument): HTableDocument {
  return JSON.parse(JSON.stringify(doc));
}

export function createDefaultInitialDocument(title: string = '未命名表格'): HTableDocument {
  return {
    version: 1,
    contentRev: 0,
    title,
    rowHeight: 'low',
    columns: [
      { id: 'col_text', title: '文本', type: 'text', visible: true, width: 280 },
    ],
    rows: [],
  };
}

class TableDocumentCache {
  private sessions = new Map<string, TableSession>();
  private listeners = new Map<string, Set<() => void>>();
  private globalListeners = new Set<() => void>();

  /**
   * Subscribe to changes for a specific tableId session.
   */
  subscribe(tableId: string, listener: () => void): () => void {
    if (!this.listeners.has(tableId)) {
      this.listeners.set(tableId, new Set());
    }
    const set = this.listeners.get(tableId)!;
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(tableId);
      }
    };
  }

  /**
   * Subscribe to global changes across any table session.
   */
  subscribeGlobal(listener: () => void): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  private notify(tableId: string): void {
    const tableListeners = this.listeners.get(tableId);
    if (tableListeners) {
      for (const listener of tableListeners) {
        try {
          listener();
        } catch (err) {
          console.error('[tableDocumentCache] listener error:', err);
        }
      }
    }
    for (const listener of this.globalListeners) {
      try {
        listener();
      } catch (err) {
        console.error('[tableDocumentCache] global listener error:', err);
      }
    }
  }

  /**
   * Get an existing session (or undefined if not loaded yet).
   */
  getSession(tableId: string): TableSession | undefined {
    return this.sessions.get(tableId);
  }

  /**
   * Ensure a session exists in cache, loading from server if necessary.
   */
  async ensure(
    workspaceId: string,
    tableId: string,
    opts: {
      initialDoc?: Partial<HTableDocument>;
      forceReload?: boolean;
    } = {},
  ): Promise<TableSession> {
    const existing = this.sessions.get(tableId);
    if (existing && !opts.forceReload) {
      if (existing.loadState === 'ready' || existing.loadState === 'loading') {
        return existing;
      }
    }

    const initialTitle = opts.initialDoc?.title || '未命名表格';
    const fallbackDoc = opts.initialDoc
      ? migrateLegacyTableDocument(opts.initialDoc)
      : createDefaultInitialDocument(initialTitle);

    // 兜底：initialDoc 缺少 columns（或空表）时保证 session 至少拥有一列默认「文本」列，
    // 不允许以 0 列文档初始化会话
    if (fallbackDoc.columns.length === 0) {
      fallbackDoc.columns.push(createDefaultTextColumn());
    }

    const session: TableSession = existing || {
      tableId,
      tablePath: `.omnimux/tables/${tableId}.htable`,
      document: fallbackDoc,
      loadState: 'loading',
      contentRev: typeof opts.initialDoc?.contentRev === 'number' ? opts.initialDoc.contentRev : 0,
      dirty: false,
      saving: false,
      undoStack: [],
      redoStack: [],
      updatedAt: Date.now(),
    };

    session.loadState = 'loading';
    this.sessions.set(tableId, session);
    this.notify(tableId);

    if (!workspaceId) {
      session.loadState = 'ready';
      this.notify(tableId);
      return session;
    }

    try {
      const res = await getWorkspaceTable(workspaceId, tableId);
      if (res.ok && res.body.table) {
        session.document = res.body.table.document;
        session.tablePath = res.body.table.tablePath || session.tablePath;
        session.contentRev = res.body.table.contentRev;
        session.loadState = 'ready';
        session.dirty = false;
        session.lastError = undefined;
      } else if (res.status === 404) {
        // Table file does not exist yet on disk.
        // If initialDoc had rows or was marked ready, mark missing; else mark ready as clean initial state.
        if (opts.initialDoc && opts.initialDoc.rows && opts.initialDoc.rows.length > 0) {
          session.loadState = 'missing';
        } else {
          session.loadState = 'ready';
          session.document = fallbackDoc;
          session.contentRev = 0;
          session.dirty = false;
        }
      } else {
        session.loadState = 'error';
        session.lastError = res.body.message || res.body.error || 'Failed to load table';
      }
    } catch (err: any) {
      session.loadState = 'error';
      session.lastError = err.message || 'Network error';
    }

    this.notify(tableId);
    return session;
  }

  /**
   * Mutate table document with undo/redo snapshot push.
   */
  mutate(
    tableId: string,
    recipe: (doc: HTableDocument) => HTableDocument,
    opts: { trackHistory?: boolean } = { trackHistory: true },
  ): HTableDocument | null {
    let session = this.sessions.get(tableId);
    if (!session) {
      session = {
        tableId,
        tablePath: `.omnimux/tables/${tableId}.htable`,
        document: createDefaultInitialDocument(),
        loadState: 'ready',
        contentRev: 0,
        dirty: false,
        saving: false,
        undoStack: [],
        redoStack: [],
        updatedAt: Date.now(),
      };
      this.sessions.set(tableId, session);
    }

    const currentDoc = session.document;
    if (opts.trackHistory !== false) {
      session.undoStack = [...session.undoStack, cloneDoc(currentDoc)].slice(-MAX_HISTORY_DEPTH);
      session.redoStack = [];
    }

    const updated = recipe(cloneDoc(currentDoc));
    session.document = updated;
    session.dirty = true;
    session.updatedAt = Date.now();

    this.notify(tableId);
    return updated;
  }

  /**
   * Perform undo on a table session.
   */
  undo(tableId: string): boolean {
    const session = this.sessions.get(tableId);
    if (!session || session.undoStack.length === 0) return false;

    const previous = session.undoStack[session.undoStack.length - 1];
    session.undoStack = session.undoStack.slice(0, -1);
    session.redoStack = [...session.redoStack, cloneDoc(session.document)].slice(-MAX_HISTORY_DEPTH);

    session.document = previous!;
    session.dirty = true;
    session.updatedAt = Date.now();

    this.notify(tableId);
    return true;
  }

  /**
   * Perform redo on a table session.
   */
  redo(tableId: string): boolean {
    const session = this.sessions.get(tableId);
    if (!session || session.redoStack.length === 0) return false;

    const next = session.redoStack[session.redoStack.length - 1];
    session.redoStack = session.redoStack.slice(0, -1);
    session.undoStack = [...session.undoStack, cloneDoc(session.document)].slice(-MAX_HISTORY_DEPTH);

    session.document = next!;
    session.dirty = true;
    session.updatedAt = Date.now();

    this.notify(tableId);
    return true;
  }

  canUndo(tableId: string): boolean {
    const session = this.sessions.get(tableId);
    return Boolean(session && session.undoStack.length > 0);
  }

  canRedo(tableId: string): boolean {
    const session = this.sessions.get(tableId);
    return Boolean(session && session.redoStack.length > 0);
  }

  /**
   * Capture all dirty table sessions (for sync flush / debounce PUT).
   */
  captureDirty(): DirtyTableCapture[] {
    const captures: DirtyTableCapture[] = [];
    for (const [tableId, session] of this.sessions.entries()) {
      if (session.dirty && session.loadState === 'ready') {
        captures.push({
          tableId,
          tablePath: session.tablePath,
          document: cloneDoc(session.document),
          expectedRev: session.contentRev,
        });
      }
    }
    return captures;
  }

  /**
   * Mark a table as successfully saved to server.
   */
  markSaved(tableId: string, newContentRev: number, savedDoc: HTableDocument): void {
    const session = this.sessions.get(tableId);
    if (!session) return;

    session.contentRev = newContentRev;
    session.saving = false;
    session.lastError = undefined;

    // If local document matches savedDoc signature, mark clean
    const localDocument = session.document;
    const localDocSignature = JSON.stringify(localDocument);
    if (localDocSignature === JSON.stringify(savedDoc)) {
      session.dirty = false;
    }
    this.notify(tableId);
  }

  /**
   * Mark save error on a table session.
   */
  markSaveError(tableId: string, error: string): void {
    const session = this.sessions.get(tableId);
    if (!session) return;
    session.saving = false;
    session.lastError = error;
    this.notify(tableId);
  }

  /**
   * Set saving flag.
   */
  setSaving(tableId: string, saving: boolean): void {
    const session = this.sessions.get(tableId);
    if (!session) return;
    session.saving = saving;
    this.notify(tableId);
  }

  /**
   * Reset all sessions (e.g. on workspace switch or unmount).
   */
  resetAll(): void {
    this.sessions.clear();
    this.listeners.clear();
    for (const listener of this.globalListeners) {
      try {
        listener();
      } catch (err) {
        console.error('[tableDocumentCache] global listener error on resetAll:', err);
      }
    }
  }
}

import { registerTableDocumentResolver } from '../../shared/graph/tableTextSerializer.ts';

export const tableDocumentCache = new TableDocumentCache();
registerTableDocumentResolver((tableId) => tableDocumentCache.getSession(tableId)?.document);
