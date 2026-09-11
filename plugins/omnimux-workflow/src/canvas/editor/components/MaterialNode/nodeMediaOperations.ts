/**
 * nodeMediaOperations — 多模态下游派生操作执行中枢（语音转写、视频内容拆解、视频分镜表生成）
 */

import type { MaterialNodeData } from '../../../types/materialNode';
import { toast } from '../../../ui';
import { useCanvasStore } from '../../../store/canvasStore';
import { tableDocumentCache } from '../../../store/tableDocumentCache.ts';
import { notifyWorkspaceSaved } from '../../../bridge/useWorkspacePersistence.ts';
import { deconstructVideo, storyboardVideo, transcribeAudio } from '../../../bridge/apiClient.ts';
import { planSpeechToTextDownstream } from '../../utils/planSpeechToTextDownstream.ts';
import { planVideoDeconstructDownstream } from '../../utils/planVideoDeconstructDownstream.ts';
import {
  resolveSpeechToTextAudioPath,
  resolveVideoDeconstructPath,
  resolveVideoStoryboardPath,
} from '../../utils/nodeToolbarLogic';

interface ApiMessageBody {
  message?: string;
  error?: string;
}

interface MediaPathQuery {
  realPath?: string;
  relativePath?: string;
  mediaUrl?: string;
  previewUrl?: string;
  workspaceId?: string;
}

