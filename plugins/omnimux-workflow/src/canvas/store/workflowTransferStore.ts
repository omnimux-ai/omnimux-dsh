/**
 * 画布工作流文件「导入 / 导出」的唯一状态所有者（Issue 3669）。
 *
 * 这套状态原先长在 `Toolbar` 里，只服务工具栏两个按钮。入口改成 ComfyUI 工作流入口后，
 * 「添加节点」面板也要能触发导入、看到最近导入并复现某一条，于是把它提到 store：
 * 工具栏按钮、预览面板、面板入口共用同一份状态与同一套动作，避免第二份实现。
 *
 * 语义与原先逐条一致：解析顺序（ComfyUI → OmniMux 自有文件 → 明确错误）、应用前必须
 * 由用户确认（`hydrateGraph` 会替换整张画布并重置历史）、失败一律带 codec 错误码。
 * 新增的只有「最近导入」缓存，且**只在成功应用之后**写入。
 */

import { create } from 'zustand';
import type { Edge } from '@xyflow/react';
import type { CanvasNode } from '../../shared/graph/canvasInputMutationGateway.ts';
import {
  buildOmnimuxWorkflowFile,
  parseComfyWorkflow,
  parseOmnimuxWorkflowFile,
  projectComfyToCanvas,
  serializeOmnimuxWorkflowFile,
  type ComfyCanvasProjection,
  type OmnimuxWorkflowFile,
} from '../../shared/comfyui/index.ts';
import {
  readComfyRecents,
  upsertComfyRecent,
  writeComfyRecents,
  type ComfyRecentEntry,
} from '../editor/utils/comfyRecents';
import { useCanvasStore } from './canvasStore';

export type TransferState =
  | { kind: 'error'; code: string; path: string; message: string }
  | { kind: 'exported'; fileName: string; nodeCount: number; droppedCount: number }
  | { kind: 'own'; file: OmnimuxWorkflowFile; applied: boolean }
  | { kind: 'comfy'; fileName: string; format: string; projection: ComfyCanvasProjection; applied: boolean };

/** 待写入「最近导入」的一条：只有真的应用过才落缓存。 */
interface PendingComfyImport {
  name: string;
  format: string;
  nodeCount: number;
  text: string;
}

export interface WorkflowTransferState {
  transfer: TransferState | null;
  recents: ComfyRecentEntry[];
  /** 递增即请求持有 `<input type="file">` 的组件弹出选择器（跨组件唯一入口）。 */
  importNonce: number;
  pendingComfy: PendingComfyImport | null;
  exportWorkflow: (workflowName: string) => void;
  importText: (text: string, fileName: string) => void;
  /** 读取文件本身失败（权限、IO）等不在 codec 错误码里的失败，如实上报。 */
  failImport: (code: string, message: string) => void;
  requestImport: () => void;
  applyComfy: () => void;
  applyOwn: () => void;
  dismiss: () => void;
  applyRecent: (name: string) => void;
}

function transferError(code: string, path: string, message: string): TransferState {
  return { kind: 'error', code, path, message };
}

