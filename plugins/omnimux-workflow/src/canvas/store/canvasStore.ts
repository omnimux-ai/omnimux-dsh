/**
 * Ported (narrowed) from Gxgen `apps/web/src/store/canvasStore.ts`
 * (validated by the extraction spike).
 *
 * The Graph slice is line-for-line isomorphic with Gxgen — including the
 * detail that edge removals route through the mutation gateway. The UI
 * slice is minimal (selection). Timeline/Overlay/Playback slices are cut
 * (timeline domain, V1 out of scope).
 *
 * M2 adds the History slice: snapshot-based undo/redo ported from Gxgen
 * `useCanvasHistory` (nodes/edges only — tracks/textOverlays are cut).
 * The snapshot stacks live in the store (not a hook) so the keyboard
 * shortcuts, the context menu, and the toolbar all share one history.
 */

import { create } from 'zustand';
import { useGenerationPreferencesStore } from './generationPreferencesStore';
import { useShallow } from 'zustand/react/shallow';
import {
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type NodeChange,
  type EdgeChange,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import {
  planCanvasInputMutation,
  dispatchSuccessfulConnectionEvents,
  type CanvasInputMutation,
  type CanvasInputMutationPlan,
  type CanvasNode,
} from '../editor/utils/canvasInputMutationGateway';
import type { CapabilityCatalog } from '../../shared/api';
import {
  readGraphCatalogFingerprint,
  reconcileCanvasForCatalog,
} from '../../shared/graph/catalogReconcile.ts';
import {
  clearPersistSessionFlags,
  noteGraphReset,
  noteUserDeletedGraphElements,
} from '../bridge/persistPolicy';
import {
  DEFAULT_GROUP_COLOR,
  planGroupNodes,
  planUngroupNode,
  planToggleGroupCollapse,
} from '../editor/utils/nodeVisualMath';

export type SelectedElementType = 'none' | 'node';

// ============================================================================
// History (ported from Gxgen useCanvasHistory, narrowed to nodes/edges)
// ============================================================================

/** Max undo steps kept (same as Gxgen). */
const MAX_HISTORY_SIZE = 50;
/** Coalescing window: rapid changes (e.g. node drags) share one snapshot. */
const HISTORY_DEBOUNCE_MS = 300;

interface HistorySnapshot {
  nodes: CanvasNode[];
  edges: Edge[];
  /** Serialized signature cache — equality checks avoid re-stringify. */
  sig: string;
}

function snapshotOf(nodes: CanvasNode[], edges: Edge[]): HistorySnapshot {
  // Deep clone via JSON so history entries are detached from live state.
  const sig = JSON.stringify({ nodes, edges });
  const clone = JSON.parse(sig) as { nodes: CanvasNode[]; edges: Edge[] };
  return { nodes: clone.nodes, edges: clone.edges, sig };
}

/** Module-private history bookkeeping (single canvasStore instance). */
const history = {
  current: null as HistorySnapshot | null,
  lastPushAt: 0,
};

export interface CanvasState {
  // ===== Graph Slice =====
  nodes: CanvasNode[];
  edges: Edge[];
  onNodesChange: OnNodesChange<CanvasNode>;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  applyCanvasInputMutation: (mutation: CanvasInputMutation) => CanvasInputMutationPlan;
  /** Catalog v1.1 runtime DTO (boot-synced; runtime-only, never persisted). */
  catalogRuntime: CapabilityCatalog | null;
  setCatalogRuntime: (catalog: CapabilityCatalog | null) => void;
  setNodes: (nodes: CanvasNode[] | ((nodes: CanvasNode[]) => CanvasNode[])) => void;
  setEdges: (edges: Edge[] | ((edges: Edge[]) => Edge[])) => void;
  removeEdge: (edgeId: string) => void;
  deleteElements: (nodeIds: string[], edgeIds: string[]) => void;
  /** Group given nodes into a new group container node. */
  groupNodes: (nodeIds: string[], title?: string, color?: string) => string | null;
  /** Ungroup container and restore child nodes to absolute canvas space. */
  ungroup: (groupId: string) => void;
  /** Toggle group collapse/expand state. */
  toggleGroupCollapse: (groupId: string) => void;
  /** Resize or reposition a group node. */
  resizeGroup: (groupId: string, bounds: { x: number; y: number; width: number; height: number }) => void;
  /** Replace the whole graph (workspace load). */
  hydrateGraph: (nodes: CanvasNode[], edges: Edge[]) => void;

  // ===== History Slice（M2，Gxgen useCanvasHistory 移植）=====
  /** Undo stack (past states, oldest first). */
  past: HistorySnapshot[];
  /** Redo stack (undone states, oldest first). */
  future: HistorySnapshot[];
  /** Record the current graph as a potential undo target (debounced). */
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  /** Drop all history and reseed from the current graph. */
  clearHistory: () => void;

  // ===== UI Slice（最小）=====
  selectedElement: { type: SelectedElementType; id: string | null };
  setSelectedElement: (type: SelectedElementType, id: string | null) => void;

  // ===== Store Reset =====
  resetStore: () => void;
}

export const useCanvasStore = create<CanvasState>()(
  (set, get) => ({
    // ========================================================================
    // Graph Slice（与 Gxgen 同构）
    // ========================================================================
    nodes: [] as CanvasNode[],
    edges: [] as Edge[],

    onNodesChange: (changes: NodeChange<CanvasNode>[]) => {
      if (changes.some((change) => change.type === 'remove')) {
        // xyflow / 键盘删除走 remove change，视为用户删节点
        noteUserDeletedGraphElements();
      }
      set({
        nodes: applyNodeChanges(changes, get().nodes),
      });
    },

    onEdgesChange: (changes: EdgeChange[]) => {
      const removedEdgeIds = changes
        .filter((change): change is EdgeChange & { type: 'remove' } => change.type === 'remove')
        .map((change) => change.id);
      if (removedEdgeIds.length > 0) {
        get().applyCanvasInputMutation({ removeEdgeIds: removedEdgeIds });
      }
      const nonRemovalChanges = changes.filter((change) => change.type !== 'remove');
      if (nonRemovalChanges.length > 0) {
        set({ edges: applyEdgeChanges(nonRemovalChanges, get().edges) });
      }
    },

    onConnect: (connection: Connection) => {
      get().applyCanvasInputMutation({ addEdges: [connection] });
    },

    applyCanvasInputMutation: (mutation: CanvasInputMutation) => {
      if (mutation.removeNodeIds && mutation.removeNodeIds.length > 0) {
        noteUserDeletedGraphElements();
      }
      const current = get();
      const plan = planCanvasInputMutation(
        { nodes: current.nodes, edges: current.edges },
        mutation,
        // Issue #466: catalog-aware compat pass — edge + slot binding +
        // model/operation auto-adaptation commit as ONE store set.
        { catalog: current.catalogRuntime, preferredModels: useGenerationPreferencesStore.getState().lastModelByType },
      );
      if (plan.status !== 'allowed') return plan;
      set({ nodes: plan.nodes, edges: plan.edges });
      const addedEdges = plan.edges.filter((edge) => (
        !current.edges.some((existing) => existing.id === edge.id)
      ));
      dispatchSuccessfulConnectionEvents(addedEdges);
      return plan;
    },

    catalogRuntime: null as CapabilityCatalog | null,

    setCatalogRuntime: (catalog: CapabilityCatalog | null) => {
      const current = get();
      const previousFingerprint =
        (typeof current.catalogRuntime?.fingerprint === 'string'
          ? current.catalogRuntime.fingerprint
          : '')
        || readGraphCatalogFingerprint(current.nodes);
      const nextFingerprint =
        typeof catalog?.fingerprint === 'string' ? catalog.fingerprint : '';

      // Always store the runtime catalog first so subsequent mutations see it.
      if (
        previousFingerprint === nextFingerprint
        && current.catalogRuntime === catalog
      ) {
        // Identical reference + fingerprint: pure no-op (oscillation guard).
        return;
      }

      // Soft reconcile generate nodes when the fingerprint changes. Historical
      // zero-candidate graphs keep their edges and only flip configuration_error.
      if (previousFingerprint !== nextFingerprint && current.nodes.length > 0) {
        const reconciled = reconcileCanvasForCatalog({
          nodes: current.nodes,
          edges: current.edges,
          catalog,
          previousFingerprint,
          preferredModels: useGenerationPreferencesStore.getState().lastModelByType,
        });
        if (reconciled.changed) {
          set({
            catalogRuntime: catalog,
            nodes: reconciled.nodes,
            edges: reconciled.edges,
          });
          return;
        }
      }
      set({ catalogRuntime: catalog });
    },

    setNodes: (nodesOrUpdater) => {
      set((state) => ({
        nodes: typeof nodesOrUpdater === 'function'
          ? nodesOrUpdater(state.nodes)
          : nodesOrUpdater,
      }));
    },

    setEdges: (edgesOrUpdater) => {
      set((state) => ({
        edges: typeof edgesOrUpdater === 'function'
          ? edgesOrUpdater(state.edges)
          : edgesOrUpdater,
      }));
    },

    removeEdge: (edgeId) => {
      get().applyCanvasInputMutation({ removeEdgeIds: [edgeId] });
    },

    deleteElements: (nodeIds, edgeIds) => {
      if (nodeIds.length > 0) noteUserDeletedGraphElements();
      get().applyCanvasInputMutation({ removeNodeIds: nodeIds, removeEdgeIds: edgeIds });
      const selected = get().selectedElement;
      if (selected.type === 'node' && selected.id && nodeIds.includes(selected.id)) {
        set({ selectedElement: { type: 'none', id: null } });
      }
    },

    groupNodes: (nodeIds, title = '新建组', color = DEFAULT_GROUP_COLOR) => {
      const plan = planGroupNodes(get().nodes, nodeIds, title, color);
      if (!plan) return null;

      set({
        nodes: plan.nodes,
        selectedElement: { type: 'node', id: plan.groupId },
      });

      return plan.groupId;
    },

    ungroup: (groupId) => {
      const updatedNodes = planUngroupNode(get().nodes, groupId);
      if (!updatedNodes) return;

      set({
        nodes: updatedNodes,
        selectedElement: { type: 'none', id: null },
      });
    },

    toggleGroupCollapse: (groupId) => {
      const updatedNodes = planToggleGroupCollapse(get().nodes, groupId);
      if (!updatedNodes) return;

      set({ nodes: updatedNodes });
    },

    resizeGroup: (groupId, bounds) => {
      const currentNodes = get().nodes;
      const groupNode = currentNodes.find((n) => n.id === groupId && n.type === 'group');
      if (!groupNode) return;

      const dx = bounds.x - groupNode.position.x;
      const dy = bounds.y - groupNode.position.y;

      const updatedNodes = currentNodes.map((node) => {
        if (node.id === groupId) {
          return {
            ...node,
            position: { x: bounds.x, y: bounds.y },
            width: bounds.width,
            height: bounds.height,
            style: {
              ...node.style,
              width: bounds.width,
              height: bounds.height,
            },
          };
        }
        // If group position shifted (e.g. from NW resize), adjust children relative positions
        if (node.parentId === groupId && (dx !== 0 || dy !== 0)) {
          return {
            ...node,
            position: {
              x: node.position.x - dx,
              y: node.position.y - dy,
            },
          };
        }
        return node;
      });

      set({ nodes: updatedNodes });
    },

    hydrateGraph: (nodes, edges) => {
      clearPersistSessionFlags();
      const catalog = get().catalogRuntime;
      // Catalog-first boot has already stored its fingerprint while the graph
      // was empty. Reconcile the newly loaded nodes regardless of that prior
      // runtime fingerprint so picker state and submitted params stay aligned.
      const reconciled = catalog
        ? reconcileCanvasForCatalog({
            nodes,
            edges,
            catalog,
            previousFingerprint: '',
            preferredModels: useGenerationPreferencesStore.getState().lastModelByType,
          })
        : null;
      const nextNodes = reconciled?.nodes ?? nodes;
      const nextEdges = reconciled?.edges ?? edges;
      set({
        nodes: nextNodes,
        edges: nextEdges,
        selectedElement: { type: 'none', id: null },
        past: [],
        future: [],
      });
      history.current = snapshotOf(nextNodes, nextEdges);
      history.lastPushAt = 0;
    },

    // ========================================================================
    // History Slice（M2）
    // ========================================================================
    past: [] as HistorySnapshot[],
    future: [] as HistorySnapshot[],

    pushHistory: () => {
      const snap = snapshotOf(get().nodes, get().edges);
      // No-op when nothing changed (also absorbs the re-render that undo
      // itself triggers: history.current was already moved to the restored
      // state before set(), so the signatures match and we return early).
      if (history.current && history.current.sig === snap.sig) return;

      const now = Date.now();
      if (
        history.current
        && now - history.lastPushAt >= HISTORY_DEBOUNCE_MS
      ) {
        const previous = history.current;
        set((state) => ({
          past: [...state.past, previous].slice(-MAX_HISTORY_SIZE),
          future: [],
        }));
        history.lastPushAt = now;
      }
      // Within the debounce window we only move the "current" pointer —
      // rapid changes (node drags, typing) coalesce into one undo step.
      history.current = snap;
    },

    undo: () => {
      const { past, nodes, edges } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      if (!previous) return;
      const current = snapshotOf(nodes, edges);
      history.current = previous;
      set((state) => ({
        nodes: previous.nodes,
        edges: previous.edges,
        past: past.slice(0, -1),
        future: [...state.future, current],
      }));
    },

    redo: () => {
      const { future, nodes, edges } = get();
      if (future.length === 0) return;
      const next = future[future.length - 1];
      if (!next) return;
      const current = snapshotOf(nodes, edges);
      history.current = next;
      set((state) => ({
        nodes: next.nodes,
        edges: next.edges,
        past: [...state.past, current],
        future: future.slice(0, -1),
      }));
    },

    clearHistory: () => {
      const { nodes, edges } = get();
      set({ past: [], future: [] });
      history.current = snapshotOf(nodes, edges);
      history.lastPushAt = 0;
    },

    // ========================================================================
    // UI Slice（最小）
    // ========================================================================
    selectedElement: { type: 'none' as SelectedElementType, id: null as string | null },

    setSelectedElement: (type: SelectedElementType, id: string | null) => {
      set({ selectedElement: { type, id } });
    },

    // ========================================================================
    // Store Reset
    // ========================================================================
    resetStore: () => {
      noteGraphReset();
      set({
        nodes: [],
        edges: [],
        selectedElement: { type: 'none', id: null },
        past: [],
        future: [],
        catalogRuntime: null,
      });
      history.current = null;
      history.lastPushAt = 0;
    },
  }),
);

// ============================================================================
// Convenience Hooks（保留 Gxgen 的 selector 组织方式）
// ============================================================================

export const useGraphStore = () =>
  useCanvasStore(
    useShallow((state) => ({
      nodes: state.nodes,
      edges: state.edges,
      setNodes: state.setNodes,
      setEdges: state.setEdges,
      onNodesChange: state.onNodesChange,
      onEdgesChange: state.onEdgesChange,
      onConnect: state.onConnect,
    })),
  );

export const useSelection = () =>
  useCanvasStore(
    useShallow((state) => ({
      selectedElement: state.selectedElement,
      setSelectedElement: state.setSelectedElement,
    })),
  );

export const useCanUndo = () => useCanvasStore((state) => state.past.length > 0);

export const useCanRedo = () => useCanvasStore((state) => state.future.length > 0);

/** 是否处于多选模式（选中的常规非组节点数 >= 2） */
export const useIsMultiSelected = () =>
  useCanvasStore((state) => state.nodes.filter((n) => n.selected && n.type !== 'group').length >= 2);

/** 当前选中的常规非组节点数量 */
export const useSelectedNodeCount = () =>
  useCanvasStore((state) => state.nodes.filter((n) => n.selected && n.type !== 'group').length);

