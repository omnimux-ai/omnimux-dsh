import type { CapabilityCatalog } from '../../shared/api.ts';
import { buildContractView, matchOperationInputs, resolveModelView } from '../../shared/validation/compatKernel.ts';
import { buildEffectiveOpsUiState } from '../../shared/validation/operationUi.ts';
import type { ReferenceAssetPayload, SubmitRequest } from './gateway.ts';
import { SeamGatewayError } from './SeamGatewayError.ts';
import { submissionFingerprint, submissionReferences } from './submissionInputs.ts';

function submissionModel(req: SubmitRequest, catalog: CapabilityCatalog) {
  if (req.model !== undefined && typeof req.model !== 'string') {
    throw new SeamGatewayError('model-not-allowed', '模型标识无效，请重新选择模型');
  }
  const id = req.model?.trim() || catalog.defaults?.[req.capability] || '';
  const model = resolveModelView(buildContractView(catalog), id);
  if (!model || !catalog[req.capability]?.some((row) => row.id === model.id)) {
    throw new SeamGatewayError('model-not-allowed', '请选择此类节点白名单中可用的模型');
  }
  if (model.synthesized) {
    throw new SeamGatewayError('contract_missing', '模型目录缺少生成方式合同，请刷新目录后重试');
  }
  if (!model.operations.some((op) => op.listed && op.output.type === req.capability)) {
    throw new SeamGatewayError('model-not-allowed', '当前模型没有此类节点可用的生成方式');
  }
  return model;
}

/** Only the executor may resolve an omitted operation using the shared canvas policy. */
export function resolveExecutorSubmission(req: SubmitRequest, catalog: CapabilityCatalog): SubmitRequest {
  const model = submissionModel(req, catalog);
  if (req.operation !== undefined) return resolveCanvasSubmission(req, catalog);
  const state = buildEffectiveOpsUiState({
    catalog, modelId: model.id, outputType: req.capability, fingerprint: submissionFingerprint(req),
  });
  if (state.blockGenerate || !state.selectedOperationId) {
    throw new SeamGatewayError(state.reasonCode ?? 'operation-required', state.reasonMessage ?? '请选择生成方式');
  }
  return resolveCanvasSubmission({ ...req, model: model.id, operation: state.selectedOperationId }, catalog);
}

/** SubmitGuard: accepting connections is not sufficient to submit a new task. */
export function resolveCanvasSubmission(req: SubmitRequest, catalog: CapabilityCatalog): SubmitRequest {
  const model = submissionModel(req, catalog);
  if (typeof req.operation !== 'string' || !req.operation.trim()) throw new SeamGatewayError('operation-required', '请选择生成方式后再提交');
  const operation = model.operations.find((op) => op.id === req.operation);
  if (!operation?.listed || operation.output.type !== req.capability) {
    throw new SeamGatewayError('operation-not-allowed', '当前模型不支持所选生成方式，请重新选择');
  }
  const fingerprint = submissionFingerprint(req);
  // Limit the matcher to the requested operation; never replace an explicit creative choice.
  const match = matchOperationInputs(operation, fingerprint);
  const failure = !match.accepts ? match.rejections[0] : !match.ready ? match.pending[0] : undefined;
  if (!match.accepts || !match.ready) {
    throw new SeamGatewayError(failure?.code ?? 'operation_incompatible', failure?.message ?? '当前输入尚不满足生成要求');
  }
  const bindings = [...match.bindings];
  const normalized = new Map<ReferenceAssetPayload, ReferenceAssetPayload>();
  const references = submissionReferences(req);
  for (const [index, asset] of fingerprint.mediaAssets.entries()) {
    const bindingIndex = bindings.findIndex((binding) => binding.sourceNodeId === asset.sourceNodeId
      && binding.edgeId === asset.edgeId && binding.type === asset.type
      && (!asset.targetSlot || binding.slot === asset.targetSlot) && (!asset.role || binding.role === asset.role));
    if (bindingIndex < 0) throw new SeamGatewayError('role_conflict', `来源 ${asset.sourceNodeId} 的用途与目标槽位不一致`);
    const [binding] = bindings.splice(bindingIndex, 1);
    const slot = operation.inputs.find((input) => input.slot === binding!.slot)!;
    const durationRequired = [slot.minDurationSec, slot.maxDurationSec, slot.totalMinDurationSec,
      slot.totalMaxDurationSec, slot.combinedOutputMaxDurationSec].some(Number.isFinite);
    if ((slot.allowedMimes?.length && !asset.mimeType) || (Number.isFinite(slot.maxSizeMb) && asset.sizeBytes === undefined)
      || (durationRequired && asset.durationSec === undefined)) {
      throw new SeamGatewayError('metadata_required', `来源 ${asset.sourceNodeId} 缺少槽位 ${slot.slot} 校验所需的素材信息，请重新读取素材`);
    }
    normalized.set(references[index]!, { ...references[index]!, pathOrUrl: asset.url!, role: binding!.role as ReferenceAssetPayload['role'],
      ...(references[index]!.targetSlot ? {} : { targetSlot: binding!.slot }),
      ...(asset.mimeType ? { mimeType: asset.mimeType } : {}),
      ...(asset.sizeBytes !== undefined ? { sizeBytes: asset.sizeBytes } : {}),
      ...(asset.durationSec !== undefined ? { durationSec: asset.durationSec } : {}) });
  }
  const trackReference = req.audioTrack && references.find((ref) => ref.pathOrUrl === req.audioTrack!.pathOrUrl
    && ref.role === req.audioTrack!.role && ref.targetSlot === req.audioTrack!.targetSlot);
  return { ...req, model: model.id,
    ...(req.references ? { references: req.references.map((ref) => normalized.get(ref)!) } : {}),
    ...(trackReference ? { audioTrack: normalized.get(trackReference)! } : {}) };
}
