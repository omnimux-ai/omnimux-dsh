/**
 * 文本节点「提取视频」下游视频节点规划工具。
 *
 * 纯函数、无 React 依赖（对齐 planSpeechToTextDownstream / planClipExportDownstream 先例）：
 * - 画布中已存在与本节点关联的 `origin === 'video_extraction'` 视频节点
 *   → 仅就地补丁视频路径及媒体信息（多次提取不产生重复冗余节点），缺连线时补线；
 * - 否则在文本节点右侧（横向偏移 textNodeWidth + 120、纵向对齐）创建
 *   import 视频节点并创建 out→in 连线。
 *
 * Handle id 必须沿用 CanvasNodeHandle 的 `in` / `out`，使 React Flow 正确渲染连线。
 */

export const VIDEO_EXTRACTION_ORIGIN = 'video_extraction';
export const VIDEO_EXTRACTION_SOURCE_HANDLE = 'out';
export const VIDEO_EXTRACTION_TARGET_HANDLE = 'in';
export const VIDEO_EXTRACTION_DOWNSTREAM_GAP = 120;

export interface VideoExtractionGraphNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
  selected?: boolean;
}

export interface VideoExtractionGraphEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface ExtractedVideoOutputData {
  videoPath: string;
  mediaUrl: string;
  previewUrl: string;
  title?: string;
  duration?: number;
  coverUrl?: string;
}

export interface PlanVideoExtractionDownstreamInput {
  textNodeId: string;
  textPosition: { x: number; y: number };
  textNodeWidth: number;
  videoResult: ExtractedVideoOutputData;
  /** 新节点标题（调用方传 i18n 文案），缺省「提取视频」或视频标题。 */
  label?: string;
  currentNodes: VideoExtractionGraphNode[];
  currentEdges: VideoExtractionGraphEdge[];
  createNodeId?: () => string;
}

export interface VideoExtractionNodePatch {
  nodeId: string;
  data: Record<string, unknown>;
}

export interface VideoExtractionCreatedNode {
  id: string;
  type: 'material';
  position: { x: number; y: number };
  selected: boolean;
  data: Record<string, unknown>;
}

export interface VideoExtractionDownstreamPlan {
  mode: 'create' | 'update';
  targetNodeId: string;
  addNodes: VideoExtractionCreatedNode[];
  addEdges: VideoExtractionGraphEdge[];
  nodePatches: VideoExtractionNodePatch[];
}

function isVideoExtractionDownstreamNode(
  node: VideoExtractionGraphNode,
  textNodeId: string,
): boolean {
  const data = node.data;
  if (!data) return false;
  if (data.origin !== VIDEO_EXTRACTION_ORIGIN) return false;
  if (data.materialType !== undefined && data.materialType !== 'video') return false;
  return data.sourceTextNodeId === textNodeId;
}

function edgeBetween(source: string, target: string): VideoExtractionGraphEdge {
  return {
    id: `edge_${source}_${target}`,
    source,
    target,
    sourceHandle: VIDEO_EXTRACTION_SOURCE_HANDLE,
    targetHandle: VIDEO_EXTRACTION_TARGET_HANDLE,
  };
}

function hasDrawableEdge(
  edges: VideoExtractionGraphEdge[],
  source: string,
  target: string,
): boolean {
  return edges.some(
    (edge) =>
      edge.source === source &&
      edge.target === target &&
      (edge.sourceHandle === undefined ||
        edge.sourceHandle === null ||
        edge.sourceHandle === VIDEO_EXTRACTION_SOURCE_HANDLE) &&
      (edge.targetHandle === undefined ||
        edge.targetHandle === null ||
        edge.targetHandle === VIDEO_EXTRACTION_TARGET_HANDLE),
  );
}

export function planVideoExtractionDownstream(
  input: PlanVideoExtractionDownstreamInput,
): VideoExtractionDownstreamPlan | null {
  const videoResult = input.videoResult;
  if (!input.textNodeId || !videoResult || !videoResult.mediaUrl) return null;

  // 复用候选：显式标记来源，或当前已从该文本节点连出的 video_extraction 视频节点。
  const connectedTargetIds = new Set(
    input.currentEdges
      .filter((edge) => edge.source === input.textNodeId)
      .map((edge) => edge.target),
  );
  const existing = input.currentNodes.find(
    (node) =>
      isVideoExtractionDownstreamNode(node, input.textNodeId) ||
      (connectedTargetIds.has(node.id) &&
        node.data?.origin === VIDEO_EXTRACTION_ORIGIN &&
        (node.data?.materialType === undefined || node.data?.materialType === 'video')),
  );

  const nodeLabel = videoResult.title || input.label || '提取视频';

  if (existing) {
    return {
      mode: 'update',
      targetNodeId: existing.id,
      addNodes: [],
      addEdges: hasDrawableEdge(input.currentEdges, input.textNodeId, existing.id)
        ? []
        : [edgeBetween(input.textNodeId, existing.id)],
      nodePatches: [
        {
          nodeId: existing.id,
          data: {
            materialType: 'video',
            selectedTool: 'import',
            nodeKind: 'import',
            origin: VIDEO_EXTRACTION_ORIGIN,
            sourceTextNodeId: input.textNodeId,
            label: nodeLabel,
            status: 'ready',
            realPath: videoResult.videoPath,
            mediaUrl: videoResult.mediaUrl,
            previewUrl: videoResult.previewUrl,
            duration: videoResult.duration,
            coverUrl: videoResult.coverUrl,
          },
        },
      ],
    };
  }

  const newNodeId =
    input.createNodeId?.() ??
    `node_extract_vid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const width =
    Number.isFinite(input.textNodeWidth) && input.textNodeWidth > 0
      ? input.textNodeWidth
      : 350;

  const newNode: VideoExtractionCreatedNode = {
    id: newNodeId,
    type: 'material',
    position: {
      x: input.textPosition.x + width + VIDEO_EXTRACTION_DOWNSTREAM_GAP,
      y: input.textPosition.y,
    },
    selected: true,
    data: {
      materialType: 'video',
      selectedTool: 'import',
      nodeKind: 'import',
      origin: VIDEO_EXTRACTION_ORIGIN,
      sourceTextNodeId: input.textNodeId,
      label: nodeLabel,
      status: 'ready',
      realPath: videoResult.videoPath,
      mediaUrl: videoResult.mediaUrl,
      previewUrl: videoResult.previewUrl,
      duration: videoResult.duration,
      coverUrl: videoResult.coverUrl,
      params: {},
    },
  };

  return {
    mode: 'create',
    targetNodeId: newNodeId,
    addNodes: [newNode],
    addEdges: [edgeBetween(input.textNodeId, newNodeId)],
    nodePatches: [],
  };
}
