/**
 * Issue #466 (W1): contract-driven compat kernel tests.
 *
 * Covers: fingerprint, contract view (v1.1 + legacy synthesis + aliases),
 * slot matcher (role / capacity / MIME / size /
 * duration / determinism), accepts vs ready, per-model verdicts, catalog
 * evaluation, fail-closed paths and the locked auto-adaptation ordering.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_OPERATION_MAP,
  mapLegacyOperation,
  buildUpstreamFingerprint,
  buildContractView,
  resolveModelView,
  matchOperationInputs,
  evaluateModelCompat,
  evaluateCatalogCompat,
  primaryRejectionCode,
  planAutoAdaptation,
  deriveMergedInputCapability,
} from './compatKernel.ts';
import { createCompatTestCatalog } from './compatTestCatalog.ts';

const MB = 1024 * 1024;

function fp(assets, prompt = '画一只猫', nodeFields = undefined) {
  return buildUpstreamFingerprint({ prompt, assets, nodeFields });
}

function img(overrides = {}) {
  return { sourceNodeId: 'src-1', type: 'image', mimeType: 'image/png', sizeBytes: 1 * MB, ...overrides };
}

// ============================================================================
// Fingerprint
// ============================================================================

test('fingerprint：mediaAssets 只含 image/video/audio；signature 随内容变化', () => {
  const a = fp([img(), { sourceNodeId: 't1', type: 'text' }]);
  assert.equal(a.mediaAssets.length, 1);
  assert.equal(a.assets.length, 2);
  const b = fp([img({ sizeBytes: 2 * MB }), { sourceNodeId: 't1', type: 'text' }]);
  assert.notEqual(a.signature, b.signature);
  const c = fp([img(), { sourceNodeId: 't1', type: 'text' }]);
  assert.equal(a.signature, c.signature);
});

// ============================================================================
// Contract view
// ============================================================================

test('contract view：v1.1 models[] 规范化 + alias 归一 + 稳定 order', () => {
  const view = buildContractView(createCompatTestCatalog());
  assert.equal(view.available, true);
  assert.equal(view.models.length, 9);
  assert.equal(view.models[1].id, 'img-ref');
  assert.equal(view.models[1].order, 1);
  const viaAlias = resolveModelView(view, 'alias-img-wire');
  assert.equal(viaAlias?.id, 'alias-img');
  assert.equal(resolveModelView(view, 'nope'), undefined);
});

test('contract view：catalog 缺失 / 空 models → unavailable（fail closed）', () => {
  assert.equal(buildContractView(null).available, false);
  assert.equal(buildContractView(undefined).available, false);
  const empty = buildContractView({ source: 'omnimux', models: [], text: [], image: [], video: [], audio: [] });
  assert.equal(empty.available, true); // 目录在，但零模型 → 零候选
  assert.equal(empty.models.length, 0);
  const shell = buildContractView({ source: 'static-stub', text: [], image: [], video: [], audio: [] });
  assert.equal(shell.available, false);
});

test('contract view：无 models[] 时从旧桶行 inputCapability 合成（数据驱动）', () => {
  const legacy = {
    source: 'static-stub',
    text: [],
    image: [
      {
        id: 'legacy-img',
        label: 'Legacy',
        inputCapability: {
          modalities: ['text', 'image'],
          referenceImages: { min: 0, max: 3, allowedMimeTypes: ['image/png'], supportedRoles: ['reference'] },
        },
      },
    ],
    video: [],
    audio: [],
  };
  const view = buildContractView(legacy);
  assert.equal(view.available, true);
  const model = resolveModelView(view, 'legacy-img');
  assert.equal(model?.synthesized, true);
  assert.equal(model?.operations[0].listed, true);
  assert.equal(model?.operations[0].output.type, 'image');
  const slot = model?.operations[0].inputs.find((s) => s.type === 'image');
  assert.equal(slot?.max, 3);
});

// ============================================================================
// Legacy operation mapping
// ============================================================================

test('legacy operation map：读时映射 canonical operation（string + metadata）', () => {
  assert.equal(mapLegacyOperation('reference'), 'video_multi_ref');
  assert.equal(mapLegacyOperation('first_last_frame'), 'first_last_frame');
  assert.equal(mapLegacyOperation('i2v'), 'first_frame');
  assert.equal(mapLegacyOperation('t2i'), 'text_to_image');
  assert.equal(mapLegacyOperation('digital_human'), 'digital_human');
  assert.equal(mapLegacyOperation('end_frame'), 'end_frame');
  assert.equal(mapLegacyOperation('endframe'), 'end_frame');
  assert.equal(mapLegacyOperation('end-frame'), 'end_frame');
  assert.notEqual(mapLegacyOperation('endframe'), 'first_frame');
  assert.notEqual(mapLegacyOperation('endframe'), 'first_last_frame');
  assert.equal(mapLegacyOperation('i2v'), 'first_frame');
  assert.notEqual(mapLegacyOperation('i2v'), 'end_frame');
  assert.equal(mapLegacyOperation('some_future_op'), 'some_future_op');
  assert.equal(mapLegacyOperation(''), '');
  assert.equal(Object.keys(LEGACY_OPERATION_MAP).length > 0, true);
});

// ============================================================================
// Slot matcher
// ============================================================================

function opView(modelId, opId) {
  const view = buildContractView(createCompatTestCatalog());
  const model = resolveModelView(view, modelId);
  return model.operations.find((op) => op.id === opId);
}

test('slot matcher：png 参考图命中 reference 槽，binding 确定', () => {
  const op = opView('img-ref', 'image_to_image');
  const match = matchOperationInputs(op, fp([img({ edgeId: 'e1' })]));
  assert.equal(match.accepts, true);
  assert.equal(match.ready, true);
  assert.deepEqual(match.bindings, [
    { edgeId: 'e1', sourceNodeId: 'src-1', slot: 'reference_images', role: 'reference', type: 'image' },
  ]);
});

test('slot matcher：MIME 不允许 → mime_unsupported', () => {
  const op = opView('img-ref', 'image_to_image');
  const match = matchOperationInputs(op, fp([img({ mimeType: 'image/gif' })]));
  assert.equal(match.accepts, false);
  assert.equal(match.rejections[0].code, 'mime_unsupported');
  assert.equal(match.rejections[0].slot, 'reference_images');
});

test('slot matcher：体积超 slot 声明上限 → size_exceeded', () => {
  const op = opView('img-ref', 'image_to_image');
  const match = matchOperationInputs(op, fp([img({ sizeBytes: 11 * MB })]));
  assert.equal(match.accepts, false);
  assert.equal(match.rejections[0].code, 'size_exceeded');
});

test('slot matcher：严格体积上限在等于边界时拒绝', () => {
  const op = {
    id: 'strict-image',
    label: 'strict-image',
    output: { type: 'video' },
    inputs: [{
      slot: 'reference_images',
      type: 'image',
      role: 'reference',
      min: 1,
      max: 1,
      maxSizeMb: 30,
      maxSizeExclusive: true,
    }],
    inputGroups: [],
    parameters: {},
  };
  const match = matchOperationInputs(op, fp([img({ sizeBytes: 30 * MB })]));
  assert.equal(match.accepts, false);
  assert.equal(match.rejections[0].code, 'size_exceeded');
});

test('slot matcher：时长超 slot 声明上限 → duration_exceeded', () => {
  const op = opView('vid-frames', 'video_edit');
  const match = matchOperationInputs(op, fp([
    { sourceNodeId: 'v1', type: 'video', mimeType: 'video/mp4', durationSec: 45 },
  ]));
  assert.equal(match.accepts, false);
  assert.equal(match.rejections[0].code, 'duration_exceeded');
});

test('slot matcher：超出槽 max → slot_capacity', () => {
  const op = opView('img-ref', 'image_to_image');
  const match = matchOperationInputs(op, fp([
    img({ sourceNodeId: 'a' }),
    img({ sourceNodeId: 'b' }),
    img({ sourceNodeId: 'c' }),
  ]));
  assert.equal(match.accepts, false);
  assert.equal(match.rejections[0].code, 'slot_capacity');
});

test('slot matcher：显式 role 优先；无匹配 role → role_conflict', () => {
  const op = opView('vid-frames', 'first_last_frame');
  const ok = matchOperationInputs(op, fp([img({ role: 'last_frame', edgeId: 'e9' })]));
  assert.equal(ok.accepts, true);
  assert.equal(ok.bindings[0].slot, 'end_frame');
  const bad = matchOperationInputs(op, fp([img({ role: 'soundtrack' })]));
  assert.equal(bad.accepts, false);
  assert.equal(bad.rejections[0].code, 'role_conflict');
});

test('slot matcher：显式 targetSlot 优先于一切；未知槽 → role_conflict', () => {
  const op = opView('vid-frames', 'first_last_frame');
  const ok = matchOperationInputs(op, fp([img({ targetSlot: 'end_frame' })]));
  assert.equal(ok.accepts, true);
  assert.equal(ok.bindings[0].slot, 'end_frame');
  const bad = matchOperationInputs(op, fp([img({ targetSlot: 'nope' })]));
  assert.equal(bad.accepts, false);
  assert.equal(bad.rejections[0].code, 'role_conflict');
});


test('slot matcher A1：旧 FLF targetSlot=last_frame 切到 end_frame 不得静默错误绑定 (#567)', () => {
  const endOp = opView('vid-endframe', 'end_frame');
  assert.ok(endOp, 'fixture must expose end_frame op');
  // Stale FLF edge still points at last_frame slot name which end_frame op does not own.
  const stale = matchOperationInputs(endOp, fp([img({ targetSlot: 'last_frame', role: 'last_frame', edgeId: 'e-stale' })]));
  assert.equal(stale.accepts, false, 'stale last_frame targetSlot must not bind on end_frame');
  assert.equal(stale.rejections[0].code, 'role_conflict');
});

test('slot matcher A1：canonical end_frame 新边 targetSlot=end_frame + role=last_frame 可绑定 (#567)', () => {
  const endOp = opView('vid-endframe', 'end_frame');
  const ok = matchOperationInputs(endOp, fp([
    img({ targetSlot: 'end_frame', role: 'last_frame', edgeId: 'e-end' }),
  ]));
  assert.equal(ok.accepts, true);
  assert.equal(ok.bindings.length, 1);
  assert.equal(ok.bindings[0].slot, 'end_frame');
  assert.equal(ok.bindings[0].role, 'last_frame');
  // targetSlot wins: wrong role still binds to explicit end_frame slot when present
  const bySlot = matchOperationInputs(endOp, fp([img({ targetSlot: 'end_frame', edgeId: 'e2' })]));
  assert.equal(bySlot.accepts, true);
  assert.equal(bySlot.bindings[0].slot, 'end_frame');
  assert.equal(bySlot.bindings[0].role, 'last_frame');
});

test('slot matcher：必填窄槽先于通用 reference，分配确定（首帧→尾帧）', () => {
  const op = opView('vid-frames', 'first_last_frame');
  const match = matchOperationInputs(op, fp([
    img({ sourceNodeId: 'a', edgeId: 'e1' }),
    img({ sourceNodeId: 'b', edgeId: 'e2' }),
  ]));
  assert.equal(match.accepts, true);
  assert.equal(match.ready, true);
  assert.equal(match.bindings[0].slot, 'start_frame');
  assert.equal(match.bindings[1].slot, 'end_frame');
});

test('slot matcher：类型无槽 → operation_incompatible；bindings 顺序确定', () => {
  const op = opView('img-ref', 'image_to_image');
  const match = matchOperationInputs(op, fp([{ sourceNodeId: 'v1', type: 'video', mimeType: 'video/mp4' }]));
  assert.equal(match.accepts, false);
  assert.equal(match.rejections[0].code, 'operation_incompatible');
});

test('slot matcher：acceptsCurrentInputs ≠ readyToSubmit（min / prompt）', () => {
  const op = opView('img-ref', 'image_to_image');
  // 零素材：accepts（无冲突）但未达 reference min 1 → ready false。
  const noAssets = matchOperationInputs(op, fp([], '有提示词'));
  assert.equal(noAssets.accepts, true);
  assert.equal(noAssets.ready, false);
  assert.equal(noAssets.pending.some((p) => p.code === 'min_unsatisfied'), true);
  // 空 prompt：ready false + prompt_required。
  const noPrompt = matchOperationInputs(op, fp([img()], ''));
  assert.equal(noPrompt.accepts, true);
  assert.equal(noPrompt.ready, false);
  assert.equal(noPrompt.pending.some((p) => p.code === 'prompt_required'), true);
});

test('slot matcher：必填 node_field URL 映射 camelCase 参数并参与 readiness', () => {
  const op = {
    id: 'document_to_video',
    label: 'document_to_video',
    output: { type: 'video' },
    inputs: [{
      slot: 'file_url',
      type: 'document',
      role: 'document',
      source: 'node_field',
      min: 1,
      max: 1,
    }],
    inputGroups: [],
    listed: true,
  };
  const missing = matchOperationInputs(op, fp([], '可选提示词'));
  assert.equal(missing.accepts, true);
  assert.equal(missing.ready, false);
  assert.equal(missing.pending[0].code, 'metadata_required');
  assert.equal(missing.pending[0].slot, 'file_url');

  const invalid = matchOperationInputs(op, fp([], '可选提示词', { fileUrl: 'ftp://example.com/deck.pdf' }));
  assert.equal(invalid.ready, false);
  assert.equal(invalid.pending[0].code, 'metadata_required');

  const valid = matchOperationInputs(op, fp([], '可选提示词', { fileUrl: 'https://cdn.example.com/deck.pdf' }));
  assert.equal(valid.ready, true);
});

// ============================================================================
// Model verdict
// ============================================================================

test('model verdict：未知模型 fail closed（unknown_model）', () => {
  const verdict = evaluateModelCompat(undefined, fp([]));
  assert.equal(verdict.known, false);
  assert.equal(verdict.acceptsCurrentInputs, false);
  assert.equal(verdict.rejections[0].code, 'unknown_model');
});

test('model verdict：零 listed operation → not_listed；unlisted op 不参与吸收', () => {
  const view = buildContractView(createCompatTestCatalog());
  const unlisted = resolveModelView(view, 'unlisted-model');
  const verdict = evaluateModelCompat(unlisted, fp([]));
  assert.equal(verdict.acceptsCurrentInputs, false);
  assert.equal(verdict.rejections[0].code, 'not_listed');

  // img-ref 的 multi_reference（未 listed，max 8）不得吸收 3 张图。
  const imgRef = resolveModelView(view, 'img-ref');
  const three = evaluateModelCompat(imgRef, fp([img(), img({ sourceNodeId: 'b' }), img({ sourceNodeId: 'c' })]));
  assert.equal(three.acceptsCurrentInputs, false);
});

test('model verdict：outputType 过滤 + 请求的 canonical operation 优先', () => {
  const view = buildContractView(createCompatTestCatalog());
  const vid = resolveModelView(view, 'vid-frames');
  const frames = fp([img({ role: 'first_frame' }), img({ sourceNodeId: 'b', role: 'last_frame' })]);
  const verdict = evaluateModelCompat(vid, frames, { operationId: 'first_last_frame', outputType: 'video' });
  assert.equal(verdict.requestedOperationId, 'first_last_frame');
  assert.equal(verdict.acceptsCurrentInputs, true);
  assert.equal(verdict.chosenOperationId, 'first_last_frame');
  assert.equal(verdict.readyToSubmit, true);
});

test('model verdict：effectiveOperations 0 / 1 / >=2 分叉', () => {
  const view = buildContractView(createCompatTestCatalog());
  const imgRef = resolveModelView(view, 'img-ref');

  // 0：gif 不兼容 listed op
  const zero = evaluateModelCompat(imgRef, fp([img({ mimeType: 'image/gif' })]), { outputType: 'image' });
  assert.equal(zero.effectiveOperations.length, 0);
  assert.equal(zero.acceptsCurrentInputs, false);

  // 1：带图时仅 image_to_image 吸收（text_to_image 无 image 槽）
  const one = evaluateModelCompat(imgRef, fp([img()]), { outputType: 'image' });
  assert.equal(one.effectiveOperations.length, 1);
  assert.equal(one.effectiveOperations[0].operationId, 'image_to_image');
  assert.equal(one.acceptsCurrentInputs, true);

  // >=2：零媒体时 text_to_image + image_to_image 都 accepts（min 未满足 → ready 可能 false）
  const multi = evaluateModelCompat(imgRef, fp([], 'hello'), { outputType: 'image' });
  assert.ok(multi.effectiveOperations.length >= 2);
  assert.equal(multi.acceptsCurrentInputs, true);
  assert.deepEqual(
    multi.effectiveOperations.map((m) => m.operationId).sort(),
    ['image_to_image', 'text_to_image'],
  );
});

// ============================================================================
// Catalog evaluation + primary rejection
// ============================================================================

test('catalog evaluation：零候选 typed reason 稳定（mime > size > capacity…）', () => {
  const catalog = createCompatTestCatalog();
  const gif = evaluateCatalogCompat(catalog, fp([img({ mimeType: 'image/gif' })]), { outputType: 'image' });
  assert.equal(gif.zeroCandidates, true);
  assert.equal(primaryRejectionCode(gif), 'mime_unsupported');

  const huge = evaluateCatalogCompat(catalog, fp([img({ sizeBytes: 11 * MB })]), { outputType: 'image' });
  assert.equal(primaryRejectionCode(huge), 'size_exceeded');

  const many = evaluateCatalogCompat(catalog, fp([
    img(), img({ sourceNodeId: 'b' }), img({ sourceNodeId: 'c' }),
    img({ sourceNodeId: 'd' }), img({ sourceNodeId: 'e' }),
  ]), { outputType: 'image' });
  assert.equal(primaryRejectionCode(many), 'slot_capacity');

  const video = evaluateCatalogCompat(catalog, fp([
    { sourceNodeId: 'v', type: 'video', mimeType: 'video/mp4', durationSec: 10 },
  ]), { outputType: 'image' });
  assert.equal(primaryRejectionCode(video), 'no_compatible_model');

  const missing = evaluateCatalogCompat(null, fp([img()]));
  assert.equal(missing.catalogAvailable, false);
  assert.equal(primaryRejectionCode(missing), 'catalog_unavailable');
});

// ============================================================================
// Auto adaptation ordering
// ============================================================================

test('auto-pick ①：当前 model+operation 仍兼容 → keep_current', () => {
  const pick = planAutoAdaptation({
    catalog: createCompatTestCatalog(),
    fingerprint: fp([img()]),
    outputType: 'image',
    currentModelId: 'img-ref',
    currentOperationId: 'image_to_image',
  });
  assert.equal(pick.rule, 'keep_current');
  assert.equal(pick.modelId, 'img-ref');
  assert.equal(pick.operationId, 'image_to_image');
  assert.equal(pick.keptCurrentModel, true);
  assert.equal(pick.keptCurrentOperation, true);
});

test('auto-pick ②：当前 model 的另一个兼容 operation → same_model', () => {
  const pick = planAutoAdaptation({
    catalog: createCompatTestCatalog(),
    fingerprint: fp([img()]),
    outputType: 'image',
    currentModelId: 'img-ref',
    currentOperationId: 'text_to_image',
  });
  assert.equal(pick.rule, 'same_model');
  assert.equal(pick.modelId, 'img-ref');
  assert.equal(pick.operationId, 'image_to_image');
  assert.equal(pick.keptCurrentOperation, false);
});

test('auto-pick ③：按输入兼容性选择剩余目录候选', () => {
  // 三张参考图排除两个小容量模型，仅 alias-img 能完整处理。
  const pick = planAutoAdaptation({
    catalog: createCompatTestCatalog(),
    fingerprint: fp([img(), img({ sourceNodeId: 'b' }), img({ sourceNodeId: 'c' })]),
    outputType: 'image',
    currentModelId: 'img-prompt-only',
    currentOperationId: 'text_to_image',
  });
  // 3 张图：img-ref max2 不兼容，img-hd max1 不兼容，alias-img max4 兼容。
  assert.equal(pick.rule, 'catalog_order');
  assert.equal(pick.modelId, 'alias-img');
  assert.equal(pick.operationId, 'image_to_image');
});

test('auto-pick ④：byOperation 默认 → operation_default', () => {
  const pick = planAutoAdaptation({
    catalog: createCompatTestCatalog(),
    fingerprint: fp([img()]),
    outputType: 'image',
    currentModelId: 'img-solo',
    currentOperationId: 'image_to_image',
  });
  // img-solo（solo family）无兼容 op；defaultsByOperation.image_to_image = img-hd。
  assert.equal(pick.rule, 'operation_default');
  assert.equal(pick.modelId, 'img-hd');
});

test('auto-pick ⑤：目录稳定序第一 → catalog_order；零候选 → null', () => {
  const pick = planAutoAdaptation({
    catalog: createCompatTestCatalog(),
    fingerprint: fp([img({ sizeBytes: 5 * MB })]),
    outputType: 'image',
    currentModelId: 'img-solo',
  });
  // 5MB：img-hd max2MB 不行；img-ref（目录序 1）兼容。
  assert.equal(pick.rule, 'catalog_order');
  assert.equal(pick.modelId, 'img-ref');

  const none = planAutoAdaptation({
    catalog: createCompatTestCatalog(),
    fingerprint: fp([img({ mimeType: 'image/gif' })]),
    outputType: 'image',
  });
  assert.equal(none, null);

  const noCatalog = planAutoAdaptation({
    catalog: null,
    fingerprint: fp([img()]),
    outputType: 'image',
  });
  assert.equal(noCatalog, null);
});

test('auto-pick：alias 寻址当前模型也遵循 keep_current', () => {
  const pick = planAutoAdaptation({
    catalog: createCompatTestCatalog(),
    fingerprint: fp([img()]),
    outputType: 'image',
    currentModelId: 'alias-img-wire',
    currentOperationId: 'image_to_image',
  });
  assert.equal(pick.rule, 'keep_current');
  assert.equal(pick.modelId, 'alias-img');
});

// ============================================================================
// Merged capability (facade)
// ============================================================================

test('merged capability：只合并 listed ops（unlisted 的 max 8 不外泄）', () => {
  const view = buildContractView(createCompatTestCatalog());
  const imgRef = resolveModelView(view, 'img-ref');
  const merged = deriveMergedInputCapability(imgRef);
  assert.deepEqual(merged.modalities.sort(), ['image', 'text']);
  assert.equal(merged.referenceImages.max, 2);
  assert.deepEqual(merged.referenceImages.allowedMimeTypes, ['image/png', 'image/jpeg']);
  assert.deepEqual(merged.referenceImages.supportedRoles, ['reference']);
});
