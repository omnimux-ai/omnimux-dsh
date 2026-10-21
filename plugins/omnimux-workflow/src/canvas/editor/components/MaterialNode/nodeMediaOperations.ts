/**
 * nodeMediaOperations — 多模态下游派生操作执行中枢（语音转写、视频内容拆解、视频分镜表生成）
 *
 * 视频工具栏的「内容拆解 / 分镜表」遵循统一规则：凡需要生成新节点的操作，
 * 点击后立即预建下游表格节点（running + generating），任务在新节点中执行并收敛；
 * 源视频节点绝不写入 running / error，保持原样，可继续并发发起其它工具栏操作。
 */

import type { MaterialNodeData } from '../../../types/materialNode';
import type { ApiUpstream } from '../../../../shared/api.ts';
import { toast } from '../../../ui';
import { useCanvasStore } from '../../../store/canvasStore';
import { tableDocumentCache } from '../../../store/tableDocumentCache.ts';
import { deconstructVideo, storyboardVideo, transcribeAudio } from '../../../bridge/apiClient.ts';
import { planSpeechToTextDownstream } from '../../utils/planSpeechToTextDownstream.ts';
import {
  planVideoDeconstructProvisioning,
  planVideoDeconstructSettlement,
  VIDEO_DECONSTRUCT_ORIGIN,
} from '../../utils/planVideoDeconstructDownstream.ts';
import {
  planVideoStoryboardProvisioning,
  planVideoStoryboardSettlement,
  VIDEO_STORYBOARD_ORIGIN,
} from '../../utils/planVideoStoryboardDownstream.ts';
import {
  resolveSpeechToTextAudioPath,
  resolveVideoDeconstructPath,
  resolveVideoStoryboardPath,
} from '../../utils/nodeToolbarLogic';

interface ApiMessageBody {
  message?: string;
  error?: string;
  /** 上游归因（仅失败且上游给出真因时存在）。 */
  upstream?: ApiUpstream;
}

interface MediaPathQuery {
  realPath?: string;
  relativePath?: string;
  mediaUrl?: string;
  previewUrl?: string;
  workspaceId?: string;
}

type SetNodes = (updater: (nodes: any[]) => any[]) => void;

