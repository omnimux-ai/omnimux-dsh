import type { CapabilityCatalog } from '../../api.ts';
import { buildUpstreamFingerprint, isMediaInputType, type UpstreamFingerprint } from '../../validation/compatKernel.ts';
import { buildEffectiveOpsUiState } from '../../validation/operationUi.ts';

/** Legacy omitted operation uses the existing selection policy; explicit intent is never replaced. */
export function resolveSlotOperation(catalog: CapabilityCatalog | null | undefined, modelId: string | undefined,
  operation: unknown, outputType: string | undefined, fingerprint: UpstreamFingerprint): string | undefined {
  if (typeof operation === 'string' && operation.trim()) return operation.trim();
  const current = buildEffectiveOpsUiState({ catalog, modelId, outputType, fingerprint });
  if (current.count > 0) return current.selectedOperationId;
  return buildEffectiveOpsUiState({ catalog, modelId, outputType, fingerprint: buildUpstreamFingerprint({ ...fingerprint,
    assets: fingerprint.assets.filter((asset) => !isMediaInputType(asset.type)) }) }).selectedOperationId;
}
