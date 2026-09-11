/**
 * 视频节点「提取音频」下游音频素材节点规划纯函数。
 *
 * 契约规范（对齐 planSpeechToTextDownstream / planVideoDeconstructDownstream）：
 * - 画布中已存在与本视频节点关联的 `origin === 'audio_extract'` 音频节点
 *   → 仅就地补丁音频路径与元数据（多次提取不产生冗余重复节点），缺连线时补线；
 * - 否则在视频节点右侧派生新的 material 音频节点并创建 video.out -> audio.in 连线；
 * - 自动进行 Y 轴智能避让：若右侧已有拆解表或分镜表，顺延落位在下方空闲槽位。
 */

export const AUDIO_EXTRACT_ORIGIN = 'audio_extract';
export const AUDIO_EXTRACT_SOURCE_HANDLE = 'out';
export const AUDIO_EXTRACT_TARGET_HANDLE = 'in';
export const AUDIO_EXTRACT_DOWNSTREAM_GAP = 120;

export interface AudioExtractGraphNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
  selected?: boolean;
}

export interface AudioExtractGraphEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface AudioExtractOutputData {
  audioPath?: string;
  mediaUrl?: string;
  previewUrl?: string;
  duration?: number;
  format?: 'mp3' | 'm4a';
  title?: string;
}

export interface PlanAudioExtractDownstreamInput {
  videoNodeId: string;
  videoPosition: { x: number; y: number };
  videoNodeWidth: number;
  extractResult: AudioExtractOutputData;
  /** 新节点标题（调用方传 i18n 文案），缺省「视频原声」。 */
  label?: string;
  currentNodes: AudioExtractGraphNode[];
  currentEdges: AudioExtractGraphEdge[];
  createNodeId?: () => string;
}

export interface AudioExtractNodePatch {
  nodeId: string;
  data: Record<string, unknown>;
}

export interface AudioExtractCreatedNode {
  id: string;
  type: 'material';
  position: { x: number; y: number };
  selected: boolean;
  data: Record<string, unknown>;
}

export interface AudioExtractDownstreamPlan {
  mode: 'create' | 'update';
  targetNodeId: string;
  addNodes: AudioExtractCreatedNode[];
  addEdges: AudioExtractGraphEdge[];
  nodePatches: AudioExtractNodePatch[];
}

export function isAudioExtractDownstreamNode(
  node: AudioExtractGraphNode,
  videoNodeId: string,
): boolean {
  const data = node.data;
  if (!data) return false;
  if (data.origin !== AUDIO_EXTRACT_ORIGIN) return false;
  if (data.materialType !== undefined && data.materialType !== 'audio') return false;
  return data.sourceVideoNodeId === videoNodeId;
}

function edgeBetween(source: string, target: string): AudioExtractGraphEdge {
  return {
    id: `edge_${source}_${target}`,
    source,
    target,
    sourceHandle: AUDIO_EXTRACT_SOURCE_HANDLE,
    targetHandle: AUDIO_EXTRACT_TARGET_HANDLE,
  };
}

function hasDrawableEdge(
  edges: AudioExtractGraphEdge[],
  source: string,
  target: string,
): boolean {
  return edges.some(
    (edge) =>
      edge.source === source &&
      edge.target === target &&
      (edge.sourceHandle === undefined ||
        edge.sourceHandle === null ||
        edge.sourceHandle === AUDIO_EXTRACT_SOURCE_HANDLE) &&
      (edge.targetHandle === undefined ||
        edge.targetHandle === null ||
        edge.targetHandle === AUDIO_EXTRACT_TARGET_HANDLE),
  );
}

export function planAudioExtractDownstream(
  input: PlanAudioExtractDownstreamInput,
): AudioExtractDownstreamPlan | null {
  const extractResult = input.extractResult;
  if (!input.videoNodeId || !extractResult || !extractResult.audioPath) {
    return null;
  }

  // 1. 查找已有专属提取音频节点
  const connectedAudioNodeIds = new Set(
    input.currentEdges
      .filter((edge) => edge.source === input.videoNodeId)
      .map((edge) => edge.target),
  );
  const existingNode = input.currentNodes.find((node) => {
    if (node.data?.materialType !== 'audio') return false;
    if (isAudioExtractDownstreamNode(node, input.videoNodeId)) return true;
    return !node.data?.origin && connectedAudioNodeIds.has(node.id);
  });

  const nodeLabel = extractResult.title || input.label || '视频原声';

  // 2. 就地更新模式 (update mode)
  if (existingNode) {
    return {
      mode: 'update',
      targetNodeId: existingNode.id,
      addNodes: [],
      addEdges: hasDrawableEdge(input.currentEdges, input.videoNodeId, existingNode.id)
        ? []
        : [edgeBetween(input.videoNodeId, existingNode.id)],
      nodePatches: [
        {
          nodeId: existingNode.id,
          data: {
            label: nodeLabel,
            materialType: 'audio',
            nodeKind: 'import',
            tool: 'import',
            selectedTool: 'import',
            status: 'ready',
            origin: AUDIO_EXTRACT_ORIGIN,
            sourceVideoNodeId: input.videoNodeId,
            realPath: extractResult.audioPath,
            mediaUrl: extractResult.mediaUrl,
            previewUrl: extractResult.previewUrl,
            duration: extractResult.duration,
            format: extractResult.format,
          },
        },
      ],
    };
  }

  // 3. 新建节点模式 (create mode)
  const newNodeId =
    input.createNodeId?.() ??
    `node_audio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const width =
    Number.isFinite(input.videoNodeWidth) && input.videoNodeWidth > 0
      ? input.videoNodeWidth
      : 350;

  // 智能 Y 轴避让算法：
  // 检查视频节点关联的其他下游节点（拆解表、分镜表等）的位置
  const targetX = input.videoPosition.x + width + AUDIO_EXTRACT_DOWNSTREAM_GAP;
  const isOccupiedAtY = input.currentNodes.some((node) => {
    if (!node.position) return false;
    const isDownstream =
      node.data?.sourceVideoNodeId === input.videoNodeId ||
      connectedAudioNodeIds.has(node.id);
    if (!isDownstream) return false;
    return Math.abs(node.position.y - input.videoPosition.y) < 60;
  });

  // 如果水平位置已有下游节点（通常是拆解表在 y 轴与视频对齐），音频节点落位在下方 +360px
  const targetY = isOccupiedAtY
    ? input.videoPosition.y + 360
    : input.videoPosition.y;

  const newNode: AudioExtractCreatedNode = {
    id: newNodeId,
    type: 'material',
    position: {
      x: targetX,
      y: targetY,
    },
    selected: true,
    data: {
      label: nodeLabel,
      materialType: 'audio',
      nodeKind: 'import',
      tool: 'import',
      selectedTool: 'import',
      status: 'ready',
      origin: AUDIO_EXTRACT_ORIGIN,
      sourceVideoNodeId: input.videoNodeId,
      realPath: extractResult.audioPath,
      mediaUrl: extractResult.mediaUrl,
      previewUrl: extractResult.previewUrl,
      duration: extractResult.duration,
      format: extractResult.format,
    },
  };

  return {
    mode: 'create',
    targetNodeId: newNodeId,
    addNodes: [newNode],
    addEdges: [edgeBetween(input.videoNodeId, newNodeId)],
    nodePatches: [],
  };
}
