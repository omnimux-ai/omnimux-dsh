/**
 * 视频节点「分镜表」下游表格节点规划纯函数。
 *
 * 与 planVideoDeconstructDownstream 同构，独立 origin 严格隔离（不与内容拆解表互串）：
 * - `planVideoStoryboardProvisioning`：点击「分镜表」瞬间在视频右侧预建/激活下游分镜表节点
 *   （running + generating、out→in 连线），源视频节点零侵入；已在下游节点中执行时 noop 防抖；
 * - `planVideoStoryboardSettlement`：后端返回后就地收敛目标节点（成功回填表格产物，失败落错误态）。
 *
 * 位置约定：x = videoX + width + 120，y = videoY + 320（与 server 侧一致）。
 * Handle id 沿用 CanvasNodeHandle 的 `in` / `out`，使 React Flow 正确渲染连线。
 * 纯函数、无 React 依赖。
 */

export const VIDEO_STORYBOARD_ORIGIN = 'video_storyboard';
export const VIDEO_STORYBOARD_SOURCE_HANDLE = 'out';
export const VIDEO_STORYBOARD_TARGET_HANDLE = 'in';
export const VIDEO_STORYBOARD_DOWNSTREAM_GAP = 120;
export const VIDEO_STORYBOARD_DOWNSTREAM_Y_OFFSET = 320;

export interface VideoStoryboardGraphNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
  position?: { x: number; y: number };
  selected?: boolean;
}

