import { sanitizeNodes, sanitizeEdges } from '../../plugins/omnimux-workflow/src/canvas/bridge/persistSanitize';
import { workspaceSnapshotSchema } from '../../plugins/omnimux-workflow/src/workflow/workspace/snapshotSchema';
import { SNAPSHOT_SCHEMA_VERSION } from '../../plugins/omnimux-workflow/src/shared/canvasTypes';
export function serialize(graph:any) {
  const now=new Date().toISOString();
  const snapshot=workspaceSnapshotSchema.parse({schemaVersion:SNAPSHOT_SCHEMA_VERSION,id:'qa-1785',name:'参数隔离验证',version:1,nodes:sanitizeNodes(structuredClone(graph.nodes)),edges:sanitizeEdges(structuredClone(graph.edges)),metadata:{createdAt:now,updatedAt:now,nodeCount:graph.nodes.length}});
  return {...snapshot,targetId:graph.targetId};
}
