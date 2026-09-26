/**
 * plugins/omnimux-apps/src/shared/reachabilityFilter.ts
 *
 * 运行时表单拓扑防御算法（Runtime Reachability Defense）：
 * 若 manifest 关联的 workflowBinding 携带 snapshot（包含 nodes 与 edges），
 * 针对每个表单字段映射的 nodeId 进行拓扑有效性核验：
 * 排除在快照中出度为 0 且入度为 0 的孤立死节点（多节点工作流下）。
 * 保证即使面对存量历史工程或历史副本，未连线的孤立输入项也不会渲染给终端用户。
 */

import type { ApplicationManifest, FormPropertySchema } from './manifest.ts';

export function filterReachableFormFields(
  manifest: ApplicationManifest,
): [string, FormPropertySchema][] {
  const entries = Object.entries(manifest.formSchema?.properties || {}) as [string, FormPropertySchema][];
  const snapshot = manifest.workflowBinding?.snapshot;
  if (!snapshot || !Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) {
    return entries;
  }
  if (snapshot.nodes.length <= 1) {
    return entries;
  }

  const nodeInDegrees = new Map<string, number>();
  const nodeOutDegrees = new Map<string, number>();
  for (const n of snapshot.nodes) {
    if (n && typeof n === 'object' && 'id' in n && typeof (n as { id?: unknown }).id === 'string') {
      const id = (n as { id: string }).id;
      nodeInDegrees.set(id, 0);
      nodeOutDegrees.set(id, 0);
    }
  }

  for (const e of snapshot.edges) {
    if (!e || typeof e !== 'object') continue;
    const edgeObj = e as { source?: unknown; target?: unknown };
    const source = typeof edgeObj.source === 'string' ? edgeObj.source : undefined;
    const target = typeof edgeObj.target === 'string' ? edgeObj.target : undefined;
    if (target && nodeInDegrees.has(target)) {
      nodeInDegrees.set(target, (nodeInDegrees.get(target) || 0) + 1);
    }
    if (source && nodeOutDegrees.has(source)) {
      nodeOutDegrees.set(source, (nodeOutDegrees.get(source) || 0) + 1);
    }
  }

  return entries.filter(([key]) => {
    const mapping = manifest.fieldMappings?.[key];
    if (!mapping?.nodeId) return true;
    if (nodeInDegrees.has(mapping.nodeId)) {
      const inDeg = nodeInDegrees.get(mapping.nodeId) || 0;
      const outDeg = nodeOutDegrees.get(mapping.nodeId) || 0;
      // 纯孤立悬挂节点：既无下游连接输出，也无上游输入，纯草稿死节点 -> 运行时剔除
      if (inDeg === 0 && outDeg === 0) {
        return false;
      }
    }
    return true;
  });
}
