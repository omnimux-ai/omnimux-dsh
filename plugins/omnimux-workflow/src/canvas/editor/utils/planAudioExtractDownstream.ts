/**
 * 视频节点「提取音频」下游音频素材节点规划纯函数。
 *
 * 契约规范（先建新节点，隔离执行收敛）：
 * 1. 阶段一：乐观预建（planAudioExtractProvisioning）
 *    - 点击「提取音频」后，立即在视频右侧安全槽位规划并创建/激活下游音频节点（Running 态），
 *      建立从源视频到音频节点的连线；源视频节点零侵入（不设 running、不设 error）；
 * 2. 阶段二：结果结算（planAudioExtractSettlement）
 *    - 提取成功：就地将下游音频节点补丁为 completed 态，回填音频路径、时长与播放器；
 *    - 提取失败/无音轨：就地将下游音频节点置为 error 态，展示报错卡片与重试按钮；源视频不受影响；
 * 3. 向后兼容（planAudioExtractDownstream）
 *    - 组合预建与结算两步，满足传统一次性全量规划场景。
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

export interface AudioExtractProvisionPlan {
  mode: 'create' | 'update' | 'noop';
  targetNodeId: string;
  addNodes: AudioExtractCreatedNode[];
  addEdges: AudioExtractGraphEdge[];
  nodePatches: AudioExtractNodePatch[];
}

export interface PlanAudioExtractProvisioningInput {
  videoNodeId: string;
  videoPosition: { x: number; y: number };
  videoNodeWidth: number;
  label?: string;
  currentNodes: AudioExtractGraphNode[];
  currentEdges: AudioExtractGraphEdge[];
  createNodeId?: () => string;
}

export interface PlanAudioExtractSettlementInput {
  targetNodeId: string;
  label?: string;
  extractResult?: AudioExtractOutputData;
  error?: string;
  noAudioStream?: boolean;
}

export interface AudioExtractSettlementPlan {
  targetNodeId: string;
  nodePatches: AudioExtractNodePatch[];
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

/**
 * 阶段一：乐观预建占位规划（点击提取音频立即调用）
 * 在源视频右侧创建或激活下游音频节点（Running 态），源视频本身不做任何状态修改。
 */
export function planAudioExtractProvisioning(
  input: PlanAudioExtractProvisioningInput,
): AudioExtractProvisionPlan {
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

  const nodeLabel = input.label || '视频原声';

  if (existingNode) {
    // 若已有下游音频节点正处于 running 态，返回 noop 防抖
    if (existingNode.data?.executionStatus === 'running') {
      return {
        mode: 'noop',
        targetNodeId: existingNode.id,
        addNodes: [],
        addEdges: [],
        nodePatches: [],
      };
    }

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
            status: 'generating',
            executionStatus: 'running',
            executionError: undefined,
            audioExtractActive: true,
            origin: AUDIO_EXTRACT_ORIGIN,
            sourceVideoNodeId: input.videoNodeId,
          },
        },
      ],
    };
  }

  const newNodeId =
    input.createNodeId?.() ??
    `node_audio_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const width =
    Number.isFinite(input.videoNodeWidth) && input.videoNodeWidth > 0
      ? input.videoNodeWidth
      : 350;

  const targetX = input.videoPosition.x + width + AUDIO_EXTRACT_DOWNSTREAM_GAP;
  const isOccupiedAtY = input.currentNodes.some((node) => {
    if (!node.position) return false;
    const isDownstream =
      node.data?.sourceVideoNodeId === input.videoNodeId ||
      connectedAudioNodeIds.has(node.id);
    if (!isDownstream) return false;
    return Math.abs(node.position.y - input.videoPosition.y) < 60;
  });

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
      status: 'generating',
      executionStatus: 'running',
      executionError: undefined,
      audioExtractActive: true,
      origin: AUDIO_EXTRACT_ORIGIN,
      sourceVideoNodeId: input.videoNodeId,
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

/**
 * 阶段二：结果结算规划（后端返回成功、无音轨或失败时调用）
 * 仅 patch 下游音频节点自身，源视频不受影响。
 */
export function planAudioExtractSettlement(
  input: PlanAudioExtractSettlementInput,
): AudioExtractSettlementPlan {
  if (input.noAudioStream) {
    return {
      targetNodeId: input.targetNodeId,
      nodePatches: [
        {
          nodeId: input.targetNodeId,
          data: {
            executionStatus: 'error',
            executionError: input.error || '视频未检测到有效音频轨',
            audioExtractActive: true,
            status: 'failed',
          },
        },
      ],
    };
  }

  if (input.error || !input.extractResult?.audioPath) {
    return {
      targetNodeId: input.targetNodeId,
      nodePatches: [
        {
          nodeId: input.targetNodeId,
          data: {
            executionStatus: 'error',
            executionError: input.error || '音频提取失败',
            audioExtractActive: true,
            status: 'failed',
          },
        },
      ],
    };
  }

  const res = input.extractResult;
  return {
    targetNodeId: input.targetNodeId,
    nodePatches: [
      {
        nodeId: input.targetNodeId,
        data: {
          label: res.title || input.label || '视频原声',
          materialType: 'audio',
          nodeKind: 'import',
          tool: 'import',
          selectedTool: 'import',
          status: 'ready',
          executionStatus: 'completed',
          executionError: undefined,
          audioExtractActive: undefined,
          realPath: res.audioPath,
          mediaUrl: res.mediaUrl,
          previewUrl: res.previewUrl,
          duration: res.duration,
          format: res.format,
        },
      },
    ],
  };
}

/**
 * 一次性全量规划（兼容旧有调用模式）
 */
export function planAudioExtractDownstream(
  input: PlanAudioExtractDownstreamInput,
): AudioExtractDownstreamPlan | null {
  const extractResult = input.extractResult;
  if (!input.videoNodeId || !extractResult || !extractResult.audioPath) {
    return null;
  }

  const provision = planAudioExtractProvisioning({
    videoNodeId: input.videoNodeId,
    videoPosition: input.videoPosition,
    videoNodeWidth: input.videoNodeWidth,
    label: extractResult.title || input.label,
    currentNodes: input.currentNodes,
    currentEdges: input.currentEdges,
    createNodeId: input.createNodeId,
  });

  const settlement = planAudioExtractSettlement({
    targetNodeId: provision.targetNodeId,
    label: extractResult.title || input.label,
    extractResult,
  });

  if (provision.mode === 'create' && provision.addNodes[0]) {
    const createdNode = provision.addNodes[0];
    const settlementData = settlement.nodePatches[0]?.data || {};
    const mergedNode: AudioExtractCreatedNode = {
      id: createdNode.id,
      type: 'material',
      position: createdNode.position,
      selected: createdNode.selected,
      data: {
        ...createdNode.data,
        ...settlementData,
      },
    };
    return {
      mode: 'create',
      targetNodeId: provision.targetNodeId,
      addNodes: [mergedNode],
      addEdges: provision.addEdges,
      nodePatches: [],
    };
  }

  return {
    mode: 'update',
    targetNodeId: provision.targetNodeId,
    addNodes: [],
    addEdges: provision.addEdges,
    nodePatches: settlement.nodePatches,
  };
}
