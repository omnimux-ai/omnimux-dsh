import type { CapabilityCatalog, CapabilityModelItem, ModelParameterSchema } from '../../../../../../shared/api.ts';
import { buildEffectiveOpsUiState, buildUiUpstreamFingerprint, readPreferredOperationId, setParamsOperation, type UpstreamMediaSnapshot } from '../../../../../../shared/validation/operationUi.ts';
import { findDeclaredParameterFailure } from '../../../../../../shared/validation/declaredParameterValidation.ts';
import { mergeVideoParameterSchema } from './videoParamAdapter.ts';
import { DEFAULT_PARAM_CONTROL_POLICY } from './paramControlTable.ts';

export type VideoControlValues = Record<string, string | number | boolean>;
export interface VideoParameterSelections {
  version: 1;
  byModel: Record<string, { lastOperationId: string; byOperation: Record<string, VideoControlValues> }>;
}
export interface VideoParameterSelectionArgs {
  params: Record<string, unknown>;
  parameterSelections?: VideoParameterSelections;
  currentModelItem?: CapabilityModelItem;
  targetModelItem?: CapabilityModelItem;
  catalog?: CapabilityCatalog | null;
  upstreams?: UpstreamMediaSnapshot[];
  prompt?: string;
  nextOperationId?: string;
  explicitModelSelection?: boolean;
  /** Undefined preserves routing; null selects automatic routing. */
  routing?: Record<string, unknown> | null;
}
export interface VideoParameterSelectionResult {
  params: Record<string, unknown>;
  parameterSelections?: VideoParameterSelections;
  notices: string[];
  errors: string[];
}

