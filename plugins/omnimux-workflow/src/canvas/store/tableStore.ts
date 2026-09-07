import { create } from 'zustand';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  type HTableDocument,
  type HTableColumn,
  type HTableRow,
  type HTableFieldType,
  type HTableCellValue,
  type HTableFilterCondition,
  type HTableRowHeight,
  newColumnId,
  newRowId,
  defaultColumnWidth,
  createDefaultTextColumn,
  migrateLegacyTableDocument,
} from '../../shared/types/htable.ts';
import {
  tableDocumentCache,
  createDefaultInitialDocument,
  type TableSession,
} from './tableDocumentCache.ts';

export interface ColumnModalState {
  isOpen: boolean;
  mode: 'add' | 'edit';
  targetColumnIndex: number | null;
  initialTitle: string;
  initialType: HTableFieldType;
}

export type TableCanvasSyncHandler = (tableId: string, doc: HTableDocument) => void;
let globalCanvasSyncHandler: TableCanvasSyncHandler | null = null;

export function registerTableCanvasSyncHandler(handler: TableCanvasSyncHandler): () => void {
  globalCanvasSyncHandler = handler;
  return () => {
    if (globalCanvasSyncHandler === handler) {
      globalCanvasSyncHandler = null;
    }
  };
}

export function syncTableL1ToCanvasStore(tableId: string, doc: HTableDocument): void {
  if (globalCanvasSyncHandler && tableId) {
    globalCanvasSyncHandler(tableId, doc);
  }
}

export interface TableStoreState {
  // Document & Session State
  activeTableId: string | null;
  document: HTableDocument;
  isStageOpen: boolean;

  // Row Selection State
  selectedRowIndices: number[];

  // History Stacks (for active stage)
  undoStack: HTableDocument[];
  redoStack: HTableDocument[];

  // UI Transient States
  activePopover: 'field-config' | 'filter' | 'row-height' | null;
  activeContextMenuColIdx: number | null;
  modalState: ColumnModalState;

  // Stage Control
  openStage: (tableIdOrDoc?: string | HTableDocument, initialDoc?: HTableDocument) => void;
  closeStage: () => void;

  // Row Selection Actions
  toggleRowSelection: (rowIdx: number) => void;
  selectAllRows: () => void;
  clearRowSelection: () => void;
  setRowSelection: (indices: number[]) => void;
  deleteSelectedRows: () => void;

  // History Actions
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Popover & Modal UI Controls
  setActivePopover: (popover: 'field-config' | 'filter' | 'row-height' | null) => void;
  setContextMenuColIdx: (idx: number | null) => void;
  openColumnModal: (mode: 'add' | 'edit', colIdx?: number) => void;
  closeColumnModal: () => void;

  // Document Mutations (with automatic History Snapshot push & L1 sync)
  setTitle: (title: string) => void;
  updateCell: (rowIdx: number, columnIdOrIdx: string | number, val: HTableCellValue) => void;
  addRow: (cells?: Record<string, HTableCellValue> | HTableCellValue[]) => void;
  deleteRow: (rowIdx: number) => void;
  reorderRows: (sourceIdx: number, targetIdx: number) => void;
  addColumn: (title: string, type: HTableFieldType, width?: number) => void;
  updateColumn: (colIdx: number, title: string, type: HTableFieldType) => void;
  renameColumn: (colIdx: number, newTitle: string) => void;
  deleteColumn: (colIdx: number) => void;
  toggleColumnVisibility: (colIdx: number) => void;
  reorderColumns: (sourceIdx: number, targetIdx: number) => void;
  setFilterConditions: (conditions: HTableFilterCondition[]) => void;
  setRowHeight: (height: HTableRowHeight) => void;
  loadDocument: (doc: HTableDocument) => void;
}

const MAX_HISTORY_DEPTH = 50;

function cloneDoc(doc: HTableDocument): HTableDocument {
  return JSON.parse(JSON.stringify(doc));
}

