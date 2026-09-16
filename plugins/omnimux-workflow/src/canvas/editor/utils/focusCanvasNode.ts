/**
 * 资产抽屉 / 工作流组定位到画布节点：把视口中心移到节点附近并单选该节点。
 * 抽出纯函数，避免 CanvasEditor 内联闭包直接引用未解构的 React Flow API。
 *
 * 坐标语义：节点 `position` 一律是绝对 flow 坐标（组节点无 parentId，
 * 天然满足）；组节点带 `width`/`height` 时按容器中心对齐，
 * 否则保持既有的 `position + FOCUS_NODE_OFFSET` 行为。
 */

export const FOCUS_NODE_OFFSET = 100;
export const FOCUS_NODE_ZOOM = 1;
export const FOCUS_NODE_DURATION = 800;

export type FocusableCanvasNode = {
  id: string;
  position: { x: number; y: number };
  /** 容器节点（工作流组）的实测宽高；普通节点通常没有。 */
  width?: number | null;
  height?: number | null;
  selected?: boolean;
};

export type FocusCanvasNodePlan =
  | { focused: false }
  | {
      focused: true;
      nodeId: string;
      x: number;
      y: number;
      zoom: number;
      duration: number;
    };

/**
 * 目标节点的视口中心点：容器节点（工作流组）有实测宽高时取容器中心，
 * 否则沿用节点卡偏移常量。导出以便单测直接钉坐标。
 */
export function focusPointForNode(node: FocusableCanvasNode): { x: number; y: number } {
  const width = typeof node?.width === 'number' && Number.isFinite(node.width) && node.width > 0 ? node.width : 0;
  const height = typeof node?.height === 'number' && Number.isFinite(node.height) && node.height > 0 ? node.height : 0;
  if (width > 0 && height > 0) {
    return { x: node.position.x + width / 2, y: node.position.y + height / 2 };
  }
  return { x: node.position.x + FOCUS_NODE_OFFSET, y: node.position.y + FOCUS_NODE_OFFSET };
}

export function planFocusCanvasNode(
  nodes: readonly FocusableCanvasNode[] | undefined,
  nodeId: string,
): FocusCanvasNodePlan {
  if (!nodeId || !Array.isArray(nodes)) return { focused: false };
  const target = nodes.find((node) => node.id === nodeId);
  if (!target) return { focused: false };
  const point = focusPointForNode(target);
  return {
    focused: true,
    nodeId: target.id,
    x: point.x,
    y: point.y,
    zoom: FOCUS_NODE_ZOOM,
    duration: FOCUS_NODE_DURATION,
  };
}

export function applyFocusCanvasNode<T extends FocusableCanvasNode>(opts: {
  nodes: readonly T[] | undefined;
  nodeId: string;
  setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void;
  setNodes: (updater: (nds: T[]) => T[]) => void;
}): boolean {
  const plan = planFocusCanvasNode(opts.nodes, opts.nodeId);
  if (!plan.focused) return false;
  opts.setCenter(plan.x, plan.y, { zoom: plan.zoom, duration: plan.duration });
  opts.setNodes((nds) =>
    nds.map((node) => ({
      ...node,
      selected: node.id === opts.nodeId,
    })),
  );
  return true;
}
