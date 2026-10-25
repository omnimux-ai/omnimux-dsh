/**
 * 「创建可复用模板」的范围解析与落库扁平化（Issue 3659 / 3662）。
 *
 * 模板范围有两个来源：
 *  1. 组右键「保存模板」：范围 = 该组（直接子节点 + 组内连线），沿用既有语义；
 *  2. 「添加节点」面板底部入口卡（Dock / 右键钻取）：范围 = **整块画布** —— 该入口的
 *     文案就是「把当前画布保存为可复用模板」，它此前从不设置范围，保存会报「缺少分组」。
 *
 * 模板是**扁平快照**：插入路径 `planInstantiateTemplate` 会剥掉 `parentId`/`extent`
 * 并按包围盒重排坐标。所以落库前统一走 `toFlatTemplateSnapshot` 丢掉父引用——
 * 两个范围都只把子节点放进 payload，组容器不在模板内，留着 `parentId` 就是指向
 * 「不在模板内的组」的悬空引用。画布范围另需把组内子节点的相对坐标还原为绝对坐标。
 *
 * 纯函数：不读 React、不读 store，可在 node --test 里直接验证。
 */

import { childIdsOfGroup, toAbsoluteCoordinates } from './nodeVisualMath.ts';

/**
 * 只声明本模块真正读取的字段。
 *
 * `extent` / `position` 按 xyflow 的真实取值放宽：`extent` 可能是 `'parent'`、
 * `null` 或坐标范围元组，写死成 `string` 会让调用方的 `CanvasNode` 不满足约束。
 */
export interface TemplateScopeNode {
  id: string;
  type?: string;
  parentId?: string | null;
  extent?: unknown;
  position?: { x: number; y: number } | null;
}

export interface TemplateScopeEdge {
  source: string;
  target: string;
}

export interface WorkflowTemplateScope<N, E> {
  /** 进入模板的节点（画布范围下组内子节点已绝对化、无 parentId/extent）。 */
  nodes: N[];
  /** 只保留两端都在范围内的连线。 */
  edges: E[];
  /** 模态提示用的节点数（= `nodes.length`）。 */
  nodeCount: number;
}

/**
 * 解析模板范围。
 *
 * @param nodes 画布全部节点（含 `type === 'group'` 的组容器）。
 * @param edges 画布全部连线。
 * @param groupId 组右键入口给出的目标组；缺省/空表示「整块画布」。
 */
export function resolveWorkflowTemplateScope<
  N extends TemplateScopeNode,
  E extends TemplateScopeEdge,
>(nodes: N[], edges: E[], groupId?: string | null): WorkflowTemplateScope<N, E> {
  // `childIdsOfGroup` 是「某组直接子节点」的单点真源；这里只把 xyflow 的
  // `parentId: string | null` 归一成它声明的形状，不复制其语义。
  const scopedIds = groupId
    ? new Set(
        childIdsOfGroup(
          nodes.map((node) => ({ id: node.id, type: node.type, parentId: node.parentId ?? undefined })),
          groupId,
        ),
      )
    : new Set(nodes.filter((node) => node.type !== 'group').map((node) => node.id));

  // 组容器位置表：画布范围下用来把组内子节点的相对坐标还原为绝对坐标。
  const groupPositions = new Map<string, { x: number; y: number }>();
  if (!groupId) {
    for (const node of nodes) {
      if (node.type === 'group') groupPositions.set(node.id, node.position ?? { x: 0, y: 0 });
    }
  }

  const scopedNodes = nodes
    .filter((node) => scopedIds.has(node.id))
    .map((node): N => {
      // 组范围：子节点坐标本就相对同一个组容器，插入时整体平移即可，保持原样。
      if (groupId || !node.parentId) return node;

      const groupPosition = groupPositions.get(node.parentId);
      const { parentId: _parentId, extent: _extent, ...rest } = node;
      return {
        ...rest,
        position: toAbsoluteCoordinates(node.position ?? { x: 0, y: 0 }, groupPosition ?? { x: 0, y: 0 }),
      } as N;
    });

  const scopedEdges = edges.filter((edge) => scopedIds.has(edge.source) && scopedIds.has(edge.target));

  return { nodes: scopedNodes, edges: scopedEdges, nodeCount: scopedNodes.length };
}

/**
 * 落库前的扁平化：丢掉 `parentId`/`extent`，其余字段与顺序不动。
 *
 * 模板里没有组容器，所以任何父引用都是悬空的；插入路径虽然也会剥一次，但模板 JSON
 * 自身应当自洽。幂等：对已扁平化的节点再调一次结果不变。
 *
 * `sanitizeNodes` 只在 `typeof parentId === 'string'` / `extent === 'parent'` 时保留
 * 这两个字段，因此置 `undefined` 即可，不必改动持久化共用的 `sanitizeNodes`。
 */
export function toFlatTemplateSnapshot<N extends TemplateScopeNode>(nodes: N[]): N[] {
  return nodes.map((node): N => {
    if (node.parentId === undefined && node.extent === undefined) return node;
    const { parentId: _parentId, extent: _extent, ...rest } = node;
    return rest as N;
  });
}
