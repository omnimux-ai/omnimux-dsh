/**
 * 视频节点「内容拆解」下游表格节点规划工具。
 *
 * 纯函数、无 React 依赖（对齐 planSpeechToTextDownstream / planVideoExtractionDownstream 先例）：
 * - 画布中已存在与本视频节点关联的 `origin === 'video_deconstruct'` 表格节点
 *   → 仅就地补丁表格路径、行数列数及预览记录（多次拆解不产生重复冗余节点），缺连线时补线；
 * - 否则在视频节点右侧（横向偏移 videoNodeWidth + 120、纵向对齐）创建
 *   type: 'table' 节点并创建 out→in 连线。
 *
 * Handle id 必须沿用 CanvasNodeHandle 的 `in` / `out`，使 React Flow 正确渲染连线。
 */

export const VIDEO_DECONSTRUCT_ORIGIN = 'video_deconstruct';
export const VIDEO_DECONSTRUCT_SOURCE_HANDLE = 'out';
export const VIDEO_DECONSTRUCT_TARGET_HANDLE = 'in';
export const VIDEO_DECONSTRUCT_DOWNSTREAM_GAP = 120;

export interface VideoDeconstructGraphNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
  selected?: boolean;
}

export interface VideoDeconstructGraphEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface DeconstructedTableOutputData {
  tableId: string;
  tablePath: string;
  title?: string;
  rowCount: number;
  columnCount: number;
  previewRows?: unknown[];
}

export interface PlanVideoDeconstructDownstreamInput {
  videoNodeId: string;
  videoPosition: { x: number; y: number };
  videoNodeWidth: number;
  tableResult: DeconstructedTableOutputData;
  /** 新节点标题（调用方传 i18n 文案），缺省「视频拆解表」。 */
  label?: string;
  currentNodes: VideoDeconstructGraphNode[];
  currentEdges: VideoDeconstructGraphEdge[];
  createNodeId?: () => string;
}

export interface VideoDeconstructNodePatch {
  nodeId: string;
  data: Record<string, unknown>;
}

export interface VideoDeconstructCreatedNode {
  id: string;
  type: 'table';
  position: { x: number; y: number };
  selected: boolean;
  data: Record<string, unknown>;
}

export interface VideoDeconstructDownstreamPlan {
  mode: 'create' | 'update';
  targetNodeId: string;
  addNodes: VideoDeconstructCreatedNode[];
  addEdges: VideoDeconstructGraphEdge[];
  nodePatches: VideoDeconstructNodePatch[];
}

export function isVideoDeconstructDownstreamNode(
  node: VideoDeconstructGraphNode,
  videoNodeId: string,
): boolean {
  const data = node.data;
  if (!data) return false;
  if (data.origin !== VIDEO_DECONSTRUCT_ORIGIN) return false;
  if (node.type !== 'table') return false;
  return data.sourceVideoNodeId === videoNodeId;
}

// 别名保持向后兼容
export const isVideoDeconstructTableNode = isVideoDeconstructDownstreamNode;

function edgeBetween(source: string, target: string): VideoDeconstructGraphEdge {
  return {
    id: `edge_${source}_${target}`,
    source,
    target,
    sourceHandle: VIDEO_DECONSTRUCT_SOURCE_HANDLE,
    targetHandle: VIDEO_DECONSTRUCT_TARGET_HANDLE,
  };
}

function hasDrawableEdge(
  edges: VideoDeconstructGraphEdge[],
  source: string,
  target: string,
): boolean {
  return edges.some(
    (edge) =>
      edge.source === source &&
      edge.target === target &&
      (edge.sourceHandle === undefined ||
        edge.sourceHandle === null ||
        edge.sourceHandle === VIDEO_DECONSTRUCT_SOURCE_HANDLE) &&
      (edge.targetHandle === undefined ||
        edge.targetHandle === null ||
        edge.targetHandle === VIDEO_DECONSTRUCT_TARGET_HANDLE),
  );
}

export function planVideoDeconstructDownstream(
  input: PlanVideoDeconstructDownstreamInput,
): VideoDeconstructDownstreamPlan | null {
  const tableResult = input.tableResult;
  if (!input.videoNodeId || !tableResult || !tableResult.tableId || !tableResult.tablePath) {
    return null;
  }

  // 强化已有节点判定（单一下游约束与强类型防误判）：
  // 1. 优先找显式标记 origin === 'video_deconstruct' 且所属 sourceVideoNodeId 的表格
  // 2. 绝不跨类型匹配 origin === 'video_storyboard' 的分镜表节点（即使已连线）
  // 3. 仅对完全没有 origin 标识的遗留通用表格做连线容错
  const connectedTableNodeIds = new Set(
    input.currentEdges
      .filter((edge) => edge.source === input.videoNodeId)
      .map((edge) => edge.target),
  );
  const existingNode = input.currentNodes.find((node) => {
    if (node.type !== 'table') return false;
    if (isVideoDeconstructDownstreamNode(node, input.videoNodeId)) return true;
    if (node.data?.origin === 'video_storyboard') return false;
    return !node.data?.origin && connectedTableNodeIds.has(node.id);
  });

  const nodeLabel = tableResult.title || input.label || '视频拆解表';

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
            title: nodeLabel,
            tableId: tableResult.tableId,
            tablePath: tableResult.tablePath,
            rowCount: tableResult.rowCount,
            columnCount: tableResult.columnCount,
            previewRows: tableResult.previewRows ?? [],
            status: 'ready',
            origin: VIDEO_DECONSTRUCT_ORIGIN,
            sourceVideoNodeId: input.videoNodeId,
          },
        },
      ],
    };
  }

  const newNodeId =
    input.createNodeId?.() ??
    input.tableResult.tableId;
  const width =
    Number.isFinite(input.videoNodeWidth) && input.videoNodeWidth > 0
      ? input.videoNodeWidth
      : 350;

  const hasStoryboardDownstream = input.currentNodes.some((n) => {
    const d = n.data as Record<string, unknown> | undefined;
    return d?.origin === 'video_storyboard' && d?.sourceVideoNodeId === input.videoNodeId;
  });
  const storyboardNode = hasStoryboardDownstream
    ? input.currentNodes.find((n) => (n.data as any)?.origin === 'video_storyboard' && (n.data as any)?.sourceVideoNodeId === input.videoNodeId)
    : undefined;
  const isStoryboardAtY = storyboardNode && Math.abs((storyboardNode.position?.y ?? 0) - input.videoPosition.y) < 50;

  const newNode: VideoDeconstructCreatedNode = {
    id: newNodeId,
    type: 'table',
    position: {
      x: input.videoPosition.x + width + VIDEO_DECONSTRUCT_DOWNSTREAM_GAP,
      y: isStoryboardAtY ? input.videoPosition.y - 320 : input.videoPosition.y,
    },
    selected: true,
    data: {
      label: nodeLabel,
      title: nodeLabel,
      tableId: tableResult.tableId,
      tablePath: tableResult.tablePath,
      columnCount: tableResult.columnCount,
      rowCount: tableResult.rowCount,
      previewRows: tableResult.previewRows ?? [],
      origin: VIDEO_DECONSTRUCT_ORIGIN,
      sourceVideoNodeId: input.videoNodeId,
      status: 'ready',
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
