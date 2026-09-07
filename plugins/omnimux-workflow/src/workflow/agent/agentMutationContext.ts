import type { CanvasMutationRuntimeContext } from '../../shared/graph/canvasInputMutationGateway.ts';
import type { CapabilityCatalog } from '../../shared/api.ts';
import type { WorkflowAgentDeps } from './agentToolShared.ts';

/** Agent and canvas mutations share the catalog-backed input contract. */
export function mutationContext(deps: WorkflowAgentDeps): CanvasMutationRuntimeContext {
  const catalog = typeof deps.getCatalog === 'function' ? deps.getCatalog() : null;
  return { catalog: (catalog ?? null) as CapabilityCatalog | null, preferredModels: deps.getGenerationPreferences?.() };
}
