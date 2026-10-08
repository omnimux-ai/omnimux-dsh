#!/usr/bin/env node
/**
 * Multimodal text contract completeness and empty canvas slot gate (#3248).
 * Route declarations are independent of the contract projection. Every image
 * route is reported as matched/checked or explicitly unpaired. Prompt source
 * and composition rules apply to every prompt-bearing operation, listed or not.
 * Known semantic debt is not proof that the corresponding capability works.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import { MEDIA_TYPES } from '../plugins/omnimux/src/catalog/contract/schemas/commonSchema.js';
import { parseRouteModalities } from './verify-modality-matrix.mjs';
import { parseFile, prepareCanonicalDoc, normalizeDoc } from '../plugins/omnimux/src/catalog/contract/load.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} cordisPath @returns {object[]} */
export function parseCordisMultimodalModels(cordisPath) {
  const text = readFileSync(cordisPath, 'utf8');
  const routes = parseRouteModalities(text);
  assertModels(routes, 'route');
  // The shared parser coerces input members to strings; validate raw members
  // before that normalization can conceal a source shape error.
  const rows = yaml.parse(text).filter((entry) => entry?.id === 'llm-pi-ai');
  if (rows.length !== 1) throw new Error('SOURCE_INVALID: route must contain exactly one llm-pi-ai row');
  for (const model of rows[0].config.providers.omnimux.models) {
    if (Object.hasOwn(model, 'input') && (!Array.isArray(model.input) || model.input.length === 0
      || model.input.some((type) => typeof type !== 'string' || !MEDIA_TYPES.has(type)))) {
      throw new Error(`SOURCE_INVALID: route ${model.id} declares malformed input modalities`);
    }
  }
  const models = routes.filter((model) => model.input.includes('image'));
  assertModels(models, 'multimodal route');
  return models;
}

/** Read a text spec through the formal parse/validate/normalize pipeline.
 * @param {string} yamlPath @returns {object[]}
 */