function selectTargetNode(
  nodeId: string,
  setNodes: (updater: (nodes: any[]) => any[]) => void,
): void {
  setNodes((nodes: any[]) => nodes.map((n: any) => ({ ...n, selected: n.id === nodeId })));
  useCanvasStore.getState().setSelectedElement('node', nodeId);
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function getApiErrorMessage(body: ApiMessageBody | undefined, fallback: string): string {
  if (body) {
    if (body.message) return body.message;
    if (body.error) return body.error;
  }
  return fallback;
}

function refreshTableCache(workspaceId: string, tableId?: string): void {
  if (!tableId) return;
  tableDocumentCache.ensure(workspaceId, tableId, { forceReload: true }).catch((err: unknown) => {
    console.warn('[MaterialNode] failed to force reload tableDocumentCache:', err);
  });
}

function getAudioPath(query: MediaPathQuery): string | null {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
  return resolveSpeechToTextAudioPath(query, { baseUrl });
}

function getVideoDeconstructPath(query: MediaPathQuery): string | null {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
  return resolveVideoDeconstructPath(query, { baseUrl });
}

function getVideoStoryboardPath(query: MediaPathQuery): string | null {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
  return resolveVideoStoryboardPath(query, { baseUrl });
}

function applyServerWorkspaceGraph(
  serverWorkspace: { nodes: any[]; edges: any[] },
  returnedTableId: string,
  setNodes: (updater: (nodes: any[]) => any[]) => void,
): void {
  useCanvasStore.getState().hydrateGraph(serverWorkspace.nodes, serverWorkspace.edges);
  notifyWorkspaceSaved(serverWorkspace as any);

  const matched = serverWorkspace.nodes.find((n: any) => {
    return n.id === returnedTableId || n.data?.tableId === returnedTableId;
  });
  const targetNodeId = matched ? matched.id : returnedTableId;
  selectTargetNode(targetNodeId, setNodes);
}

function applySpeechToTextPlan(
  audioNodeId: string,
  nodeWidth: number,
  srtText: string,
  label: string,
  applyCanvasInputMutation: (mutation: any) => any,
  setNodes: (updater: (nodes: any[]) => any[]) => void,
): boolean {
  const store = useCanvasStore.getState();
  const audioNode = store.nodes.find((n: any) => n.id === audioNodeId);
  let audioPosition = { x: 0, y: 0 };
  if (audioNode && audioNode.position) {
    audioPosition = audioNode.position;
  }

  const plan = planSpeechToTextDownstream({
    audioNodeId,
    audioPosition,
    audioNodeWidth: nodeWidth,
    srtText,
    label,
    currentNodes: store.nodes,
    currentEdges: store.edges,
  });
  if (!plan) return false;

  applyCanvasInputMutation({
    addNodes: plan.addNodes,
    addEdges: plan.addEdges,
    nodePatches: plan.nodePatches,
  });
  selectTargetNode(plan.targetNodeId, setNodes);
  return true;
}

function buildTableResult(returnedTableId: string, resultBody: any, defaultLabel: string) {
  const title = resultBody.title || defaultLabel;
  const tablePath = resultBody.tablePath || `.omnimux/tables/${returnedTableId}.htable`;
  const rowCount = typeof resultBody.rowCount === 'number' ? resultBody.rowCount : 0;
  const columnCount = typeof resultBody.columnCount === 'number' ? resultBody.columnCount : 0;
  const previewRows = Array.isArray(resultBody.previewRows) ? resultBody.previewRows : [];

  return {
    tableId: returnedTableId,
    tablePath,
    title,
    rowCount,
    columnCount,
    previewRows,
  };
}

function applyLocalDeconstructPlan(
  videoNodeId: string,
  returnedTableId: string,
  resultBody: any,
  defaultLabel: string,
  nodeWidth: number,
  applyCanvasInputMutation: (mutation: any) => any,
  setNodes: (updater: (nodes: any[]) => any[]) => void,
): boolean {
  const store = useCanvasStore.getState();
  const videoNode = store.nodes.find((n: any) => n.id === videoNodeId);
  let videoPosition = { x: 0, y: 0 };
  if (videoNode && videoNode.position) {
    videoPosition = videoNode.position;
  }
  const tableResult = buildTableResult(returnedTableId, resultBody, defaultLabel);

  const plan = planVideoDeconstructDownstream({
    videoNodeId,
    videoPosition,
    videoNodeWidth: nodeWidth,
    tableResult,
    label: tableResult.title,
    currentNodes: store.nodes,
    currentEdges: store.edges,
  });
  if (!plan) return false;

  applyCanvasInputMutation({
    addNodes: plan.addNodes,
    addEdges: plan.addEdges,
    nodePatches: plan.nodePatches,
  });
  selectTargetNode(plan.targetNodeId, setNodes);
  return true;
}

export interface SpeechToTextParams {
  workspaceId: string;
  id: string;
  nodeData: MaterialNodeData;
  mediaUrl?: string;
  previewUrl?: string;
  nodeWidth: number;
  t: (key: string) => string;
  updateNodeData: (updates: Partial<MaterialNodeData>) => void;
  applyCanvasInputMutation: (mutation: any) => any;
  setNodes: (updater: (nodes: any[]) => any[]) => void;
}

async function runSpeechToText(
  workspaceId: string,
  id: string,
  audioPath: string,
  nodeWidth: number,
  t: (key: string) => string,
  applyCanvasInputMutation: (mutation: any) => any,
  setNodes: (updater: (nodes: any[]) => any[]) => void,
): Promise<{ ok: boolean; message?: string }> {
  const result = await transcribeAudio(workspaceId, {
    nodeId: id,
    audioPath,
    model: 'doubao-asr-bigmodel',
    responseFormat: 'srt',
  });
  const text = result.body?.text;
  if (!result.ok || !text || !text.trim()) {
    return { ok: false, message: getApiErrorMessage(result.body, t('stt.toast.failed')) };
  }

  const applied = applySpeechToTextPlan(id, nodeWidth, text, t('stt.nodeLabel'), applyCanvasInputMutation, setNodes);
  if (!applied) {
    return { ok: false, message: t('stt.toast.failed') };
  }
  return { ok: true };
}

export async function executeSpeechToText(params: SpeechToTextParams): Promise<void> {
  const { workspaceId, id, nodeData, mediaUrl, previewUrl, nodeWidth, t, updateNodeData, applyCanvasInputMutation, setNodes } = params;
  if (!workspaceId) {
    toast.error(t('stt.noWorkspace'));
    return;
  }
  const audioPath = getAudioPath({
    realPath: nodeData.realPath,
    relativePath: nodeData.relativePath,
    mediaUrl,
    previewUrl,
    workspaceId,
  });
  if (!audioPath) {
    toast.error(t('stt.noAudio'));
    return;
  }

  updateNodeData({ executionStatus: 'running', executionError: undefined, sttActive: true });
  try {
    const outcome = await runSpeechToText(workspaceId, id, audioPath, nodeWidth, t, applyCanvasInputMutation, setNodes);
    if (!outcome.ok) {
      updateNodeData({ executionStatus: 'error', executionError: outcome.message });
      toast.error(outcome.message || t('stt.toast.failed'));
      return;
    }
    updateNodeData({ executionStatus: 'completed', executionError: undefined, sttActive: undefined });
    toast.success(t('stt.toast.success'));
  } catch (error) {
    const message = resolveErrorMessage(error, t('stt.toast.failed'));
    updateNodeData({ executionStatus: 'error', executionError: message });
    toast.error(message);
  }
}

function handleDeconstructResult(
  result: any,
  params: DeconstructVideoParams,
  defaultLabel: string,
): boolean {
  const { id, nodeWidth, applyCanvasInputMutation, setNodes, updateNodeData } = params;
  updateNodeData({ executionStatus: 'completed', executionError: undefined, videoDeconstructActive: undefined });

  const serverWorkspace = result.body.workspace;
  const returnedTableId = result.body.tableId;
  const isServerValid = Boolean(serverWorkspace && Array.isArray(serverWorkspace.nodes) && Array.isArray(serverWorkspace.edges));

  if (isServerValid) {
    applyServerWorkspaceGraph(serverWorkspace, returnedTableId, setNodes);
    return true;
  }

  return applyLocalDeconstructPlan(id, returnedTableId, result.body, defaultLabel, nodeWidth, applyCanvasInputMutation, setNodes);
}

export interface DeconstructVideoParams {
  workspaceId: string;
  id: string;
  label?: string;
  nodeData: MaterialNodeData;
  mediaUrl?: string;
  previewUrl?: string;
  nodeWidth: number;
  t: (key: string) => string;
  updateNodeData: (updates: Partial<MaterialNodeData>) => void;
  applyCanvasInputMutation: (mutation: any) => any;
  setNodes: (updater: (nodes: any[]) => any[]) => void;
}

async function runDeconstructVideo(
  workspaceId: string,
  id: string,
  videoPath: string,
  defaultLabel: string,
  params: DeconstructVideoParams,
): Promise<{ ok: boolean; message?: string }> {
  const result = await deconstructVideo(workspaceId, { nodeId: id, videoPath, title: defaultLabel });
  if (!result.ok || !result.body?.tableId) {
    return { ok: false, message: getApiErrorMessage(result.body, params.t('deconstructVideo.toast.failed')) };
  }

  const applied = handleDeconstructResult(result, params, defaultLabel);
  if (!applied) {
    return { ok: false, message: params.t('deconstructVideo.toast.failed') };
  }

  refreshTableCache(workspaceId, result.body.tableId);
  return { ok: true };
}

export async function executeDeconstructVideo(params: DeconstructVideoParams): Promise<void> {
  const { workspaceId, id, label, nodeData, mediaUrl, previewUrl, t, updateNodeData } = params;
  if (!workspaceId) {
    toast.error(t('deconstructVideo.noWorkspace'));
    return;
  }
  const videoPath = getVideoDeconstructPath({
    realPath: nodeData.realPath,
    relativePath: nodeData.relativePath,
    mediaUrl,
    previewUrl,
    workspaceId,
  });
  if (!videoPath) {
    toast.error(t('deconstructVideo.noVideo'));
    return;
  }

  updateNodeData({ executionStatus: 'running', executionError: undefined, videoDeconstructActive: true });
  const defaultLabel = label ? `${label} 内容拆解表` : t('deconstructVideo.nodeLabel');
  try {
    const outcome = await runDeconstructVideo(workspaceId, id, videoPath, defaultLabel, params);
    if (!outcome.ok) {
      updateNodeData({ executionStatus: 'error', executionError: outcome.message });
      toast.error(outcome.message || t('deconstructVideo.toast.failed'));
      return;
    }
    toast.success(t('deconstructVideo.toast.success'));
  } catch (error) {
    const message = resolveErrorMessage(error, t('deconstructVideo.toast.failed'));
    updateNodeData({ executionStatus: 'error', executionError: message, videoDeconstructActive: undefined });
    toast.error(message);
  }
}

function handleStoryboardResult(
  result: any,
  setNodes: (updater: (nodes: any[]) => any[]) => void,
): void {
  const serverWorkspace = result.body.workspace;
  const returnedTableId = result.body.tableId;
  const isServerValid = Boolean(serverWorkspace && Array.isArray(serverWorkspace.nodes) && Array.isArray(serverWorkspace.edges));
  if (isServerValid) {
    applyServerWorkspaceGraph(serverWorkspace, returnedTableId, setNodes);
  }
}

export interface StoryboardVideoParams {
  workspaceId: string;
  id: string;
  label?: string;
  nodeData: MaterialNodeData;
  mediaUrl?: string;
  previewUrl?: string;
  t: (key: string) => string;
  updateNodeData: (updates: Partial<MaterialNodeData>) => void;
  setNodes: (updater: (nodes: any[]) => any[]) => void;
}

export async function executeStoryboardVideo(params: StoryboardVideoParams): Promise<void> {
  const { workspaceId, id, label, nodeData, mediaUrl, previewUrl, t, updateNodeData, setNodes } = params;
  if (!workspaceId) {
    toast.error(t('storyboardVideo.noWorkspace'));
    return;
  }
  const videoPath = getVideoStoryboardPath({
    realPath: nodeData.realPath,
    relativePath: nodeData.relativePath,
    mediaUrl,
    previewUrl,
    workspaceId,
  });
  if (!videoPath) {
    toast.error(t('storyboardVideo.noVideo'));
    return;
  }

  updateNodeData({ executionStatus: 'running', executionError: undefined, videoStoryboardActive: true });
  const defaultLabel = label ? `${label} 分镜表` : t('storyboardVideo.nodeLabel');
  try {
    const result = await storyboardVideo(workspaceId, { nodeId: id, videoPath, title: defaultLabel });
    if (!result.ok || !result.body?.tableId) {
      const message = getApiErrorMessage(result.body, t('storyboardVideo.toast.failed'));
      updateNodeData({ executionStatus: 'error', executionError: message, videoStoryboardActive: undefined });
      toast.error(message);
      return;
    }
    updateNodeData({ executionStatus: 'completed', executionError: undefined, videoStoryboardActive: undefined });

    handleStoryboardResult(result, setNodes);
    toast.success(t('storyboardVideo.toast.success'));
  } catch (error) {
    const message = resolveErrorMessage(error, t('storyboardVideo.toast.failed'));
    updateNodeData({ executionStatus: 'error', executionError: message, videoStoryboardActive: undefined });
    toast.error(message);
  }
}
