/**
 * 视频节点「深度视频」下游视频节点规划纯函数。
 *
 * 契约（与提取音频一致，先建节点、隔离执行、就地收敛）：
 * 1. 阶段一 planVideoDepthProvisioning：点击胶囊后立即在源视频右侧创建/激活
 *    `origin === 'video_depth'` 的下游视频节点（Running 态）并建立连线；
 *    源视频节点零侵入（不写 running / error）。
 * 2. 阶段二 planVideoDepthSettlement：成功回填深度视频路径与媒体信息；
 *    失败只把下游节点置为 error 并保留可读错误。
 * 3. 重复点击复用同一节点；下游仍在 running 时返回 noop 防抖。
 */

export const VIDEO_DEPTH_ORIGIN = 'video_depth';
export const VIDEO_DEPTH_SOURCE_HANDLE = 'out';
export const VIDEO_DEPTH_TARGET_HANDLE = 'in';
export const VIDEO_DEPTH_DOWNSTREAM_GAP = 120;

export interface VideoDepthGraphNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
  selected?: boolean;
}

export interface VideoDepthGraphEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface VideoDepthOutputData {
  depthPath: string;
  mediaUrl?: string;
  previewUrl?: string;
  title?: string;
}

export interface VideoDepthNodePatch {
  nodeId: string;
  data: Record<string, unknown>;
}

export interface VideoDepthCreatedNode {
  id: string;
  type: 'material';
  position: { x: number; y: number };
  selected: boolean;
  data: Record<string, unknown>;
}

export interface VideoDepthProvisionPlan {
  mode: 'create' | 'update' | 'noop';
  targetNodeId: string;
  addNodes: VideoDepthCreatedNode[];
  addEdges: VideoDepthGraphEdge[];
  nodePatches: VideoDepthNodePatch[];
}

export interface PlanVideoDepthProvisioningInput {
  videoNodeId: string;
  videoPosition: { x: number; y: number };
  videoNodeWidth: number;
  label?: string;
  currentNodes: VideoDepthGraphNode[];
  currentEdges: VideoDepthGraphEdge[];
  createNodeId?: () => string;
}

export interface PlanVideoDepthSettlementInput {
  targetNodeId: string;
  label?: string;
  depthResult?: VideoDepthOutputData;
  error?: string;
}

export interface VideoDepthSettlementPlan {
  targetNodeId: string;
  nodePatches: VideoDepthNodePatch[];
}

export function isVideoDepthDownstreamNode(
  node: VideoDepthGraphNode,
  videoNodeId: string,
): boolean {
  const data = node.data;
  if (!data) return false;
  if (data.origin !== VIDEO_DEPTH_ORIGIN) return false;
  if (data.materialType !== undefined && data.materialType !== 'video') return false;
  return data.sourceVideoNodeId === videoNodeId;
}

function edgeBetween(source: string, target: string): VideoDepthGraphEdge {
  return {
    id: `edge_${source}_${target}`,
    source,
    target,
    sourceHandle: VIDEO_DEPTH_SOURCE_HANDLE,
    targetHandle: VIDEO_DEPTH_TARGET_HANDLE,
  };
}

function hasDrawableEdge(
  edges: VideoDepthGraphEdge[],
  source: string,
  target: string,
): boolean {
  return edges.some(
    (edge) =>
      edge.source === source &&
      edge.target === target &&
      (edge.sourceHandle === undefined ||
        edge.sourceHandle === null ||
        edge.sourceHandle === VIDEO_DEPTH_SOURCE_HANDLE) &&
      (edge.targetHandle === undefined ||
        edge.targetHandle === null ||
        edge.targetHandle === VIDEO_DEPTH_TARGET_HANDLE),
  );
}

export function planVideoDepthProvisioning(
  input: PlanVideoDepthProvisioningInput,
): VideoDepthProvisionPlan {
  const connectedTargetIds = new Set(
    input.currentEdges
      .filter((edge) => edge.source === input.videoNodeId)
      .map((edge) => edge.target),
  );

  const existingNode = input.currentNodes.find(
    (node) =>
      isVideoDepthDownstreamNode(node, input.videoNodeId) ||
      (connectedTargetIds.has(node.id) &&
        node.data?.origin === VIDEO_DEPTH_ORIGIN &&
        (node.data?.materialType === undefined || node.data?.materialType === 'video')),
  );

  const nodeLabel = input.label || '深度视频';

  if (existingNode) {
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
            materialType: 'video',
            nodeKind: 'import',
            tool: 'import',
            selectedTool: 'import',
            status: 'generating',
            executionStatus: 'running',
            executionError: undefined,
            realPath: undefined,
            mediaUrl: undefined,
            previewUrl: undefined,
            origin: VIDEO_DEPTH_ORIGIN,
            sourceVideoNodeId: input.videoNodeId,
          },
        },
      ],
    };
  }

  const newNodeId =
    input.createNodeId?.() ??
    `node_depth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const width =
    Number.isFinite(input.videoNodeWidth) && input.videoNodeWidth > 0
      ? input.videoNodeWidth
      : 350;

  // 目标空槽：源视频右侧。与任意已有节点（不只下游）在 y 带内重叠时向下错开，
  // 避免压住上游/无关节点。
  const targetX = input.videoPosition.x + width + VIDEO_DEPTH_DOWNSTREAM_GAP;
  const overlapsAnyNode = (y: number) =>
    input.currentNodes.some((node) => {
      if (!node.position) return false;
      if (node.id === input.videoNodeId) return false;
      return Math.abs(node.position.y - y) < 260 && Math.abs(node.position.x - targetX) < 420;
    });
  let targetY = input.videoPosition.y;
  for (let step = 0; step < 5 && overlapsAnyNode(targetY); step += 1) {
    targetY += 360;
  }

  const newNode: VideoDepthCreatedNode = {
    id: newNodeId,
    type: 'material',
    position: { x: targetX, y: targetY },
    selected: true,
    data: {
      label: nodeLabel,
      materialType: 'video',
      nodeKind: 'import',
      tool: 'import',
      selectedTool: 'import',
      status: 'generating',
      executionStatus: 'running',
      executionError: undefined,
      origin: VIDEO_DEPTH_ORIGIN,
      sourceVideoNodeId: input.videoNodeId,
      params: {},
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

export function planVideoDepthSettlement(
  input: PlanVideoDepthSettlementInput,
): VideoDepthSettlementPlan {
  if (input.error || !input.depthResult?.depthPath) {
    return {
      targetNodeId: input.targetNodeId,
      nodePatches: [
        {
          nodeId: input.targetNodeId,
          data: {
            executionStatus: 'error',
            executionError: input.error || '深度视频生成失败',
            realPath: undefined,
            mediaUrl: undefined,
            previewUrl: undefined,
            status: 'failed',
          },
        },
      ],
    };
  }

  const result = input.depthResult;
  return {
    targetNodeId: input.targetNodeId,
    nodePatches: [
      {
        nodeId: input.targetNodeId,
        data: {
          label: result.title || input.label || '深度视频',
          materialType: 'video',
          nodeKind: 'import',
          tool: 'import',
          selectedTool: 'import',
          status: 'ready',
          executionStatus: 'completed',
          executionError: undefined,
          realPath: result.depthPath,
          mediaUrl: result.mediaUrl,
          previewUrl: result.previewUrl,
          params: {},
        },
      },
    ],
  };
}
