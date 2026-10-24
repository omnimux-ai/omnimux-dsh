/**
 * 画布工作流文件「导入 / 导出」的唯一状态所有者（Issue 3669）。
 *
 * 这套状态原先长在 `Toolbar` 里，只服务工具栏两个按钮；Issue 3669 把它提到 store，让
 * 工具栏按钮、拖拽与导入预览面板共用同一份状态与同一套动作，避免第二份实现。
 *
 * 语义与原先逐条一致：解析顺序（ComfyUI → OmniMux 自有文件 → 明确错误）、应用前必须
 * 由用户确认（`hydrateGraph` 会替换整张画布并重置历史）、失败一律带 codec 错误码。
 * Issue 3741 删掉了「最近导入」缓存与复现动作——它们只服务已移除的面板入口。
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
import { useCanvasStore } from './canvasStore';

export type TransferState =
  | { kind: 'error'; code: string; path: string; message: string }
  | { kind: 'exported'; fileName: string; nodeCount: number; droppedCount: number }
  | { kind: 'own'; file: OmnimuxWorkflowFile; applied: boolean }
  | { kind: 'comfy'; fileName: string; format: string; projection: ComfyCanvasProjection; applied: boolean };

export interface WorkflowTransferState {
  transfer: TransferState | null;
  /** 递增即请求持有 `<input type="file">` 的组件弹出选择器（跨组件唯一入口）。 */
  importNonce: number;
  exportWorkflow: (workflowName: string) => void;
  importText: (text: string, fileName: string) => void;
  /** 读取文件本身失败（权限、IO）等不在 codec 错误码里的失败，如实上报。 */
  failImport: (code: string, message: string) => void;
  requestImport: () => void;
  applyComfy: () => void;
  applyOwn: () => void;
  dismiss: () => void;
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
  importNonce: 0,

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
      set({ transfer: { kind: 'comfy', fileName, format: comfy.format, projection, applied: false } });
      return;
    }

    const own = parseOmnimuxWorkflowFile(text);
    if (own.ok) {
      set({ transfer: { kind: 'own', file: own.file, applied: false } });
      return;
    }

    // Prefer the parser that got further: a file that declared the OmniMux
    // kind is reported by the workflow-file parser, a file that looked like a
    // ComfyUI document is reported by the codec.
    if (own.error.code !== 'not-a-workflow-file') {
      set({ transfer: transferError(own.error.code, own.error.path, own.error.message) });
      return;
    }
    if (comfy.error.code !== 'unsupported-version') {
      set({ transfer: transferError(comfy.error.code, comfy.error.path, comfy.error.message) });
      return;
    }
    set({
      transfer: transferError(
        'unrecognized-file',
        'kind',
        'not an OmniMux workflow file and not a supported ComfyUI workflow',
      ),
    });
  },

  requestImport: () => {
    set((state) => ({ transfer: null, importNonce: state.importNonce + 1 }));
  },

  failImport: (code, message) => {
    set({ transfer: transferError(code, '', message) });
  },

  applyComfy: () => {
    const { transfer } = get();
    if (transfer?.kind !== 'comfy') return;
    applyGraph(comfyNodes(transfer.projection), comfyEdges(transfer.projection));
    set({ transfer: { ...transfer, applied: true } });
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
}));