export function parseTextModelsSpec(yamlPath) {
  const { doc } = parseFile(yamlPath);
  const prepared = prepareCanonicalDoc(doc, { file: yamlPath });
  if (!prepared.ok) {
    throw new Error(`TEXT_SOURCE_INVALID: ${prepared.issues.filter((i) => i.level === 'error').map((i) => `${i.code}: ${i.message}`).join('; ')}`);
  }
  if (prepared.doc.managementGroup !== 'text') throw new Error('TEXT_SOURCE_INVALID: managementGroup must be text');
  const models = normalizeDoc(prepared.doc).map((model) => ({ ...model, sourceFile: basename(yamlPath) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  assertModels(models, 'text contract');
  return models;
}

/** @param {unknown} value @returns {boolean} */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} models @param {string} source @returns {void} */
function assertModels(models, source) {
  if (!Array.isArray(models) || models.length === 0) throw new Error(`SOURCE_EMPTY: ${source} must be a nonempty array`);
  const ids = new Set();
  for (const model of models) {
    if (!isObject(model) || typeof model.id !== 'string' || !model.id.trim() || ids.has(model.id)) {
      throw new Error(`SOURCE_INVALID: ${source} has missing or duplicate model id`);
    }
    ids.add(model.id);
  }
}

/** @param {object[]} routeModels @param {object[]} textModels @returns {void} */
function assertSources(routeModels, textModels) {
  assertModels(routeModels, 'multimodal route');
  assertModels(textModels, 'text contract');
  for (const model of routeModels) {
    if (!Array.isArray(model.input) || !model.input.includes('image') || model.input.some((type) => typeof type !== 'string' || !type.trim())) {
      throw new Error(`SOURCE_INVALID: route ${model.id} must declare image in an input array`);
    }
  }
  for (const model of textModels) {
    if (!Array.isArray(model.operations) || model.operations.length === 0) throw new Error(`SOURCE_INVALID: ${model.id} has no operations`);
    const ids = new Set();
    for (const op of model.operations) {
      if (!isObject(op) || typeof op.id !== 'string' || !op.id.trim() || ids.has(op.id)
        || !isObject(op.output) || typeof op.output.type !== 'string' || !op.output.type.trim() || !Array.isArray(op.inputs)
        || op.inputs.some((slot) => !isObject(slot) || typeof slot.slot !== 'string' || !slot.slot.trim()
          || typeof slot.type !== 'string' || !slot.type.trim() || typeof slot.role !== 'string' || !slot.role.trim()
          || (slot.valueSources !== undefined && (!Array.isArray(slot.valueSources) || slot.valueSources.some((value) => typeof value !== 'string')))
          || (slot.composition !== undefined && !isObject(slot.composition))
          || (slot.allowedMimes !== undefined && (!Array.isArray(slot.allowedMimes) || slot.allowedMimes.some((value) => typeof value !== 'string' || !value.trim()))))) {
        throw new Error(`SOURCE_INVALID: ${model.id} has malformed or duplicate operations/inputs`);
      }
      ids.add(op.id);
    }
  }
}

/** @param {object} entry @returns {string} */
function gapKey(entry) {
  return JSON.stringify([entry.code, entry.modelId, entry.operationId]);
}

/** Precisely identified historical prompt debt and unmatched source identities may be baselined.
 * @param {object[]} findings @param {unknown} baseline @returns {object}
 */
function applyBaseline(findings, baseline) {
  const invalid = [];
  const allowed = new Map();
  if (!Array.isArray(baseline)) {
    invalid.push({ code: 'BASELINE_INVALID', message: 'baseline must be an array' });
  } else {
    const fields = new Set(['code', 'modelId', 'operationId', 'reason', 'issue']);
    for (const entry of baseline) {
      if (!isObject(entry) || Object.keys(entry).some((key) => !fields.has(key))
        || !['PROMPT_SOURCES_MISSING', 'PROMPT_COMPOSITION_MISSING', 'ROUTE_MODEL_UNPAIRED'].includes(entry.code)
        || typeof entry.modelId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(entry.modelId)
        || (entry.code === 'ROUTE_MODEL_UNPAIRED' ? entry.operationId !== null
          : typeof entry.operationId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(entry.operationId))
        || typeof entry.reason !== 'string' || !entry.reason.trim() || entry.issue !== '#3249') {
        invalid.push({ code: 'BASELINE_INVALID', entry, message: 'baseline requires an exact allowed code/model/operation identity, reason and Issue #3249' });
      } else if (allowed.has(gapKey(entry))) {
        invalid.push({ code: 'BASELINE_DUPLICATE', entry, message: 'duplicate baseline identity' });
      } else {
        allowed.set(gapKey(entry), entry);
      }
    }
  }
  const seen = new Set(findings.map(gapKey));
  const known = findings.filter((entry) => allowed.has(gapKey(entry)))
    .map((entry) => ({ ...entry, reason: allowed.get(gapKey(entry)).reason, issue: allowed.get(gapKey(entry)).issue }));
  return { known, unexpected: findings.filter((entry) => !allowed.has(gapKey(entry))),
    stale: [...allowed.values()].filter((entry) => !seen.has(gapKey(entry))), invalid };
}

/** @param {string} [path] @returns {unknown} */
export function loadKnownGaps(path = resolve(root, 'scripts/multimodal-contract-known-gaps.json')) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * @param {{cordisPath?: string, textModelsPath?: string, cordisModels?: object[], textModels?: object[],
 * catalog: object, resolveSlotOperation: Function, deriveSlotLayout: Function,
 * allowedModelIds: string[], canvasEmptyReason?: string, baseline?: object[], useBaseline?: boolean}} input
 * @returns {object} Structured findings, coverage and gate verdict.
 */
export function verifyMultimodalContracts({
  cordisPath, textModelsPath, cordisModels: passedCordisModels, textModels: passedTextModels,
  catalog, resolveSlotOperation, deriveSlotLayout, allowedModelIds, canvasEmptyReason,
  baseline = [], useBaseline = true,
}) {
  const cordisModels = passedCordisModels !== undefined ? passedCordisModels : parseCordisMultimodalModels(cordisPath);
  const textModels = passedTextModels !== undefined ? passedTextModels : parseTextModelsSpec(textModelsPath);
  assertSources(cordisModels, textModels);
  const textModelMap = new Map(textModels.map((model) => [model.id, model]));
  const findings = [];
  const structural = [];
  const coverage = [];
  const checked = [];
  const canvasChecked = [];
  const add = (code, modelId, operationId, message) => findings.push({ code, modelId, operationId, message });
  const failStructure = (code, modelId, message) => structural.push({ code, modelId, operationId: null, message });

  for (const route of cordisModels) {
    const spec = textModelMap.get(route.id);
    if (!spec) {
      coverage.push({ modelId: route.id, status: 'unpaired', checked: false });
      add('ROUTE_MODEL_UNPAIRED', route.id, null, 'image 路由源缺少匹配的文本契约，未进行深检查');
    } else {
      coverage.push({ modelId: route.id, status: 'matched', checked: true });
      const visionOp = spec.operations.find((op) => op.output.type === 'text'
        && op.inputs.some((slot) => slot.type === 'image' && slot.role === 'reference'));
      if (!visionOp) {
        add('CONTRACT_INCOMPLETE', route.id, null, '路由声明 image，但文本契约缺少包含 reference_images 的多模态 operation');
      } else {
        const slot = visionOp.inputs.find((input) => input.type === 'image' && input.role === 'reference');
        if (slot.slot !== 'reference_images') {
          add('SLOT_NAMING_ERROR', route.id, visionOp.id, "多模态槽位必须命名为 'reference_images'");
        } else {
          if (slot.min !== 0) add('SLOT_MIN_INVALID', route.id, visionOp.id, 'reference_images min 必须为 0');
          if (!Number.isFinite(slot.max) || slot.max < 1) add('SLOT_MAX_INVALID', route.id, visionOp.id, 'reference_images max 必须 >= 1');
          if (!Array.isArray(slot.allowedMimes) || slot.allowedMimes.length === 0) {
            add('SLOT_MIMES_MISSING', route.id, visionOp.id, 'reference_images 缺少 allowedMimes 格式声明');
          }
        }
      }
      // Preserve the original scope: every operation owning a prompt is checked.
      for (const op of spec.operations) {
        const prompt = op.inputs.find((slot) => slot.role === 'prompt');
        if (prompt) {
          if (!Array.isArray(prompt.valueSources) || !prompt.valueSources.includes('local_field') || !prompt.valueSources.includes('upstream_output')) {
            add('PROMPT_SOURCES_MISSING', route.id, op.id, 'prompt 必须声明 valueSources: ["local_field", "upstream_output"]');
          }
          if (prompt.composition?.kind !== 'content_with_instruction') {
            add('PROMPT_COMPOSITION_MISSING', route.id, op.id, 'prompt 必须声明 composition.kind: content_with_instruction');
          }
        }
      }
      checked.push(route.id);
    }
  }

  const matched = coverage.filter((row) => row.status === 'matched').map((row) => row.modelId);
  const unpaired = coverage.filter((row) => row.status === 'unpaired').map((row) => row.modelId);
  if (matched.length === 0) failStructure('NO_MATCHED_MODELS', null, '路由与文本契约没有匹配源，未实际检查任何模型');
  if (matched.length !== checked.length || matched.some((id) => !checked.includes(id))
    || coverage.length !== cordisModels.length || matched.length + unpaired.length !== cordisModels.length) {
    failStructure('COVERAGE_INCOMPLETE', null, '源归类或 matched 深度检查覆盖不完整');
  }

  const validCatalog = isObject(catalog) && Array.isArray(catalog.models) && catalog.models.length > 0;
  const validWhitelist = Array.isArray(allowedModelIds) && allowedModelIds.every((id) => typeof id === 'string' && id.trim())
    && new Set(allowedModelIds).size === allowedModelIds.length;
  if (!validCatalog || typeof resolveSlotOperation !== 'function' || typeof deriveSlotLayout !== 'function' || !validWhitelist) {
    failStructure('CANVAS_CONTEXT_MISSING', null, '必需 catalog/matcher/layout/whitelist 上下文缺失或结构无效');
  } else {
    const sourceIds = new Set(cordisModels.map((model) => model.id));
    const canvasIds = allowedModelIds.filter((id) => sourceIds.has(id));
    const declaredEmpty = allowedModelIds.length === 0 && typeof canvasEmptyReason === 'string' && canvasEmptyReason.trim().length > 0;
    if (canvasIds.length === 0 && !declaredEmpty) failStructure('CANVAS_CHECK_EMPTY', null, '画布多模态检查归零；合法空产品范围须显式声明原因');
    const emptyFingerprint = { prompt: '', assets: [], mediaAssets: [], texts: [] };
    for (const modelId of canvasIds) {
      const model = catalog.models.find((candidate) => candidate.id === modelId);
      if (!model || !matched.includes(modelId) || !Array.isArray(model.operations)) {
        failStructure('CANVAS_MODEL_UNPAIRED', modelId, '白名单多模态模型缺少匹配的文本契约或 catalog operation');
      } else {
        const opId = resolveSlotOperation(catalog, modelId, undefined, 'text', emptyFingerprint);
        if (!opId) {
          add('CANVAS_SLOT_RESOLVE_FAILED', modelId, null, '画布空态 resolveSlotOperation 返回空');
        } else if (!model.operations.some((op) => op.id === opId)) {
          failStructure('CANVAS_OPERATION_UNPAIRED', modelId, `matcher 返回 catalog 不存在的 operation ${opId}`);
        } else {
          const layout = deriveSlotLayout(catalog, modelId, opId);
          canvasChecked.push(modelId);
          if (!isObject(layout) || !Array.isArray(layout.slots) || typeof layout.preset !== 'string' || typeof layout.addButton !== 'boolean') {
            failStructure('CANVAS_LAYOUT_INVALID', modelId, 'layout 返回值形状无效');
          } else if (layout.preset === 'none' || layout.slots.length === 0 || !layout.addButton) {
            add('CANVAS_SLOTS_COLLAPSED', modelId, opId, `画布空态未露出素材卡槽与添加按钮: preset=${layout.preset}, slots=${layout.slots.length}, addButton=${layout.addButton}`);
          }
        }
      }
    }
  }

  const { known, unexpected, stale, invalid } = applyBaseline(findings, useBaseline ? baseline : []);
  const counts = { source: cordisModels.length, contract: textModels.length, matched: matched.length, checked: checked.length,
    canvas: canvasChecked.length, unpaired: unpaired.length, known: known.length, new: unexpected.length,
    stale: stale.length, invalid: invalid.length, structural: structural.length };
  return { ok: unexpected.length === 0 && stale.length === 0 && invalid.length === 0 && structural.length === 0,
    capabilitiesComplete: findings.length === 0 && structural.length === 0 && unpaired.length === 0,
    findings, structural, coverage, matched, checked, canvasChecked, unpaired, counts,
    known, unexpected, stale, invalid, baselineApplied: useBaseline,
    errors: [...structural, ...unexpected, ...invalid,
      ...stale.map((entry) => ({ ...entry, code: 'BASELINE_STALE', message: '基线发现已不再复现，必须同步删除条目' }))]
      .map((entry) => `[${entry.code}] ${entry.modelId ?? 'source'}${entry.operationId ? `#${entry.operationId}` : ''}: ${entry.message}`) };
}

async function runCli() {
  const { getHealthyContractIndex, projectCatalog } = await import(resolve(root, 'plugins/omnimux/src/catalog/project.js'));
  const { resolveSlotOperation, deriveSlotLayout } = await import(resolve(root, 'plugins/omnimux-workflow/src/shared/graph/feedSlot/index.ts'));
  const { CANVAS_GENERATION_POLICY } = await import(resolve(root, 'plugins/omnimux-workflow/src/shared/generationPolicy.ts'));
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--no-baseline')) throw new Error('仅支持 --no-baseline 参数');
  const result = verifyMultimodalContracts({
    baseline: loadKnownGaps(), useBaseline: !args.includes('--no-baseline'),
    cordisPath: resolve(root, 'plugins/omnimux/cordis.patch.yml'),
    textModelsPath: resolve(root, 'plugins/omnimux/src/catalog/specs/text-models.yaml'),
    catalog: projectCatalog(getHealthyContractIndex()), resolveSlotOperation, deriveSlotLayout,
    allowedModelIds: CANVAS_GENERATION_POLICY.text.allowedModelIds,
  });
  console.log(`多模态检查: source=${result.counts.source} matched=${result.counts.matched} checked=${result.counts.checked} canvas=${result.counts.canvas} unpaired=${result.counts.unpaired} known=${result.counts.known} new=${result.counts.new} stale=${result.counts.stale} invalid=${result.counts.invalid} structural=${result.counts.structural}`);
  console.log(`门禁判定=${result.ok ? '接受当前精确基线' : '失败'}；功能完整性=${result.capabilitiesComplete ? '无已发现欠账' : '未通过：仍有已知欠账或未配对源'}（非真实生成验收）`);
  console.log(JSON.stringify({ event: 'multimodal-contract-completeness',
    sources: { route: 'plugins/omnimux/cordis.patch.yml', contract: 'plugins/omnimux/src/catalog/specs/text-models.yaml' }, ...result }));
  for (const error of result.errors) console.error(error);
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error('verify-multimodal-contract-completeness: 运行异常:', error);
    process.exitCode = 1;
  });
}
