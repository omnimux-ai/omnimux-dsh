import type { CapabilityCatalog } from '../../shared/api.ts';
import type { ExecutionContext } from '../executors/registry.ts';
import { buildContractView, buildUpstreamFingerprint, resolveModelView } from '../../shared/validation/compatKernel.ts';
import { resolveSlotOperation } from '../../shared/graph/feedSlot/resolveSlotOperation.ts';
import { resolveGenerationPrompt } from '../../shared/graph/generationPrompt.ts';
import { assembleEffectiveInputsFromSlots, deriveSlotLayout, selectSlotOccupants,
  type FeedAsset, type SlotBindings, type SlotConflict } from '../../shared/graph/feedSlot/index.ts';
import { resolveExecutionMediaSource, type ResolveExecutionProjectFile } from './executionMediaSource.ts';
import { SeamGatewayError } from '../seam/SeamGatewayError.ts';
import { effectiveInputDisplay } from '../../shared/graph/feedSlot/effectiveInputDisplay.ts';

/** Resolve only occupied media. Standby URLs are never opened, parsed or sent to a provider. */
export function collectMaterialSlotInputs(data: Record<string, unknown>, ctx: ExecutionContext, catalog: CapabilityCatalog, resolveProjectFile?: ResolveExecutionProjectFile) {
  const params = (data.params ?? {}) as Record<string, unknown>;
  const kind = (data.materialType ?? 'text') as keyof NonNullable<CapabilityCatalog['defaults']>;
  const modelId = typeof params.model === 'string' ? params.model : catalog.defaults?.[kind];
  const model = resolveModelView(buildContractView(catalog), modelId);
  let operationId = typeof params.operation === 'string' ? params.operation : undefined;
  let layout = deriveSlotLayout(catalog, model?.id, operationId);
  const currentVersion = data.inputBindingVersion === 1;
  const ordered: NonNullable<ExecutionContext['upstreamBindings']> = currentVersion
    ? Object.entries((data.slotBindings ?? {}) as SlotBindings).flatMap(([targetSlot, occupants]) => occupants
      .filter(occupant => occupant.use !== 'inactive').map(occupant => ({
        edgeId: occupant.edgeId, sourceNodeId: occupant.sourceNodeId, targetSlot, role: occupant.role,
        output: ctx.upstreamBindings !== undefined
          ? ctx.upstreamBindings.find(binding => binding.edgeId === occupant.edgeId && binding.sourceNodeId === occupant.sourceNodeId)?.output ?? {}
          : ctx.upstreamOutputs.get(occupant.sourceNodeId) ?? {},
      })))
    : ctx.upstreamBindings ?? [...ctx.upstreamOutputs].map(([sourceNodeId, output]) => ({ sourceNodeId, output }));
  const texts: string[] = [];
  const seenText = new Set<string>();
  const feed: FeedAsset[] = [];
  const mediaByEdge = new Map<string, NonNullable<ExecutionContext['upstreamBindings']>[number]['output']['mediaAssets']>();
  const saved = data.slotBindings as SlotBindings | undefined;
  for (const [ordinal, binding] of ordered.entries()) {
    const output = binding.output;
    const edgeId = binding.edgeId ?? `feed-${binding.sourceNodeId}-${ordinal}`;
    const savedSlot = layout.slots.find((slot) => saved?.[slot.slot]?.some((item) => item.edgeId === edgeId));
    const type = output.mediaAssets?.[0]?.type ?? (currentVersion && output.text !== undefined ? 'text' : undefined) ?? savedSlot?.type;
    if (!type) {
      if (!output.text?.trim()) continue;
      if (!seenText.has(binding.sourceNodeId)) { seenText.add(binding.sourceNodeId); texts.push(output.text.trim()); }
      continue;
    }
    if (feed.some((asset) => asset.edgeId === edgeId)) continue;
    const asset = output.mediaAssets?.[0];
    feed.push({ edgeId, sourceNodeId: binding.sourceNodeId, type, ordinal,
      outputId: asset?.assetId ?? asset?.relativePath ?? asset?.path ?? asset?.url ?? output.assetId,
      availability: asset || (type === 'text' && output.text?.trim()) ? 'ready'
        : (currentVersion && ctx.upstreamBindings !== undefined
          ? ctx.upstreamBindings.some(item => item.edgeId === edgeId && item.sourceNodeId === binding.sourceNodeId)
          : ctx.upstreamBindings?.some(item => item.edgeId === edgeId && item.sourceNodeId === binding.sourceNodeId)
            || ctx.upstreamOutputs.has(binding.sourceNodeId)) ? 'waiting' : 'unavailable',
      ...(type === 'text' ? { textContent: output.text } : {}), role: binding.role, targetSlot: binding.targetSlot,
      url: asset?.url, pathOrUrl: asset?.relativePath || asset?.path, mimeType: asset?.mimeType, sizeBytes: asset?.sizeBytes, durationSec: asset?.durationSec });
    mediaByEdge.set(edgeId, output.mediaAssets);
  }
  operationId = currentVersion && typeof params.operation === 'string' && params.operation.trim()
    ? params.operation.trim()
    : resolveSlotOperation(catalog, model?.id, params.operation, kind,
      buildUpstreamFingerprint({ prompt: resolveGenerationPrompt(data, texts), localText: resolveGenerationPrompt(data),
        nodeFields: params, assets: feed }));
  if (model && !operationId) throw new SeamGatewayError('operation-required', '请选择生成方式');
  layout = deriveSlotLayout(catalog, model?.id, operationId);
  const plainSpeech = !currentVersion && kind === 'audio' && operationId === 'text_to_speech';
  const loaded = effectiveInputDisplay(layout, feed, plainSpeech ? {} : saved,
    plainSpeech ? [] : (data.slotConflicts ?? []) as SlotConflict[], [], (data.slotStandbyEdgeIds ?? []) as string[],
    currentVersion ? 1 : undefined);
  const { bindings, conflicts } = loaded;
  if (loaded.requiredUnavailable) {
    const reason = currentVersion ? loaded.records.find(record => record.occupant.edgeId === loaded.requiredUnavailable!.occupant.edgeId)?.reasonCode : undefined;
    throw new SeamGatewayError(reason === 'input_waiting' ? reason : 'input_unavailable', `来源 ${loaded.requiredUnavailable.occupant.sourceNodeId} 的素材尚不可用，请替换或停用`);
  }
  const selected = selectSlotOccupants(layout, bindings, feed, conflicts);
  for (const { occupant } of selected) {
    const asset = feed.find((item) => item.edgeId === occupant.edgeId);
    const output = mediaByEdge.get(occupant.edgeId);
    if (!asset || !output?.length) continue;
    // The selected output is singular. Multiple historical media must not become one occupant.
    if (output.length !== 1) throw new SeamGatewayError('input_unavailable', `来源 ${occupant.sourceNodeId} 尚未确定唯一输出`);
    asset.pathOrUrl = resolveExecutionMediaSource(output[0]!, { workspaceId: ctx.workspaceId, mediaDir: ctx.mediaDir, resolveProjectFile }) ?? undefined;
    if (!asset.pathOrUrl) throw new SeamGatewayError('input_unavailable', `来源 ${occupant.sourceNodeId} 的已选素材无法解析，请替换或移除引用`);
  }
  const effective = assembleEffectiveInputsFromSlots({ layout, bindings, conflicts,
    nodeData: data, feedAssets: feed, incomingText: texts });
  if (effective.blockedInputs.length) {
    const failure = effective.blockedInputs[0]!;
    throw new SeamGatewayError(failure.reason, `来源 ${failure.sourceNodeId} 的已入坑素材尚不可用，请补齐或移除引用`);
  }
  if (effective.emptyRequiredSlots.length) throw new SeamGatewayError('min_unsatisfied', `还需要卡槽 ${effective.emptyRequiredSlots.join('、')} 的素材`);
  const textSlot = layout.slots.find(slot => slot.type === 'text' && slot.composition);
  const localText = layout.acceptsText === false || textSlot && !textSlot.valueSources?.includes('local_field') ? '' : resolveGenerationPrompt(data);
  const textInputs = loaded.records.filter(record => record.state === 'ready' && record.slot.type === 'text').map(record => ({
    sourceNodeId: record.occupant.sourceNodeId, edgeId: record.occupant.edgeId, outputId: record.asset?.outputId,
    role: record.slot.role, targetSlot: record.slot.slot, textContent: record.asset?.textContent ?? '',
  }));
  return { ...effective, ...(currentVersion ? { localText, textInputs } : {}),
    texts: layout.acceptsText === false ? [] : texts, operationId, modelId: model?.id ?? modelId };
}