const CONTENT_FIELDS = new Set(['model', 'operation', 'mode', 'routing', 'prompt', 'negativePrompt', 'pendingVideoParamAdjustment', 'fileUrl', 'linkUrl', 'firstFrameUrl', 'lastFrameUrl']);
const FIELD_LABELS: Record<string, string> = { resolution: '清晰度', aspectRatio: '画幅', duration: '时长', sound: '声音', seed: '随机种子' };
function controlDefinitions(schema: ModelParameterSchema): Record<string, Record<string, unknown>> {
  return Object.fromEntries(Object.entries(schema).filter(([key, definition]) =>
    !CONTENT_FIELDS.has(key) && !/(?:url|media|slot|runtime|prompt)/i.test(key)
    && definition && typeof definition === 'object' && !Array.isArray(definition),
  )) as Record<string, Record<string, unknown>>;
}
function scalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}
function validatedControls(values: Record<string, unknown>, definitions: Record<string, Record<string, unknown>>) {
  const controls: VideoControlValues = {};
  const notices: string[] = [];
  const errors: string[] = [];
  for (const [field, definition] of Object.entries(definitions)) {
    if (definition.supported === false) continue;
    const value = values[field];
    const supplied = value !== undefined && value !== null && value !== '';
    const valid = (candidate: unknown) => scalar(candidate) && !findDeclaredParameterFailure({[field]:candidate}, {[field]:definition}, undefined);
    if (supplied && valid(value)) {
      const options = Array.isArray(definition.options) ? definition.options : [];
      const canonical = definition.caseInsensitive === true && typeof value === 'string'
        ? options.find((option) => typeof option?.value === 'string' && option.value.toLowerCase() === value.toLowerCase())?.value
        : undefined;
      controls[field] = canonical ?? value;
    } else if (valid(definition.defaultValue)) {
      controls[field] = definition.defaultValue as string | number | boolean;
      if (supplied) notices.push(`${FIELD_LABELS[field] ?? field} ${String(value)} 已失效，已调整为 ${String(controls[field])}`);
    } else {
      if (supplied) notices.push(`${FIELD_LABELS[field] ?? field} ${String(value)} 已失效，已移除`);
      if (definition.required === true) errors.push(`请设置${FIELD_LABELS[field] ?? field}：当前契约没有合法默认值`);
    }
  }
  return { controls, notices, errors };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
export function readVideoParameterSelections(value: unknown): VideoParameterSelections {
  const result: VideoParameterSelections = {version:1, byModel:{}};
  if (!record(value) || value.version !== 1 || !record(value.byModel)) return result;
  for (const [modelId, model] of Object.entries(value.byModel)) {
    if (!record(model) || typeof model.lastOperationId !== 'string' || !record(model.byOperation)) continue;
    const byOperation: Record<string, VideoControlValues> = {};
    for (const [operationId, controls] of Object.entries(model.byOperation)) {
      if (!record(controls)) continue;
      byOperation[operationId] = Object.fromEntries(Object.entries(controls).filter((entry): entry is [string, string | number | boolean] => scalar(entry[1])));
    }
    Object.defineProperty(result.byModel, modelId, {value:{lastOperationId:model.lastOperationId, byOperation}, enumerable:true, writable:true, configurable:true});
  }
  return result;
}

/** Node-local immutable editing state; the returned params are the sole execution source. */
export function buildVideoParameterSelection(args: VideoParameterSelectionArgs): VideoParameterSelectionResult {
  const unchanged = (error: string): VideoParameterSelectionResult => ({params: args.params, parameterSelections: args.parameterSelections, notices: [], errors: [error]});
  if (!args.catalog || !args.targetModelItem) return unchanged('模型配置尚未就绪');
  const target = args.targetModelItem;
  const currentId = typeof args.params.model === 'string' ? args.params.model : '';
  const resolvedCurrent = args.catalog.models?.find(model => model.id === currentId || model.aliases?.includes(currentId));
  const currentMatches = Boolean(args.currentModelItem && resolvedCurrent?.id === args.currentModelItem.id);
  if (!currentMatches && !args.explicitModelSelection) return unchanged('当前模型配置不可用');
  const history = readVideoParameterSelections(args.parameterSelections);
  const fingerprint = buildUiUpstreamFingerprint({prompt: args.prompt, upstreams: args.upstreams});
  function branch(model: CapabilityModelItem, preferred?: string) {
    const state = buildEffectiveOpsUiState({catalog:args.catalog!, modelId:model.id, fingerprint, outputType:'video', ...(preferred ? {preferredOperationId:preferred} : {})});
    const operation = preferred
      ? state.effectiveOps.find(op => op.id === preferred)
      : (state.effectiveOps.find(op => op.id === 'text_to_video') ?? state.effectiveOps.find(op => op.id === state.selectedOperationId) ?? state.effectiveOps[0]);
    if (!operation) return undefined;
    return {id:operation.id, definitions:controlDefinitions(mergeVideoParameterSchema(model.parameters, operation.parameters))};
  }
  const current = currentMatches ? args.currentModelItem : undefined;
  const currentBranch = current ? branch(current, readPreferredOperationId(args.params)) : undefined;
  const sameModel = current?.id === target.id;
  const preferred = args.nextOperationId ?? (sameModel ? readPreferredOperationId(args.params) : history.byModel[target.id]?.lastOperationId);
  const targetBranch = branch(target, preferred);
  if (!targetBranch) return unchanged('当前生成方式不可用，请重新选择');
  const notices: string[] = [];
  if (current && currentBranch) {
    const snapshot = validatedControls(args.params, currentBranch.definitions);
    history.byModel[current.id] = {
      lastOperationId:currentBranch.id,
      byOperation:{...history.byModel[current.id]?.byOperation, [currentBranch.id]:snapshot.controls},
    };
  }
  const sameBranch = sameModel && currentBranch?.id === targetBranch.id;
  const source = sameBranch ? args.params : (history.byModel[target.id]?.byOperation[targetBranch.id] ?? {});
  const selection = validatedControls(source, targetBranch.definitions);
  notices.push(...selection.notices);
  let params = {...args.params};
  const knownControls = DEFAULT_PARAM_CONTROL_POLICY.writeAllowlist.filter(field => !CONTENT_FIELDS.has(field));
  for (const field of new Set([...knownControls, ...Object.keys(currentBranch?.definitions ?? {}), ...Object.keys(targetBranch.definitions)])) delete params[field];
  delete params.pendingVideoParamAdjustment;
  params = setParamsOperation({...params, model:target.id, ...selection.controls}, targetBranch.id);
  if (args.routing === null) delete params.routing;
  else if (args.routing !== undefined) params.routing = structuredClone(args.routing);
  history.byModel[target.id] = {lastOperationId:targetBranch.id, byOperation:{...history.byModel[target.id]?.byOperation, [targetBranch.id]:selection.controls}};
  return {params, parameterSelections:history, notices, errors:selection.errors};
}
