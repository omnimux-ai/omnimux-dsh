import { createMaterialGatewayExecutor } from '../../plugins/omnimux-workflow/src/workflow/execution/materialGatewayExecutor.ts';
import { createDispatchingNodeExecutor } from '../../plugins/omnimux-workflow/src/workflow/execution/nodeExecutors.ts';
import { registerExecutor } from '../../plugins/omnimux-workflow/src/workflow/executors/registry.ts';
import { prepareExecutionSlotGraph } from '../../plugins/omnimux-workflow/src/shared/graph/feedSlot/prepareExecutionSlotGraph.ts';
import { findExecutionReadinessFailure } from '../../plugins/omnimux-workflow/src/shared/validation/executionReadiness.ts';
import { buildInitialOutputs } from '../../plugins/omnimux-workflow/src/workflow/execution/executionInputs.ts';
import { catalog } from './workflow-effective-input-fixtures.mjs';
export async function capture(input: any, origin: string, mediaRoot: string) {
  const requests: any[] = [];
  const snapshot = structuredClone(input);
  const graph = prepareExecutionSlotGraph(snapshot.nodes, snapshot.edges, catalog as any);
  const target = graph.nodes.find(n=>n.id===snapshot.targetId);
  if (!target) return {requests,error:{message:'Target missing'},snapshot};
  const readiness = findExecutionReadinessFailure([target],catalog as any,graph);
  if (readiness) return {requests,readiness,snapshot,prepared:graph};
  const gateway = {
    capabilities: async()=>catalog,
    submit: async(request: any)=>{requests.push(structuredClone(request));return {taskId:'offline-capture',mode:'stub'};},
    awaitTask: async()=>{ throw Object.assign(new Error('Offline fixture stops after gateway.submit; no generation or result finalization'),{code:'QA_CAPTURE_ONLY'}); },
  };
  try {
    const outputs = buildInitialOutputs({...graph,id:'qa_1760'},new Set([target.id]),{mediaDir:mediaRoot,resolveProjectFile:()=>{throw new Error('Filesystem media prohibited in fixture');}});
    registerExecutor(createMaterialGatewayExecutor({gateway:gateway as any}));
    await createDispatchingNodeExecutor({gateway:gateway as any,edges:graph.edges,mediaRoot,executionId:'qa_1760',abortController:new AbortController()}).executor(target as any,{
      getNodeOutput:(id: string)=>outputs[id],reportProgress(){},addMediaAsset(){},
    } as any);
    return {requests,snapshot,prepared:graph};
  } catch(error: any) {
    if (error.code === 'QA_CAPTURE_ONLY') return {requests,captureOnly:true,generationCompleted:false,snapshot,prepared:graph};
    return {requests,error:{message:error.message,code:error.code},snapshot,prepared:graph};
  }
}