function describeThrown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** ASCII-safe file name for the downloaded workflow. */
function workflowFileName(name: string): string {
  const base = name
    .trim()
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${base.length > 0 ? base : 'workflow'}.json`;
}

/** Local download via an object URL; no network request is made. */
function downloadTextFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** `my-flow.json` → `my-flow`；没有可用名字时退回 `ComfyUI 工作流`。 */
function recentName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '').trim();
  return base.length > 0 ? base : 'ComfyUI 工作流';
}

/** Replace the canvas graph with an imported workflow (history reseeded). */
function applyGraph(nodes: CanvasNode[], edges: Edge[]): void {
  useCanvasStore.getState().hydrateGraph(nodes, edges);
}

function comfyNodes(projection: ComfyCanvasProjection): CanvasNode[] {
  return projection.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
    ...(node.width !== undefined ? { width: node.width } : {}),
    ...(node.height !== undefined ? { height: node.height } : {}),
  }));
}

function comfyEdges(projection: ComfyCanvasProjection): Edge[] {
  return projection.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  }));
}

export const useWorkflowTransferStore = create<WorkflowTransferState>()((set, get) => ({
  transfer: null,
  recents: readComfyRecents(),
  importNonce: 0,
  pendingComfy: null,

  exportWorkflow: (workflowName) => {
    const { nodes, edges } = useCanvasStore.getState();
    try {
      const built = buildOmnimuxWorkflowFile({ name: workflowName, nodes, edges });
      const fileName = workflowFileName(workflowName);
      downloadTextFile(fileName, serializeOmnimuxWorkflowFile(built.file));
      set({
        transfer: {
          kind: 'exported',
          fileName,
          nodeCount: built.file.nodes.length,
          droppedCount: built.dropped.length,
        },
      });
    } catch (error) {
      set({ transfer: transferError('export-failed', '', describeThrown(error)) });
    }
  },

  importText: (text, fileName) => {
    const comfy = parseComfyWorkflow(text);
    if (comfy.ok) {
      const projection = projectComfyToCanvas(comfy.document);
      set({
        transfer: { kind: 'comfy', fileName, format: comfy.format, projection, applied: false },
        pendingComfy: {
          name: recentName(fileName),
          format: comfy.format,
          nodeCount: projection.nodes.length,
          text,
        },
      });
      return;
    }

    const own = parseOmnimuxWorkflowFile(text);
    if (own.ok) {
      set({ transfer: { kind: 'own', file: own.file, applied: false }, pendingComfy: null });
      return;
    }

    // Prefer the parser that got further: a file that declared the OmniMux
    // kind is reported by the workflow-file parser, a file that looked like a
    // ComfyUI document is reported by the codec.
    if (own.error.code !== 'not-a-workflow-file') {
      set({
        transfer: transferError(own.error.code, own.error.path, own.error.message),
        pendingComfy: null,
      });
      return;
    }
    if (comfy.error.code !== 'unsupported-version') {
      set({
        transfer: transferError(comfy.error.code, comfy.error.path, comfy.error.message),
        pendingComfy: null,
      });
      return;
    }
    set({
      transfer: transferError(
        'unrecognized-file',
        'kind',
        'not an OmniMux workflow file and not a supported ComfyUI workflow',
      ),
      pendingComfy: null,
    });
  },

  requestImport: () => {
    set((state) => ({ transfer: null, importNonce: state.importNonce + 1 }));
  },

  failImport: (code, message) => {
    set({ transfer: transferError(code, '', message), pendingComfy: null });
  },

  applyComfy: () => {
    const { transfer, pendingComfy, recents } = get();
    if (transfer?.kind !== 'comfy') return;
    applyGraph(comfyNodes(transfer.projection), comfyEdges(transfer.projection));

    if (!pendingComfy) {
      set({ transfer: { ...transfer, applied: true } });
      return;
    }
    const entry: ComfyRecentEntry = {
      name: pendingComfy.name,
      format: pendingComfy.format,
      nodeCount: pendingComfy.nodeCount,
      savedAt: new Date().toISOString(),
      text: pendingComfy.text,
    };
    const next = upsertComfyRecent(recents, entry);
    writeComfyRecents(next);
    set({ transfer: { ...transfer, applied: true }, recents: next });
  },

  applyOwn: () => {
    const { transfer } = get();
    if (transfer?.kind !== 'own') return;
    const nodes: CanvasNode[] = transfer.file.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
      ...(node.width !== undefined ? { width: node.width } : {}),
      ...(node.height !== undefined ? { height: node.height } : {}),
      ...(node.parentId !== undefined ? { parentId: node.parentId } : {}),
      ...(node.extent !== undefined ? { extent: node.extent } : {}),
      ...(node.zIndex !== undefined ? { zIndex: node.zIndex } : {}),
      ...(node.style !== undefined ? { style: node.style } : {}),
    }));
    const edges: Edge[] = transfer.file.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    }));
    applyGraph(nodes, edges);
    set({ transfer: { ...transfer, applied: true } });
  },

  dismiss: () => {
    set({ transfer: null });
  },

  /**
   * 复现一条最近导入：只把解析结果放进预览，**不**应用。
   * 缓存里的文本解析不了时如实报 codec 错误码，不静默吞掉。
   */
  applyRecent: (name) => {
    const entry = get().recents.find((item) => item.name === name);
    if (!entry) return;
    const comfy = parseComfyWorkflow(entry.text);
    if (!comfy.ok) {
      set({
        transfer: transferError(comfy.error.code, comfy.error.path, comfy.error.message),
        pendingComfy: null,
      });
      return;
    }
    const projection = projectComfyToCanvas(comfy.document);
    set({
      transfer: {
        kind: 'comfy',
        fileName: `${entry.name}.json`,
        format: comfy.format,
        projection,
        applied: false,
      },
      pendingComfy: {
        name: entry.name,
        format: comfy.format,
        nodeCount: projection.nodes.length,
        text: entry.text,
      },
    });
  },
}));