function selectTargetNode(nodeId: string, setNodes: SetNodes): void {
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

/**
 * 上游归因取值：只有响应体真带非空 code 时才算数。
 *
 * 与 errorMessage 分开传递——错误文案的二次翻译层会整段丢弃传入串，
 * 归因拼进同一个字符串会被吞掉。
 */
function getApiUpstream(body: ApiMessageBody | undefined): ApiUpstream | undefined {
  const raw = body?.upstream;
  if (!raw || typeof raw.code !== 'string') return undefined;
  const code = raw.code.trim();
  if (!code) return undefined;
  return { code, detail: typeof raw.detail === 'string' ? raw.detail.trim() : '' };
}

/** 归因对象 → 表格节点 executionUpstream 字符串（code + 技术原文）。 */
function upstreamText(upstream: ApiUpstream | undefined): string | undefined {
  if (!upstream) return undefined;
  return upstream.detail ? `${upstream.code}: ${upstream.detail}` : upstream.code;
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

/* -------------------------------------------------------------------------- */
/* 语音转写（音频节点 → 下游 SRT 字幕节点）                                      */
/* -------------------------------------------------------------------------- */

function applySpeechToTextPlan(
  audioNodeId: string,
  nodeWidth: number,
  srtText: string,
  label: string,
  applyCanvasInputMutation: (mutation: any) => any,
  setNodes: SetNodes,
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
  setNodes: SetNodes;
}

async function runSpeechToText(
  workspaceId: string,
  id: string,
  audioPath: string,
  nodeWidth: number,
  t: (key: string) => string,
  applyCanvasInputMutation: (mutation: any) => any,
  setNodes: SetNodes,
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

/* -------------------------------------------------------------------------- */
/* 视频工具栏派生表格（内容拆解 / 分镜表）：先建下游节点、隔离执行                  */
/* -------------------------------------------------------------------------- */

export type DerivedTableKind = 'deconstruct' | 'storyboard';

interface DerivedTableKindConfig {
  origin: string;
  noWorkspaceKey: string;
  noVideoKey: string;
  nodeLabelKey: string;
  failToastKey: string;
  successToastKey: string;
  titleSuffix: string;
}

const DERIVED_TABLE_KIND_CONFIG: Record<DerivedTableKind, DerivedTableKindConfig> = {
  deconstruct: {
    origin: VIDEO_DECONSTRUCT_ORIGIN,
    noWorkspaceKey: 'deconstructVideo.noWorkspace',
    noVideoKey: 'deconstructVideo.noVideo',
    nodeLabelKey: 'deconstructVideo.nodeLabel',
    failToastKey: 'deconstructVideo.toast.failed',
    successToastKey: 'deconstructVideo.toast.success',
    titleSuffix: '内容拆解表',
  },
  storyboard: {
    origin: VIDEO_STORYBOARD_ORIGIN,
    noWorkspaceKey: 'storyboardVideo.noWorkspace',
    noVideoKey: 'storyboardVideo.noVideo',
    nodeLabelKey: 'storyboardVideo.nodeLabel',
    failToastKey: 'storyboardVideo.toast.failed',
    successToastKey: 'storyboardVideo.toast.success',
    titleSuffix: '分镜表',
  },
};

export interface DeriveVideoTableParams {
  kind: DerivedTableKind;
  workspaceId: string;
  /** 源视频节点 id（任务归属 + 后端请求的 nodeId）。 */
  sourceVideoNodeId: string;
  /** 源视频节点标题；用于派生节点默认标题，缺省走 i18n 文案。 */
  label?: string;
  /** 组件侧解析后的媒体地址（可选覆盖节点 data 内的字段）。 */
  mediaUrl?: string;
  previewUrl?: string;
  nodeWidth?: number;
  t: (key: string) => string;
  setNodes: SetNodes;
}

interface DerivedTableOutputData {
  tableId: string;
  tablePath: string;
  title: string;
  rowCount: number;
  columnCount: number;
  previewRows: string[];
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * 媒体素材节点可能只把地址存在 mediaAssets（生视频/生图节点的产物），
 * 表格节点重试路径没有组件侧解析后的 URL 可传，需从节点数据兜底取第一个可用地址。
 */
function firstMediaAssetUrl(data: Record<string, unknown>): string | undefined {
  const assets = data.mediaAssets;
  if (!Array.isArray(assets)) return undefined;
  for (const asset of assets) {
    if (!asset || typeof asset !== 'object') continue;
    const url = asTrimmedString((asset as Record<string, unknown>).url);
    if (url) return url;
  }
  return undefined;
}

function buildDerivedTableResult(returnedTableId: string, resultBody: any, defaultLabel: string): DerivedTableOutputData {
  return {
    tableId: returnedTableId,
    tablePath:
      typeof resultBody?.tablePath === 'string' && resultBody.tablePath.trim()
        ? resultBody.tablePath.trim()
        : `.omnimux/tables/${returnedTableId}.htable`,
    title:
      typeof resultBody?.title === 'string' && resultBody.title.trim() ? resultBody.title.trim() : defaultLabel,
    rowCount: typeof resultBody?.rowCount === 'number' ? resultBody.rowCount : 0,
    columnCount: typeof resultBody?.columnCount === 'number' ? resultBody.columnCount : 0,
    previewRows: Array.isArray(resultBody?.previewRows) ? resultBody.previewRows : [],
  };
}

interface SettlementInput {
  targetNodeId: string;
  origin: string;
  sourceVideoNodeId: string;
  label?: string;
  tableResult?: DerivedTableOutputData;
  error?: string;
  upstream?: string;
}

/** 把结算计划落到画布：只 patch 目标表格节点，源视频节点不参与。 */
function applyDerivedTableSettlement(kind: DerivedTableKind, input: SettlementInput): void {
  const settlement =
    kind === 'deconstruct'
      ? planVideoDeconstructSettlement({
          targetNodeId: input.targetNodeId,
          origin: input.origin,
          sourceVideoNodeId: input.sourceVideoNodeId,
          label: input.label,
          tableResult: input.tableResult,
          error: input.error,
          upstream: input.upstream,
        })
      : planVideoStoryboardSettlement({
          targetNodeId: input.targetNodeId,
          origin: input.origin,
          sourceVideoNodeId: input.sourceVideoNodeId,
          label: input.label,
          tableResult: input.tableResult,
          error: input.error,
          upstream: input.upstream,
        });

  useCanvasStore.getState().applyCanvasInputMutation({
    nodePatches: settlement.nodePatches as any,
  });
}

async function requestDerivedTable(
  kind: DerivedTableKind,
  workspaceId: string,
  payload: { nodeId: string; videoPath: string; title: string; targetNodeId: string },
): Promise<{ ok: boolean; body: any }> {
  const result =
    kind === 'deconstruct'
      ? await deconstructVideo(workspaceId, payload)
      : await storyboardVideo(workspaceId, payload);
  return { ok: result.ok, body: result.body as any };
}

/**
 * 视频工具栏「内容拆解 / 分镜表」统一执行入口。
 *
 * 1. 点击瞬间用规划器预建/激活下游表格节点（running + generating）并上屏；
 * 2. 立刻发起请求，把客户端节点 id 作为 targetNodeId 透传后端，避免服务端另建节点；
 * 3. 返回后在同一个下游节点就地收敛（成功回填表格产物 / 失败落错误态）。
 *
 * 源视频节点全程不写入 executionStatus / executionError。
 */
export async function deriveVideoTable(params: DeriveVideoTableParams): Promise<void> {
  const { kind, workspaceId, sourceVideoNodeId, label, t, setNodes } = params;
  const config = DERIVED_TABLE_KIND_CONFIG[kind];
  if (!workspaceId) {
    toast.error(t(config.noWorkspaceKey));
    return;
  }

  const store = useCanvasStore.getState();
  const sourceNode = store.nodes.find((n: any) => n.id === sourceVideoNodeId);
  const sourceData = (sourceNode?.data ?? {}) as Record<string, unknown>;
  // 重试路径没有组件侧解析后的媒体 URL：从 mediaAssets 兜底，保证生成型视频节点也能重试。
  const assetUrl = firstMediaAssetUrl(sourceData);
  const videoPath = (kind === 'deconstruct' ? getVideoDeconstructPath : getVideoStoryboardPath)({
    realPath: asTrimmedString(sourceData.realPath),
    relativePath: asTrimmedString(sourceData.relativePath),
    mediaUrl: params.mediaUrl ?? asTrimmedString(sourceData.mediaUrl) ?? assetUrl,
    previewUrl: params.previewUrl ?? asTrimmedString(sourceData.previewUrl) ?? assetUrl,
    workspaceId,
  });
  if (!videoPath) {
    toast.error(t(config.noVideoKey));
    return;
  }

  const title = label ? `${label} ${config.titleSuffix}` : t(config.nodeLabelKey);
  const videoPosition =
    sourceNode?.position && typeof sourceNode.position.x === 'number' && typeof sourceNode.position.y === 'number'
      ? { x: sourceNode.position.x, y: sourceNode.position.y }
      : { x: 0, y: 0 };
  const rawWidth = typeof sourceData.nodeWidth === 'number' ? sourceData.nodeWidth : undefined;
  const videoNodeWidth =
    typeof params.nodeWidth === 'number' && params.nodeWidth > 0
      ? params.nodeWidth
      : rawWidth && rawWidth > 0
        ? rawWidth
        : 350;

  const provisioning =
    kind === 'deconstruct'
      ? planVideoDeconstructProvisioning({
          videoNodeId: sourceVideoNodeId,
          videoPosition,
          videoNodeWidth,
          label: title,
          currentNodes: store.nodes as any,
          currentEdges: store.edges as any,
        })
      : planVideoStoryboardProvisioning({
          videoNodeId: sourceVideoNodeId,
          videoPosition,
          videoNodeWidth,
          label: title,
          currentNodes: store.nodes as any,
          currentEdges: store.edges as any,
        });

  // 下游节点已在执行中：只防抖，不重复创建/重置。
  if (provisioning.mode === 'noop') return;

  store.applyCanvasInputMutation({
    addNodes: provisioning.addNodes as any,
    addEdges: provisioning.addEdges as any,
    nodePatches: provisioning.nodePatches as any,
  });
  const targetNodeId = provisioning.targetNodeId;
  selectTargetNode(targetNodeId, setNodes);

  try {
    const { ok, body } = await requestDerivedTable(kind, workspaceId, {
      nodeId: sourceVideoNodeId,
      videoPath,
      title,
      targetNodeId,
    });

    if (!ok || typeof body?.tableId !== 'string' || !body.tableId) {
      const message = getApiErrorMessage(body, t(config.failToastKey));
      applyDerivedTableSettlement(kind, {
        targetNodeId,
        origin: config.origin,
        sourceVideoNodeId,
        error: message,
        upstream: upstreamText(getApiUpstream(body)),
      });
      toast.error(message);
      return;
    }

    const tableResult = buildDerivedTableResult(body.tableId, body, title);
    refreshTableCache(workspaceId, tableResult.tableId);

    // 成功路径只结算目标节点，不 hydrate 服务端整图：客户端已持有预建节点与连线，
    // 服务端按 targetNodeId 原地补齐同一节点；整图灌回会让 React Flow 用内部旧快照
    // 发出 replace 变更，把下游节点重新写回 running（真实浏览器实测复现）。
    applyDerivedTableSettlement(kind, {
      targetNodeId,
      origin: config.origin,
      sourceVideoNodeId,
      label: tableResult.title,
      tableResult,
    });

    toast.success(t(config.successToastKey));
  } catch (error) {
    const message = resolveErrorMessage(error, t(config.failToastKey));
    applyDerivedTableSettlement(kind, {
      targetNodeId,
      origin: config.origin,
      sourceVideoNodeId,
      error: message,
    });
    toast.error(message);
  }
}

/**
 * 下游表格节点自身的重试入口：表节点失败态点击「重新生成」时调用。
 *
 * 复用 deriveVideoTable 的 provisioning 分支：已有同源下游节点会被就地置回 running，
 * 不会新增节点；源视频节点不参与任何状态写入。
 */
export function retryDerivedTableNode(
  nodeId: string,
  t: (key: string) => string,
): void {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((n: any) => n.id === nodeId);
  if (!node) return;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const origin = asTrimmedString(data.origin);
  const kind: DerivedTableKind | undefined =
    origin === VIDEO_DECONSTRUCT_ORIGIN ? 'deconstruct' : origin === VIDEO_STORYBOARD_ORIGIN ? 'storyboard' : undefined;
  if (!kind) return;

  const sourceVideoNodeId = asTrimmedString(data.sourceVideoNodeId);
  const workspaceId = asTrimmedString(data.__workspaceId) ?? asTrimmedString(data.workspaceId);
  if (!sourceVideoNodeId || !workspaceId) {
    toast.error(t(DERIVED_TABLE_KIND_CONFIG[kind].noWorkspaceKey));
    return;
  }

  const sourceNode = store.nodes.find((n: any) => n.id === sourceVideoNodeId);
  const sourceLabel = asTrimmedString((sourceNode?.data as Record<string, unknown> | undefined)?.label);

  void deriveVideoTable({
    kind,
    workspaceId,
    sourceVideoNodeId,
    label: sourceLabel,
    t,
    setNodes: store.setNodes,
  });
}
