import type { CapabilityCatalog } from '../../api.ts';
import {
  buildContractView,
  buildUpstreamFingerprint,
  isMediaInputType,
  resolveModelView,
  type UpstreamFingerprint,
} from '../../validation/compatKernel.ts';
import { buildEffectiveOpsUiState } from '../../validation/operationUi.ts';

/** Legacy omitted operation uses the existing selection policy; explicit intent is never replaced. */
export function resolveSlotOperation(
  catalog: CapabilityCatalog | null | undefined,
  modelId: string | undefined,
  operation: unknown,
  outputType: string | undefined,
  fingerprint: UpstreamFingerprint,
): string | undefined {
  if (typeof operation === 'string' && operation.trim()) return operation.trim();

  // 文本节点多模态支持：当模型支持多模态媒体输入且未显式指定操作时，
  // 槽位解析优先采用多模态 operation（如 vision_chat），以反映执行中枢模型契约规格所允许的文件类型与数量。
  if (outputType === 'text' || !outputType) {
    const view = buildContractView(catalog);
    const model = resolveModelView(view, modelId);
    if (model) {
      const multimodal = model.operations.find(
        (op) =>
          op.listed &&
          op.output.type === 'text' &&
          op.inputs.some((input) => input.type !== 'text' && input.role !== 'prompt'),
      );
      if (multimodal) return multimodal.id;
    }
  }

  const current = buildEffectiveOpsUiState({ catalog, modelId, outputType, fingerprint });
  if (current.count > 0) return current.selectedOperationId;
  return buildEffectiveOpsUiState({
    catalog,
    modelId,
    outputType,
    fingerprint: buildUpstreamFingerprint({
      ...fingerprint,
      assets: fingerprint.assets.filter((asset) => !isMediaInputType(asset.type)),
    }),
  }).selectedOperationId;
}
