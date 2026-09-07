import type { CapabilityCatalog } from '../../shared/api.ts';
import type { ExecutionContext } from '../executors/registry.ts';
import { buildContractView, buildUpstreamFingerprint, resolveModelView } from '../../shared/validation/compatKernel.ts';
import { resolveSlotOperation } from '../../shared/graph/feedSlot/resolveSlotOperation.ts';
import { resolveGenerationPrompt } from '../../shared/graph/generationPrompt.ts';
import { assembleEffectiveInputsFromSlots, deriveSlotLayout, hydrateSlotBindings, selectSlotOccupants, slotBindingConflicts,
  type FeedAsset, type SlotBindings, type SlotConflict } from '../../shared/graph/feedSlot/index.ts';
import { resolveExecutionMediaSource, type ResolveExecutionProjectFile } from './executionMediaSource.ts';
import { SeamGatewayError } from '../seam/SeamGatewayError.ts';

/** Resolve only occupied media. Standby URLs are never opened, parsed or sent to a provider. */
export function collectMaterialSlotInputs(data: Record<string, unknown>, ctx: ExecutionContext, catalog: CapabilityCatalog, resolveProjectFile?: ResolveExecutionProjectFile) {
  const params = (data.params ?? {}) as Record<string, unknown>;
  const kind = (data.materialType ?? 'text') as keyof NonNullable<CapabilityCatalog['defaults']>;
  const modelId = typeof params.model === 'string' ? params.model : catalog.defaults?.[kind];
  const model = resolveModelView(buildContractView(catalog), modelId);
  let operationId = typeof params.operation === 'string' ? params.operation : undefined;
  let layout = deriveSlotLayout(catalog, model?.id, operationId);
  const ordered: NonNullable<ExecutionContext['upstreamBindings']> = ctx.upstreamBindings ?? [...ctx.upstreamOutputs].map(([sourceNodeId, output]) => ({ sourceNodeId, output }));
  const texts: string[] = [];
  const seenText = new Set<string>();
  const feed: FeedAsset[] = [];
  const mediaByEdge = new Map<string, NonNullable<ExecutionContext['upstreamBindings']>[number]['output']['mediaAssets']>();
  const saved = data.slotBindings as SlotBindings | undefined;
  for (const [ordinal, binding] of ordered.entries()) {
    const output = binding.output;
    const edgeId = binding.edgeId ?? `feed-${binding.sourceNodeId}-${ordinal}`;
    const savedSlot = layout.slots.find((slot) => saved?.[slot.slot]?.some((item) => item.edgeId === edgeId));
    const type = output.mediaAssets?.[0]?.type ?? savedSlot?.type;
    if (!type) {
      if (!output.text?.trim()) throw new SeamGatewayError('input_waiting', `来源 ${binding.sourceNodeId} 尚无可用正文`);
      if (!seenText.has(binding.sourceNodeId)) { seenText.add(binding.sourceNodeId); texts.push(output.text.trim()); }
      continue;
    }
    if (feed.some((asset) => asset.edgeId === edgeId)) continue;
    const asset = output.mediaAssets?.[0];
    feed.push({ edgeId, sourceNodeId: binding.sourceNodeId, type, ordinal,
      availability: asset ? 'ready' : 'waiting', role: binding.role, targetSlot: binding.targetSlot,
      url: asset?.url, mimeType: asset?.mimeType, sizeBytes: asset?.sizeBytes, durationSec: asset?.durationSec });
    mediaByEdge.set(edgeId, output.mediaAssets);
  }
  operationId = resolveSlotOperation(catalog, model?.id, params.operation, kind,
    buildUpstreamFingerprint({ prompt: resolveGenerationPrompt(data, texts), localText: resolveGenerationPrompt(data),
      nodeFields: params, assets: feed }));
  if (model && !operationId) throw new SeamGatewayError('operation-required', '请选择生成方式');
  layout = deriveSlotLayout(catalog, model?.id, operationId);
  const hydrated = saved === undefined ? hydrateSlotBindings(feed, layout) : undefined;
  const bindings = saved ?? hydrated!.bindings;
  const conflicts = [...(data.slotConflicts ?? hydrated?.conflicts ?? []) as SlotConflict[], ...slotBindingConflicts(layout, bindings, feed)];
  if (conflicts.length) throw new SeamGatewayError('role_conflict', '已指定素材的卡槽或用途不再合法，请重新绑定');
  const selected = selectSlotOccupants(layout, bindings, feed, conflicts);
  for (const { occupant } of selected) {
    const asset = feed.find((item) => item.edgeId === occupant.edgeId);
    const output = mediaByEdge.get(occupant.edgeId);
    if (!asset || !output?.length) continue;
    // The selected output is singular. Multiple historical media must not become one occupant.
    if (output.length !== 1) throw new SeamGatewayError('input_unavailable', `来源 ${occupant.sourceNodeId} 尚未确定唯一输出`);
    asset.pathOrUrl = resolveExecutionMediaSource(output[0]!, { workspaceId: ctx.workspaceId, mediaDir: ctx.mediaDir, resolveProjectFile }) ?? undefined;
    if (!asset.pathOrUrl) asset.availability = 'unavailable';
  }
  const effective = assembleEffectiveInputsFromSlots({ layout, bindings, conflicts,
    nodeData: data, feedAssets: feed, incomingText: texts });
  if (effective.blockedInputs.length) {
    const failure = effective.blockedInputs[0]!;
    throw new SeamGatewayError(failure.reason, `来源 ${failure.sourceNodeId} 的已入坑素材尚不可用，请补齐或移除引用`);
  }
  if (effective.emptyRequiredSlots.length) throw new SeamGatewayError('min_unsatisfied', `还需要卡槽 ${effective.emptyRequiredSlots.join('、')} 的素材`);
  return { ...effective, texts, operationId, modelId: model?.id ?? modelId };
}