/** 兜底：保证文档至少有一列（0 列时补默认「文本」列），全屏舞台绝不出现空表头 */
function withDefaultTextColumn(doc: HTableDocument): HTableDocument {
  if (doc.columns.length === 0) {
    doc.columns.push(createDefaultTextColumn());
  }
  return doc;
}

export const useTableStore = create<TableStoreState>((set, get) => {
  const pushSnapshot = (currentDoc: HTableDocument) => {
    const { undoStack } = get();
    const newUndo = [...undoStack, cloneDoc(currentDoc)].slice(-MAX_HISTORY_DEPTH);
    return { undoStack: newUndo, redoStack: [] };
  };

  const applyDocMutation = (mutator: (doc: HTableDocument) => HTableDocument) => {
    const { activeTableId, document } = get();
    const history = pushSnapshot(document);
    const updated = mutator(cloneDoc(document));

    if (activeTableId) {
      tableDocumentCache.mutate(activeTableId, () => updated, { trackHistory: false });
      syncTableL1ToCanvasStore(activeTableId, updated);
    }

    set({
      document: updated,
      ...history,
    });
  };

  return {
    activeTableId: null,
    document: createDefaultInitialDocument(),
    isStageOpen: false,
    selectedRowIndices: [],
    undoStack: [],
    redoStack: [],
    activePopover: null,
    activeContextMenuColIdx: null,
    modalState: {
      isOpen: false,
      mode: 'add',
      targetColumnIndex: null,
      initialTitle: '',
      initialType: 'text',
    },

    openStage: (tableIdOrDoc, initialDoc) => {
      let tableId: string | null = null;
      let targetDoc: HTableDocument | null = null;

      if (typeof tableIdOrDoc === 'string') {
        tableId = tableIdOrDoc;
        const cached = tableDocumentCache.getSession(tableId);
        if (cached) {
          targetDoc = cloneDoc(cached.document);
        } else if (initialDoc) {
          targetDoc = cloneDoc(migrateLegacyTableDocument(initialDoc));
        }
      } else if (tableIdOrDoc && typeof tableIdOrDoc === 'object') {
        targetDoc = cloneDoc(migrateLegacyTableDocument(tableIdOrDoc));
      }

      if (!targetDoc) {
        targetDoc = createDefaultInitialDocument();
      }

      // 兜底：打开舞台前保证至少有一列默认「文本」列
      withDefaultTextColumn(targetDoc);

      set({
        activeTableId: tableId,
        document: targetDoc,
        isStageOpen: true,
        selectedRowIndices: [],
        undoStack: [],
        redoStack: [],
        activePopover: null,
      });
    },

    closeStage: () => {
      const { activeTableId, document } = get();
      if (activeTableId) {
        syncTableL1ToCanvasStore(activeTableId, document);
      }
      set({
        isStageOpen: false,
        selectedRowIndices: [],
        activePopover: null,
        activeContextMenuColIdx: null,
      });
    },

    toggleRowSelection: (rowIdx) => {
      const { selectedRowIndices } = get();
      if (selectedRowIndices.includes(rowIdx)) {
        set({ selectedRowIndices: selectedRowIndices.filter((idx) => idx !== rowIdx) });
      } else {
        const newSelection = [...selectedRowIndices, rowIdx].sort((a, b) => a - b);
        set({ selectedRowIndices: newSelection });
      }
    },

    selectAllRows: () => {
      const { document } = get();
      const allIndices = document.rows.map((_, idx) => idx);
      set({ selectedRowIndices: allIndices });
    },

    clearRowSelection: () => set({ selectedRowIndices: [] }),

    setRowSelection: (indices) => {
      const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
      set({ selectedRowIndices: sorted });
    },

    deleteSelectedRows: () => {
      const { selectedRowIndices } = get();
      if (selectedRowIndices.length === 0) return;
      applyDocMutation((doc) => {
        const toDeleteSet = new Set(selectedRowIndices);
        const newRows = doc.rows.filter((_, idx) => !toDeleteSet.has(idx));
        return { ...doc, rows: newRows };
      });
      set({ selectedRowIndices: [] });
    },

    undo: () => {
      const { activeTableId } = get();
      if (activeTableId && tableDocumentCache.canUndo(activeTableId)) {
        tableDocumentCache.undo(activeTableId);
        const session = tableDocumentCache.getSession(activeTableId);
        if (session) {
          set({ document: cloneDoc(session.document), selectedRowIndices: [] });
          syncTableL1ToCanvasStore(activeTableId, session.document);
        }
        return;
      }

      const { undoStack, document, redoStack } = get();
      if (undoStack.length === 0) return;
      const prevDoc = undoStack[undoStack.length - 1];
      if (!prevDoc) return;
      const newUndo = undoStack.slice(0, -1);
      set({
        document: cloneDoc(prevDoc),
        selectedRowIndices: [],
        undoStack: newUndo,
        redoStack: [...redoStack, cloneDoc(document)].slice(-MAX_HISTORY_DEPTH),
      });
    },

    redo: () => {
      const { activeTableId } = get();
      if (activeTableId && tableDocumentCache.canRedo(activeTableId)) {
        tableDocumentCache.redo(activeTableId);
        const session = tableDocumentCache.getSession(activeTableId);
        if (session) {
          set({ document: cloneDoc(session.document), selectedRowIndices: [] });
          syncTableL1ToCanvasStore(activeTableId, session.document);
        }
        return;
      }

      const { redoStack, document, undoStack } = get();
      if (redoStack.length === 0) return;
      const nextDoc = redoStack[redoStack.length - 1];
      if (!nextDoc) return;
      const newRedo = redoStack.slice(0, -1);
      set({
        document: cloneDoc(nextDoc),
        selectedRowIndices: [],
        redoStack: newRedo,
        undoStack: [...undoStack, cloneDoc(document)].slice(-MAX_HISTORY_DEPTH),
      });
    },

    canUndo: () => {
      const { activeTableId, undoStack } = get();
      if (activeTableId) return tableDocumentCache.canUndo(activeTableId);
      return undoStack.length > 0;
    },

    canRedo: () => {
      const { activeTableId, redoStack } = get();
      if (activeTableId) return tableDocumentCache.canRedo(activeTableId);
      return redoStack.length > 0;
    },

    setActivePopover: (popover) => set({ activePopover: popover }),
    setContextMenuColIdx: (idx) => set({ activeContextMenuColIdx: idx }),

    openColumnModal: (mode, colIdx) => {
      const { document } = get();
      if (mode === 'edit' && colIdx !== undefined && document.columns[colIdx]) {
        const col = document.columns[colIdx]!;
        set({
          activePopover: null,
          modalState: {
            isOpen: true,
            mode: 'edit',
            targetColumnIndex: colIdx,
            initialTitle: col.title,
            initialType: col.type,
          },
        });
      } else {
        set({
          activePopover: null,
          modalState: {
            isOpen: true,
            mode: 'add',
            targetColumnIndex: null,
            initialTitle: '',
            initialType: 'text',
          },
        });
      }
    },

    closeColumnModal: () =>
      set((s) => ({ modalState: { ...s.modalState, isOpen: false } })),

    setTitle: (title) => {
      applyDocMutation((doc) => ({ ...doc, title }));
    },

    updateCell: (rowIdx, columnIdOrIdx, val) => {
      applyDocMutation((doc) => {
        const existingRow = doc.rows[rowIdx];
        if (!existingRow) return doc;

        const columnId =
          typeof columnIdOrIdx === 'number'
            ? doc.columns[columnIdOrIdx]?.id
            : columnIdOrIdx;

        if (!columnId) return doc;

        const newRows = [...doc.rows];
        newRows[rowIdx] = {
          ...existingRow,
          cells: { ...existingRow.cells, [columnId]: val },
        };
        return { ...doc, rows: newRows };
      });
    },

    addRow: (cells) => {
      applyDocMutation((doc) => {
        const cellMap: Record<string, HTableCellValue> = {};
        if (cells && typeof cells === 'object' && !Array.isArray(cells)) {
          Object.assign(cellMap, cells);
        } else if (Array.isArray(cells)) {
          cells.forEach((val, idx) => {
            const col = doc.columns[idx];
            if (col) cellMap[col.id] = val;
          });
        }
        return {
          ...doc,
          rows: [...doc.rows, { id: newRowId(), cells: cellMap }],
        };
      });
    },

    deleteRow: (rowIdx) => {
      const { selectedRowIndices } = get();
      applyDocMutation((doc) => {
        if (!doc.rows[rowIdx]) return doc;
        const newRows = doc.rows.filter((_, idx) => idx !== rowIdx);
        return { ...doc, rows: newRows };
      });
      set({
        selectedRowIndices: selectedRowIndices
          .filter((idx) => idx !== rowIdx)
          .map((idx) => (idx > rowIdx ? idx - 1 : idx)),
      });
    },

    reorderRows: (sourceIdx, targetIdx) => {
      const { selectedRowIndices } = get();
      if (sourceIdx === targetIdx) return;
      applyDocMutation((doc) => {
        const rowToMove = doc.rows[sourceIdx];
        if (!rowToMove) return doc;
        const newRows = [...doc.rows];
        const [moved] = newRows.splice(sourceIdx, 1);
        if (moved) newRows.splice(targetIdx, 0, moved);
        return { ...doc, rows: newRows };
      });

      const newSelection = selectedRowIndices
        .map((idx) => {
          if (idx === sourceIdx) return targetIdx;
          if (sourceIdx < targetIdx && idx > sourceIdx && idx <= targetIdx) return idx - 1;
          if (sourceIdx > targetIdx && idx >= targetIdx && idx < sourceIdx) return idx + 1;
          return idx;
        })
        .sort((a, b) => a - b);
      set({ selectedRowIndices: newSelection });
    },

    addColumn: (title, type, width) => {
      applyDocMutation((doc) => {
        const newCol: HTableColumn = {
          id: newColumnId(),
          title: title.trim() || 'Untitled',
          type,
          visible: true,
          width: width ?? defaultColumnWidth(type),
        };
        return { ...doc, columns: [...doc.columns, newCol] };
      });
    },

    updateColumn: (colIdx, title, type) => {
      applyDocMutation((doc) => {
        const targetCol = doc.columns[colIdx];
        if (!targetCol) return doc;
        const newCols = [...doc.columns];
        newCols[colIdx] = {
          ...targetCol,
          title: title.trim() || targetCol.title,
          type,
        };
        return { ...doc, columns: newCols };
      });
    },

    renameColumn: (colIdx, newTitle) => {
      const trimmed = newTitle.trim();
      if (!trimmed) return;
      applyDocMutation((doc) => {
        const targetCol = doc.columns[colIdx];
        if (!targetCol || targetCol.title === trimmed) return doc;
        const newCols = [...doc.columns];
        newCols[colIdx] = { ...targetCol, title: trimmed };
        return { ...doc, columns: newCols };
      });
    },

    deleteColumn: (colIdx) => {
      applyDocMutation((doc) => {
        if (!doc.columns[colIdx]) return doc;
        const newCols = doc.columns.filter((_, idx) => idx !== colIdx);
        return { ...doc, columns: newCols };
      });
    },

    toggleColumnVisibility: (colIdx) => {
      applyDocMutation((doc) => {
        const targetCol = doc.columns[colIdx];
        if (!targetCol) return doc;
        const newCols = [...doc.columns];
        newCols[colIdx] = { ...targetCol, visible: !targetCol.visible };
        return { ...doc, columns: newCols };
      });
    },

    reorderColumns: (sourceIdx, targetIdx) => {
      if (sourceIdx === targetIdx) return;
      applyDocMutation((doc) => {
        const colToMove = doc.columns[sourceIdx];
        if (!colToMove) return doc;
        const newCols = [...doc.columns];
        const [movedCol] = newCols.splice(sourceIdx, 1);
        if (movedCol) newCols.splice(targetIdx, 0, movedCol);
        return { ...doc, columns: newCols };
      });
    },

    setFilterConditions: (conditions) => {
      applyDocMutation((doc) => ({
        ...doc,
        filter: { match: doc.filter?.match || 'all', conditions },
      }));
    },

    setRowHeight: (height) => {
      applyDocMutation((doc) => ({ ...doc, rowHeight: height }));
    },

    loadDocument: (doc) => {
      const normalized = migrateLegacyTableDocument(doc);
      const { activeTableId } = get();
      if (activeTableId) {
        tableDocumentCache.mutate(activeTableId, () => normalized);
        syncTableL1ToCanvasStore(activeTableId, normalized);
      }
      set({
        document: cloneDoc(normalized),
        selectedRowIndices: [],
        undoStack: [],
        redoStack: [],
      });
    },
  };
});

