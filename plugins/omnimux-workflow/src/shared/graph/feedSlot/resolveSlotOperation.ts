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
  const isTextTask = outputType === 'text' || !outputType;

  // 文本节点多模态自适应：文本节点在界面上无 operation 切换菜单，老节点残留或默认写入的 'chat' 不得锁死卡槽。
  // 只要模型在执行中枢具备多模态媒体输入能力（如 vision_chat），卡槽解析一律优先采用多模态 operation，
  // 保证无论老节点还是新节点，均能根据模型规格呈现文件卡槽（图片/视频等）与添加按钮。
  if (isTextTask) {
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

  if (typeof operation === 'string' && operation.trim()) return operation.trim();

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
