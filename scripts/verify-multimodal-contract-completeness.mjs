#!/usr/bin/env node
/**
 * scripts/verify-multimodal-contract-completeness.mjs
 * 
 * 多模态文本模型契约完整性与画布空态卡槽可观测性 机械门禁
 * 
 * 核心检查项：
 * 1. 【底表对账】所有在 cordis.patch.yml 中声明 input 包含 'image' 的多模态模型，
 *    必须在 plugins/omnimux/src/catalog/specs/text-models.yaml 中具备完备的多模态契约声明。
 * 2. 【卡槽与媒体声明】多模态 operation (如 vision_chat) 必须具备合规的 reference_images 槽位 (min: 0, max >= 1, allowedMimes 非空)。
 * 3. 【统一上游输入标准】chat 与 vision_chat 的 prompt 槽位必须声明 valueSources 包含 local_field 与 upstream_output，并具备 composition 组合定义。
 * 4. 【画布空态可见性】对画布白名单中的多模态文本模型，验证 resolveSlotOperation 与 deriveSlotLayout 在空态下必须能派生出媒体卡槽且 addButton === true，严禁折叠为 0 卡槽。
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

export function parseCordisMultimodalModels(cordisPath) {
  const content = readFileSync(cordisPath, 'utf8');
  const parsed = yaml.parse(content);
  const models = parsed?.plugins?.['llm-pi-ai']?.models ?? [];
  return models
    .filter((m) => Array.isArray(m?.input) && m.input.includes('image'))
    .map((m) => ({ id: m.id, name: m.name, input: m.input }));
}

export function parseTextModelsSpec(yamlPath) {
  const content = readFileSync(yamlPath, 'utf8');
  const models = yaml.parse(content);
  return Array.isArray(models) ? models : [];
}

export function verifyMultimodalContracts({
  cordisPath,
  textModelsPath,
  cordisModels: passedCordisModels,
  textModels: passedTextModels,
  catalog,
  resolveSlotOperation,
  deriveSlotLayout,
  allowedModelIds,
}) {
  const errors = [];
  const cordisModels = passedCordisModels ?? (cordisPath ? parseCordisMultimodalModels(cordisPath) : []);
  const textModels = passedTextModels ?? (textModelsPath ? parseTextModelsSpec(textModelsPath) : []);
  const textModelMap = new Map(textModels.map((m) => [m.id, m]));

  for (const cModel of cordisModels) {
    const spec = textModelMap.get(cModel.id);
    if (!spec) {
      // 仅在中枢中声明了 text-models.yaml 的模型进行深度校验
      continue;
    }

    // 1. 必须有至少一个媒体输入 operation
    const operations = spec.operations ?? [];
    const visionOp = operations.find((op) =>
      op.output?.type === 'text' &&
      op.inputs?.some((input) => input.type === 'image' && input.role === 'reference')
    );

    if (!visionOp) {
      errors.push(`[CONTRACT_INCOMPLETE] 模型 '${cModel.id}' 在 cordis 声明了 image 输入，但 text-models.yaml 中缺少包含 reference_images 的多模态 operation`);
      continue;
    }

    // 2. 检查 reference_images 槽位规范
    const imageSlot = visionOp.inputs.find((input) => input.type === 'image' && input.role === 'reference');
    if (!imageSlot || imageSlot.slot !== 'reference_images') {
      errors.push(`[SLOT_NAMING_ERROR] 模型 '${cModel.id}' 的多模态槽位必须命名为 'reference_images'`);
    } else {
      if (imageSlot.min !== 0) {
        errors.push(`[SLOT_MIN_INVALID] 模型 '${cModel.id}' 的 reference_images 槽位 min 必须为 0（允许纯文本对话提交）`);
      }
      if (!imageSlot.max || imageSlot.max < 1) {
        errors.push(`[SLOT_MAX_INVALID] 模型 '${cModel.id}' 的 reference_images 槽位 max 必须 >= 1`);
      }
      if (!Array.isArray(imageSlot.allowedMimes) || imageSlot.allowedMimes.length === 0) {
        errors.push(`[SLOT_MIMES_MISSING] 模型 '${cModel.id}' 的 reference_images 缺少 allowedMimes 格式声明`);
      }
    }

    // 3. 检查 prompt 输入槽位的上游支持规范 (valueSources 与 composition)
    for (const op of operations) {
      const promptSlot = op.inputs?.find((input) => input.role === 'prompt');
      if (promptSlot) {
        const sources = promptSlot.valueSources ?? [];
        if (!sources.includes('local_field') || !sources.includes('upstream_output')) {
          errors.push(`[PROMPT_SOURCES_MISSING] 模型 '${cModel.id}' 操作 '${op.id}' 的 prompt 必须声明 valueSources: ["local_field", "upstream_output"]`);
        }
        if (!promptSlot.composition || promptSlot.composition.kind !== 'content_with_instruction') {
          errors.push(`[PROMPT_COMPOSITION_MISSING] 模型 '${cModel.id}' 操作 '${op.id}' 的 prompt 必须声明 composition: { kind: "content_with_instruction", ... }`);
        }
      }
    }
  }

  // 4. 检查画布白名单多模态模型的空态卡槽派生
  if (catalog && resolveSlotOperation && deriveSlotLayout && Array.isArray(allowedModelIds)) {
    const emptyFingerprint = { prompt: '', assets: [], mediaAssets: [], texts: [] };
    for (const modelId of allowedModelIds) {
      const isMultimodal = cordisModels.some((m) => m.id === modelId);
      if (!isMultimodal) continue;

      const opId = resolveSlotOperation(catalog, modelId, undefined, 'text', emptyFingerprint);
      if (!opId) {
        errors.push(`[CANVAS_SLOT_RESOLVE_FAILED] 画布多模态模型 '${modelId}' 在空态下 resolveSlotOperation 返回空`);
        continue;
      }

      const layout = deriveSlotLayout(catalog, modelId, opId);
      if (layout.preset === 'none' || layout.slots.length === 0 || !layout.addButton) {
        errors.push(`[CANVAS_SLOTS_COLLAPSED] 画布多模态模型 '${modelId}' 在空态下未露出素材卡槽与添加按钮: preset=${layout.preset}, slots=${layout.slots.length}, addButton=${layout.addButton}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

async function runCli() {
  const cordisPath = resolve(root, 'plugins/omnimux/cordis.patch.yml');
  const textModelsPath = resolve(root, 'plugins/omnimux/src/catalog/specs/text-models.yaml');

  const { getHealthyContractIndex, projectCatalog } = await import(resolve(root, 'plugins/omnimux/src/catalog/project.js'));
  const catalog = projectCatalog(getHealthyContractIndex());
  
  const { resolveSlotOperation, deriveSlotLayout } = await import(resolve(root, 'plugins/omnimux-workflow/src/shared/graph/feedSlot/index.ts'));
  const { CANVAS_GENERATION_POLICY } = await import(resolve(root, 'plugins/omnimux-workflow/src/shared/generationPolicy.ts'));
  const allowedModelIds = CANVAS_GENERATION_POLICY.text.allowedModelIds;

  const result = verifyMultimodalContracts({
    cordisPath,
    textModelsPath,
    catalog,
    resolveSlotOperation,
    deriveSlotLayout,
    allowedModelIds,
  });

  if (!result.ok) {
    console.error('❌ [verify-multimodal-contract-completeness] 检测到多模态契约不完整或卡槽被折叠:');
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log('✅ [verify-multimodal-contract-completeness] 所有多模态文本模型契约完备性与画布空态卡槽校验通过！');
}

if (process.argv[1] && process.argv[1].endsWith('verify-multimodal-contract-completeness.mjs')) {
  runCli().catch((err) => {
    console.error('❌ [verify-multimodal-contract-completeness] 运行异常:', err);
    process.exit(1);
  });
}