export interface VideoStoryboardGraphEdge {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface StoryboardTableOutputData {
  tableId: string;
  tablePath: string;
  title?: string;
  rowCount: number;
  columnCount: number;
  previewRows?: unknown[];
}

export interface VideoStoryboardNodePatch {
  nodeId: string;
  data: Record<string, unknown>;
}

export interface VideoStoryboardCreatedNode {
  id: string;
  type: 'table';
  position: { x: number; y: number };
  selected: boolean;
  data: Record<string, unknown>;
}

export interface VideoStoryboardProvisionPlan {
  mode: 'create' | 'update' | 'noop';
  targetNodeId: string;
  addNodes: VideoStoryboardCreatedNode[];
  addEdges: VideoStoryboardGraphEdge[];
  nodePatches: VideoStoryboardNodePatch[];
}

export interface PlanVideoStoryboardProvisioningInput {
  videoNodeId: string;
  videoPosition: { x: number; y: number };
  videoNodeWidth: number;
  /** 新节点标题（调用方传 i18n 文案），缺省「视频分镜表」。 */
  label?: string;
  currentNodes: VideoStoryboardGraphNode[];
  currentEdges: VideoStoryboardGraphEdge[];
  createNodeId?: () => string;
}

export interface PlanVideoStoryboardSettlementInput {
  targetNodeId: string;
  label?: string;
  tableResult?: StoryboardTableOutputData;
  error?: string;
  /** 失败时的上游来源描述（渠道/接口名），原样写入 executionUpstream。 */
  upstream?: string;
  /** 由调用方传入并原样写入，用于在结算后仍保留节点来源标记。 */
  origin?: string;
  /** 由调用方传入并原样写入，用于在结算后仍保留源视频归属。 */
  sourceVideoNodeId?: string;
}

export interface VideoStoryboardSettlementPlan {
  targetNodeId: string;
  nodePatches: VideoStoryboardNodePatch[];
}

export function isVideoStoryboardDownstreamNode(
  node: VideoStoryboardGraphNode,
  videoNodeId: string,
): boolean {
  const data = node.data;
  if (!data) return false;
  if (data.origin !== VIDEO_STORYBOARD_ORIGIN) return false;
  if (node.type !== 'table') return false;
  return data.sourceVideoNodeId === videoNodeId;
}

function edgeBetween(source: string, target: string): VideoStoryboardGraphEdge {
  return {
    id: `edge_${source}_${target}`,
    source,
    target,
    sourceHandle: VIDEO_STORYBOARD_SOURCE_HANDLE,
    targetHandle: VIDEO_STORYBOARD_TARGET_HANDLE,
  };
}

function hasDrawableEdge(
  edges: VideoStoryboardGraphEdge[],
  source: string,
  target: string,
): boolean {
  return edges.some(
    (edge) =>
      edge.source === source &&
      edge.target === target &&
      (edge.sourceHandle === undefined ||
        edge.sourceHandle === null ||
        edge.sourceHandle === VIDEO_STORYBOARD_SOURCE_HANDLE) &&
      (edge.targetHandle === undefined ||
        edge.targetHandle === null ||
        edge.targetHandle === VIDEO_STORYBOARD_TARGET_HANDLE),
  );
}

/**
 * 阶段一：乐观预建占位规划（点击「分镜表」立即调用）
 * 在源视频右下方创建或激活下游分镜表节点（running + generating），源视频本身不做任何状态修改。
 *
 * - 已有同源下游 table（origin === 'video_storyboard' 且 sourceVideoNodeId 匹配）→ update；
 *   已处于 running/generating 时返回 noop 防抖；
 * - 未标记 origin 但已与该视频连线的遗留通用表格 → 沿用单一下游约束，就地 update；
 * - origin === 'video_deconstruct' 等其它来源的表格节点严格隔离，绝不跨类型匹配。
 */
export function planVideoStoryboardProvisioning(
  input: PlanVideoStoryboardProvisioningInput,
): VideoStoryboardProvisionPlan {
  const connectedTableNodeIds = new Set(
    input.currentEdges
      .filter((edge) => edge.source === input.videoNodeId)
      .map((edge) => edge.target),
  );

  const existingNode = input.currentNodes.find((node) => {
    if (node.type !== 'table') return false;
    if (isVideoStoryboardDownstreamNode(node, input.videoNodeId)) return true;
    // 其它来源（含 video_deconstruct）严格隔离，不参与分镜表单一下游匹配
    if (node.data?.origin) return false;
    return connectedTableNodeIds.has(node.id);
  });

  const nodeLabel = input.label || '视频分镜表';

  if (existingNode) {
    // 已在下游节点中执行时，重复点击只防抖，不重复创建/重置
    if (
      existingNode.data?.executionStatus === 'running' ||
      existingNode.data?.status === 'generating'
    ) {
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
          // 只写运行态字段；不写 tableId/tablePath 等结果字段，重试期间保留旧产物可用
          data: {
            label: nodeLabel,
            title: nodeLabel,
            materialType: 'table',
            status: 'generating',
            executionStatus: 'running',
            executionError: undefined,
            origin: VIDEO_STORYBOARD_ORIGIN,
            sourceVideoNodeId: input.videoNodeId,
          },
        },
      ],
    };
  }

  const newNodeId =
    input.createNodeId?.() ??
    `node_table_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const width =
    Number.isFinite(input.videoNodeWidth) && input.videoNodeWidth > 0
      ? input.videoNodeWidth
      : 350;

  const newNode: VideoStoryboardCreatedNode = {
    id: newNodeId,
    type: 'table',
    position: {
      x: input.videoPosition.x + width + VIDEO_STORYBOARD_DOWNSTREAM_GAP,
      y: input.videoPosition.y + VIDEO_STORYBOARD_DOWNSTREAM_Y_OFFSET,
    },
    selected: true,
    data: {
      label: nodeLabel,
      title: nodeLabel,
      materialType: 'table',
      status: 'generating',
      executionStatus: 'running',
      tableId: '',
      tablePath: '',
      columnCount: 0,
      rowCount: 0,
      previewRows: [],
      origin: VIDEO_STORYBOARD_ORIGIN,
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
 * 阶段二：结果结算规划（后端返回成功/失败时调用）
 * 仅 patch 下游分镜表节点自身，源视频不受影响；失败不伪造 tableId。
 */
export function planVideoStoryboardSettlement(
  input: PlanVideoStoryboardSettlementInput,
): VideoStoryboardSettlementPlan {
  const tableResult = input.tableResult;
  if (input.error || !tableResult?.tableId || !tableResult.tablePath) {
    return {
      targetNodeId: input.targetNodeId,
      nodePatches: [
        {
          nodeId: input.targetNodeId,
          data: {
            status: 'failed',
            executionStatus: 'error',
            executionError: input.error || '分镜表生成失败',
            executionUpstream: input.upstream,
          },
        },
      ],
    };
  }

  const label = tableResult.title || input.label || '视频分镜表';
  const data: Record<string, unknown> = {
    label,
    title: label,
    tableId: tableResult.tableId,
    tablePath: tableResult.tablePath,
    rowCount: tableResult.rowCount,
    columnCount: tableResult.columnCount,
    previewRows: tableResult.previewRows ?? [],
    status: 'ready',
    executionStatus: 'completed',
    executionError: undefined,
    executionUpstream: undefined,
  };
  // origin / sourceVideoNodeId 由调用方传入并原样写入；缺省不落键，避免清空既有归属
  if (input.origin !== undefined) data.origin = input.origin;
  if (input.sourceVideoNodeId !== undefined) {
    data.sourceVideoNodeId = input.sourceVideoNodeId;
  }

  return {
    targetNodeId: input.targetNodeId,
    nodePatches: [{ nodeId: input.targetNodeId, data }],
  };
}