/**
 * React hook for a specific tableId session (for TableNode card rendering & editing).
 */
export function useTableSession(tableId: string, initialDoc?: Partial<HTableDocument>) {
  const fallbackTitle =
    initialDoc && typeof (initialDoc as any).title === 'string'
      ? (initialDoc as any).title
      : '未命名表格';

  const [session, setSession] = useState<TableSession>(() => {
    return (
      tableDocumentCache.getSession(tableId) || {
        tableId,
        tablePath: `.omnimux/tables/${tableId}.htable`,
        // 兜底：initialDoc 缺少 columns 时保证 session 默认拥有「文本」列
        document: initialDoc
          ? withDefaultTextColumn(migrateLegacyTableDocument(initialDoc))
          : createDefaultInitialDocument(fallbackTitle),
        loadState: 'idle',
        contentRev: typeof initialDoc?.contentRev === 'number' ? initialDoc.contentRev : 0,
        dirty: false,
        saving: false,
        undoStack: [],
        redoStack: [],
        updatedAt: Date.now(),
      }
    );
  });

  useEffect(() => {
    const unsub = tableDocumentCache.subscribe(tableId, () => {
      const current = tableDocumentCache.getSession(tableId);
      if (current) {
        setSession({ ...current });
      }
    });
    return unsub;
  }, [tableId]);

  const mutate = useCallback(
    (recipe: (doc: HTableDocument) => HTableDocument) => {
      const updated = tableDocumentCache.mutate(tableId, recipe);
      if (updated) {
        syncTableL1ToCanvasStore(tableId, updated);
      }
      return updated;
    },
    [tableId],
  );

  const addRow = useCallback(
    (cells?: Record<string, HTableCellValue> | HTableCellValue[]) => {
      return mutate((doc) => {
        const cellMap: Record<string, HTableCellValue> = {};
        if (cells && typeof cells === 'object' && !Array.isArray(cells)) {
          Object.assign(cellMap, cells);
        } else if (Array.isArray(cells)) {
          cells.forEach((val, idx) => {
            const col = doc.columns[idx];
            if (col) cellMap[col.id] = val;
          });
        }
        return {
          ...doc,
          rows: [...doc.rows, { id: newRowId(), cells: cellMap }],
        };
      });
    },
    [mutate],
  );

  return {
    document: session.document,
    loadState: session.loadState,
    dirty: session.dirty,
    saving: session.saving,
    mutate,
    addRow,
    undo: useCallback(() => tableDocumentCache.undo(tableId), [tableId]),
    redo: useCallback(() => tableDocumentCache.redo(tableId), [tableId]),
    canUndo: useCallback(() => tableDocumentCache.canUndo(tableId), [tableId]),
    canRedo: useCallback(() => tableDocumentCache.canRedo(tableId), [tableId]),
  };
}
