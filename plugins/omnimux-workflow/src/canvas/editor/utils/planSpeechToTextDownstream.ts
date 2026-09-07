/**
 * 语音识别下游 SRT 字幕节点规划（Issue 744 T02）。
 *
 * 纯函数、无 React 依赖（对齐 planClipExportDownstream 先例）：
 * - 画布中已存在与本音频节点关联的 `origin === 'speech_to_text'` 文本节点
 *   → 仅就地补丁 content（重做识别不产生重复节点），缺连线时补线；
 * - 否则在音频节点右侧（横向偏移 nodeWidth + 120、纵向对齐）创建
 *   import 文本节点并创建 out→in 连线。
 *
 * Handle id 必须沿用 CanvasNodeHandle 的 `in` / `out`，否则 React Flow 画不出边。
 */

export const STT_NODE_ORIGIN = 'speech_to_text';
export const STT_CONTENT_FORMAT = 'srt';
export const STT_SOURCE_HANDLE = 'out';
export const STT_TARGET_HANDLE = 'in';
export const STT_DOWNSTREAM_GAP = 120;

export interface SpeechToTextGraphNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
  selected?: boolean;
}

export interface SpeechToTextGraphEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface PlanSpeechToTextDownstreamInput {
  audioNodeId: string;
  audioPosition: { x: number; y: number };
  audioNodeWidth: number;
  srtText: string;
  /** 新节点标题（调用方传 i18n 文案），缺省「字幕」。 */
  label?: string;
  currentNodes: SpeechToTextGraphNode[];
  currentEdges: SpeechToTextGraphEdge[];
  createNodeId?: () => string;
}

export interface SpeechToTextNodePatch {
  nodeId: string;
  data: Record<string, unknown>;
}

/** create 模式产出的新节点：字段齐备，结构上兼容 CanvasNode（React Flow Node）。 */
export interface SpeechToTextCreatedNode {
  id: string;
  type: 'material';
  position: { x: number; y: number };
  selected: boolean;
  data: Record<string, unknown>;
}

export interface SpeechToTextDownstreamPlan {
  mode: 'create' | 'update';
  targetNodeId: string;
  addNodes: SpeechToTextCreatedNode[];
  addEdges: SpeechToTextGraphEdge[];
  nodePatches: SpeechToTextNodePatch[];
}

function isSpeechToTextSubtitleNode(node: SpeechToTextGraphNode, audioNodeId: string): boolean {
  const data = node.data;
  if (!data) return false;
  if (data.origin !== STT_NODE_ORIGIN) return false;
  if (data.materialType !== undefined && data.materialType !== 'text') return false;
  // 关联判定：显式记录的来源音频节点，或当前已与该音频节点连线（调用方传入 edges 判定）。
  return data.sourceAudioNodeId === audioNodeId;
}

function edgeBetween(source: string, target: string): SpeechToTextGraphEdge {
  return {
    id: `edge_${source}_${target}`,
    source,
    target,
    sourceHandle: STT_SOURCE_HANDLE,
    targetHandle: STT_TARGET_HANDLE,
  };
}

function hasDrawableEdge(
  edges: SpeechToTextGraphEdge[],
  source: string,
  target: string,
): boolean {
  return edges.some((edge) => (
    edge.source === source
    && edge.target === target
    && (edge.sourceHandle === undefined || edge.sourceHandle === null || edge.sourceHandle === STT_SOURCE_HANDLE)
    && (edge.targetHandle === undefined || edge.targetHandle === null || edge.targetHandle === STT_TARGET_HANDLE)
  ));
}

export function planSpeechToTextDownstream(
  input: PlanSpeechToTextDownstreamInput,
): SpeechToTextDownstreamPlan | null {
  const srtText = typeof input.srtText === 'string' ? input.srtText : '';
  if (!input.audioNodeId || !srtText.trim()) return null;

  // 复用候选：显式标记来源，或当前已从该音频节点连出的 speech_to_text 文本节点。
  const connectedTargetIds = new Set(
    input.currentEdges
      .filter((edge) => edge.source === input.audioNodeId)
      .map((edge) => edge.target),
  );
  const existing = input.currentNodes.find((node) => (
    isSpeechToTextSubtitleNode(node, input.audioNodeId)
    || (
      connectedTargetIds.has(node.id)
      && node.data?.origin === STT_NODE_ORIGIN
      && (node.data?.materialType === undefined || node.data?.materialType === 'text')
    )
  ));

  if (existing) {
    return {
      mode: 'update',
      targetNodeId: existing.id,
      addNodes: [],
      addEdges: hasDrawableEdge(input.currentEdges, input.audioNodeId, existing.id)
        ? []
        : [edgeBetween(input.audioNodeId, existing.id)],
      nodePatches: [
        {
          nodeId: existing.id,
          data: {
            content: srtText,
            status: 'ready',
            contentFormat: STT_CONTENT_FORMAT,
            origin: STT_NODE_ORIGIN,
            sourceAudioNodeId: input.audioNodeId,
          },
        },
      ],
    };
  }

  const newNodeId = input.createNodeId?.()
    ?? `node_stt_srt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const width = Number.isFinite(input.audioNodeWidth) && input.audioNodeWidth > 0
    ? input.audioNodeWidth
    : 350;
  const newNode: SpeechToTextCreatedNode = {
    id: newNodeId,
    type: 'material',
    position: {
      x: input.audioPosition.x + width + STT_DOWNSTREAM_GAP,
      y: input.audioPosition.y,
    },
    selected: true,
    data: {
      materialType: 'text',
      selectedTool: 'text-editor',
      nodeKind: 'import',
      contentFormat: STT_CONTENT_FORMAT,
      origin: STT_NODE_ORIGIN,
      sourceAudioNodeId: input.audioNodeId,
      label: input.label || '字幕',
      status: 'ready',
      content: srtText,
      params: {},
    },
  };

  return {
    mode: 'create',
    targetNodeId: newNodeId,
    addNodes: [newNode],
    addEdges: [edgeBetween(input.audioNodeId, newNodeId)],
    nodePatches: [],
  };
}
