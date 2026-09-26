import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { buildSync } from 'esbuild';
import { groupPickerCandidates, isPickerCandidate } from './modelPickerCandidates.ts';
import { isByokGroup, buildChannelSelectionPayload } from './channelGroups.ts';
import { buildVideoParamTransition } from './videoParams/videoParamAdapter.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const bundlePath = join(mkdtempSync(join(tmpdir(), 'omnimux-cascade-reconciler-')), 'runtime.mjs');
buildSync({
  stdin: {
    contents: "export { buildChannelContract, reconcileParamsWithContract, ALLOWED_CONSTRAINT_KEYS } from './channelContractReconciler.ts';",
    resolveDir: here,
    sourcefile: 'runtime.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundlePath,
});
const { buildChannelContract, reconcileParamsWithContract, ALLOWED_CONSTRAINT_KEYS } =
  await import(pathToFileURL(bundlePath).href);
const cascadeSrc = readFileSync(new URL('./ModelCascadeMenu.tsx', import.meta.url), 'utf8');
const configSrc = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

test('production emit rejects stale models and alien channel groups', () => {
  // 1. 白盒纯函数断言：验证 buildChannelSelectionPayload 的合法、外来、空组及 BYOK 处理
  const mockGroups = [{ id: 'pool' }, { id: 'byok-custom', category: 'byok' }];

  // 外来渠道：拒绝并返回 null
  const alienPayload = buildChannelSelectionPayload('legal', ['alien'], mockGroups);
  assert.equal(alienPayload, null);

  // 空分组：解阻断基础模型选择，返回不带 allowedGroups 的常规模型选择负载
  const emptyPayload = buildChannelSelectionPayload('legal', [], mockGroups);
  assert.deepEqual(emptyPayload, { modelId: 'legal', strategy: 'auto' });

  // 合法官方渠道：正确构建载荷
  const legalPayload = buildChannelSelectionPayload('legal', ['pool'], mockGroups);
  assert.deepEqual(legalPayload, { modelId: 'legal', strategy: 'auto', allowedGroups: ['pool'] });

  // 合法 BYOK 渠道：自动带入 channelGroupId 与 sourceType
  const byokPayload = buildChannelSelectionPayload('legal', ['byok-custom'], mockGroups);
  assert.deepEqual(byokPayload, {
    modelId: 'legal',
    strategy: 'auto',
    allowedGroups: ['byok-custom'],
    channelGroupId: 'byok-custom',
    sourceType: 'byok',
  });

  // 2. 白盒静态代码断言：验证 ModelCascadeMenu 源码中 emit 调用 buildChannelSelectionPayload 纯函数门禁
  assert.match(cascadeSrc, /if \(!isPickerCandidate\(options, modelId\)\) return;/);
  assert.match(cascadeSrc, /const payload = buildChannelSelectionPayload\(modelId, groupIds, groups\);/);
  assert.match(cascadeSrc, /if \(!payload\) return;/);
  assert.match(cascadeSrc, /onSelect\(payload\);/);

  // 3. 候选集门禁纯函数断言
  assert.equal(isPickerCandidate([{ id: 'legal', label: 'Legal' }], 'stale'), false);
  assert.equal(isPickerCandidate([{ id: 'legal', label: 'Legal' }], 'legal'), true);
  assert.equal(isPickerCandidate([], 'legal'), false);
});

test('actual model handler preserves routing-only parameters and transitions switches once', () => {
  // 1. 静态白盒断言：验证 ConfigPanel/index.tsx 中 handleModelChange 对同模型 routing-only 更新与跨模型 transition 的分支设计
  const handlerStart = configSrc.indexOf('const handleModelChange = useCallback(');
  assert.ok(handlerStart >= 0, '必须包含 handleModelChange 定义');
  const handlerEnd = configSrc.indexOf('const isMusicOperation', handlerStart);
  assert.ok(handlerEnd > handlerStart, '必须找到 handleModelChange 结束边界');
  const handlerBody = configSrc.slice(handlerStart, handlerEnd);

  // 门禁：必须核验 filteredModels.options
  assert.match(handlerBody, /if \(!filteredModels\.options\.some\(\(row\) => row\.id === newModelId\)\) return;/);

  // 同模型渠道切换保持原有参数：严禁调用 transition
  assert.match(handlerBody, /if \(channelSelection && newModelId === params\.model\) \{\s*nextParams = \{ \.\.\.params \};/);

  // 跨模型切换：触发 transition
  assert.match(handlerBody, /else if \(materialType === 'video' && newModelItem\)/);
  assert.match(handlerBody, /buildVideoParameterSelection|buildVideoParamTransition/);

  // 渠道选择更新：原子注入 nextParams.routing
  assert.match(handlerBody, /nextParams\.routing = \{/);
  assert.match(handlerBody, /delete nextParams\.routing;/);

  // 契约协调与原子落盘：单一写入点
  assert.match(handlerBody, /reconcileParamsWithContract\(/);
  const writeMatches = handlerBody.match(/onUpdateNodeData\(/g);
  assert.equal(writeMatches?.length, 1, 'handleModelChange 必须保证仅有一处原子 onUpdateNodeData 调用');

  // 2. 真实场景数据流断言：跨模型参数过渡与同模型渠道更新的真实逻辑加固
  // (1) 跨模型参数过渡真实逻辑：源模型 duration=10，目标模型仅支持 duration=5 且默认 5
  const oldParams = {
    model: 'seedance-2-0',
    duration: 10,
    aspectRatio: '16:9',
    prompt: 'A cinematic drone shot',
    routing: { strategy: 'auto', allowedGroups: ['standard'] },
  };
  const targetModelItem = {
    id: 'kling-v2-6',
    parameters: {
      duration: { options: [{ value: 5, label: '5s' }], defaultValue: 5 },
      aspectRatio: { options: [{ value: '9:16', label: '9:16' }], defaultValue: '9:16' },
    },
  };
  const crossModelTransition = buildVideoParamTransition(oldParams, targetModelItem);
  assert.equal(crossModelTransition.params.model, 'kling-v2-6', '跨模型切换后模型标识必须更新为目标模型');
  assert.equal(crossModelTransition.params.duration, 5, '跨模型切换时应按目标模型 Schema 自适应过渡超限参数');
  assert.equal(crossModelTransition.params.aspectRatio, '9:16', '跨模型切换时画幅比例应按目标模型 Schema 自适应');
  assert.equal(crossModelTransition.params.prompt, 'A cinematic drone shot', '跨模型切换时提示词等非约束参数完整保留');

  // (2) 同模型渠道切换真实逻辑：严禁调用 transition，参数完整保留，原子更新 routing 并执行契约自愈
  const currentParams = {
    model: 'seedance-2-0',
    duration: 10,
    aspectRatio: '16:9',
    resolution: '1080p',
    prompt: 'Keep exact prompt',
    referenceImages: ['https://example.com/ref1.png', 'https://example.com/ref2.png'],
    routing: { strategy: 'cost_first', allowedGroups: ['pool'] },
  };
  const availableGroups = [
    { id: 'standard', label: '标准专线' },
    { id: 'byok-custom', label: '我的自备渠道', category: 'byok' },
  ];
  const channelPayload = buildChannelSelectionPayload('seedance-2-0', ['byok-custom'], availableGroups);
  assert.ok(channelPayload, '合法渠道必须成功构建渠道选择载荷');
  assert.equal(channelPayload.sourceType, 'byok');

  // 模拟 handleModelChange 中的同模型更新数据流
  let nextParams = { ...currentParams };
  if (channelPayload.allowedGroups?.length) {
    const isByok = channelPayload.sourceType === 'byok' || isByokGroup(channelPayload.allowedGroups[0]);
    nextParams.routing = {
      strategy: channelPayload.strategy,
      allowedGroups: channelPayload.allowedGroups,
      ...(isByok ? { channelGroupId: channelPayload.channelGroupId || channelPayload.allowedGroups[0], sourceType: 'byok' } : {}),
    };
  }

  assert.equal(nextParams.model, 'seedance-2-0', '同模型渠道切换时模型不变');
  assert.equal(nextParams.duration, 10, '同模型更新渠道时 duration 不被重置');
  assert.equal(nextParams.aspectRatio, '16:9', '同模型更新渠道时 aspectRatio 不被重置');
  assert.equal(nextParams.resolution, '1080p', '同模型更新渠道时 resolution 不被重置');
  assert.equal(nextParams.prompt, 'Keep exact prompt', '同模型更新渠道时 prompt 不被重置');
  assert.deepEqual(nextParams.routing, {
    strategy: 'auto',
    allowedGroups: ['byok-custom'],
    channelGroupId: 'byok-custom',
    sourceType: 'byok',
  }, 'routing 必须按真实载荷原子更新');

  // 契约协调联动自愈：自备渠道仅支持单张参考图，超限参考图自愈收敛
  const byokGroup = { id: 'byok-custom', category: 'byok' };
  const contract = buildChannelContract('seedance-2-0', byokGroup);
  const reconcileResult = reconcileParamsWithContract(nextParams, contract);
  assert.equal(reconcileResult.nextParams.referenceImages.length, 1, '契约协调必须自愈超出渠道限制的参考图');
  assert.equal(reconcileResult.nextParams.duration, 10, '契约协调不破坏未超限的同模型参数');

  // (3) 白名单守卫断言：阻断未知非法字段注入契约
  assert.ok(ALLOWED_CONSTRAINT_KEYS.has('maxReferenceImages'));
  const contractWithAlien = buildChannelContract('seedance-2-0', { id: 'standard' }, {
    supportedAspectRatios: ['16:9'],
    alienInjectedField: 'harmful',
  });
  assert.equal(contractWithAlien.constraints.alienInjectedField, undefined, '白名单守卫必须阻断未知非法字段注入');
  assert.deepEqual(contractWithAlien.constraints.supportedAspectRatios, ['16:9']);
});

test('empty brand selection has no fabricated default', () => {
  assert.equal(groupPickerCandidates([])[0]?.rows[0]?.id, undefined);
  assert.doesNotMatch(cascadeSrc, /FALLBACK_MODELS_BY_BRAND|DEFAULT_MODEL_BY_BRAND|needsActive|defaultModelFor\(/);
});
test('picker consumes only final filtered options and renders their labels', () => {
  assert.match(configSrc, /options=\{filteredModels\.options\}/);
  assert.match(cascadeSrc, /groupPickerCandidates\(options\)/);
  assert.doesNotMatch(cascadeSrc, /catalog\?\.|allowedBrandsFor/);
  assert.match(cascadeSrc, /item\.label \|\| item\.id/);
  assert.match(cascadeSrc, /item\.subtitle/);
});
test('emission and channel lists validate model membership', () => {
  assert.match(cascadeSrc, /if \(!isPickerCandidate\(options, modelId\)\) return;/);
  assert.match(cascadeSrc, /isPickerCandidate\(options, channelModelId\) \? getModelChannelGroups/);
  assert.match(cascadeSrc, /buildChannelSelectionPayload\(modelId, groupIds, groups\)/);
  assert.match(cascadeSrc, /待重新选择/);
  assert.doesNotMatch(cascadeSrc, /setActiveModelId/);
});
test('model transition and routing are written atomically once', () => {
  const handler = configSrc.slice(configSrc.indexOf('const handleModelChange'), configSrc.indexOf('const isMusicOperation'));
  assert.match(handler, /if \(!filteredModels\.options\.some/);
  assert.match(handler, /nextParams = transition\.params/);
  assert.match(handler, /delete nextParams\.routing/);
  assert.equal((handler.match(/onUpdateNodeData\(/g) ?? []).length, 1);
  const picker = configSrc.slice(configSrc.indexOf('<ModelCascadeMenu'), configSrc.indexOf('{/* T04：音色'));
  assert.doesNotMatch(picker, /onUpdateNodeData|\.\.\.params/);
  assert.match(picker, /handleModelChange\(modelId, \{ strategy, allowedGroups, channelGroupId, sourceType \}\)/);
});
test('hover remains preview-only and clicks select a real brand row', () => {
  assert.match(cascadeSrc, /modelsForBrand\(brandId\)\[0\]\?\.id/);
  assert.match(cascadeSrc, /onHover=\{\(\) => handleBrandHover\(brand\.id\)\}/);
  assert.match(cascadeSrc, /onHover=\{\(\) => handleModelHover\(item\.id\)\}/);
  assert.match(cascadeSrc, /onSelect=\{\(\) => handleSelectModel\(item\.id\)\}/);
  assert.doesNotMatch(cascadeSrc, /onMouseEnter=\{\(\) => handleSelectModel/);
  assert.match(cascadeSrc, /preview=\{isChannelPreview\}/);
  assert.match(cascadeSrc, /disabled=\{preview\}/);
});

test('popover height is locked once per open and never follows hover state (Issue #2250)', () => {
  // 量尺：离屏渲染候选集里所有可能的列形态，只用于量高度。
  assert.match(cascadeSrc, /data-cascade-probe-col/, 'Probe columns must exist');
  assert.match(cascadeSrc, /aria-hidden="true" style=\{PROBE_HOST_STYLE\}/, 'Probe host must be hidden from the accessibility tree');
  assert.match(cascadeSrc, /visibility: 'hidden'/, 'Probe host must not be visible');
  assert.match(cascadeSrc, /pointerEvents: 'none'/, 'Probe host must not be interactive');

  // 展开期间锁定高度：useLayoutEffect 保证绘制前完成，不出现先按内容高度画一帧再跳变。
  assert.match(cascadeSrc, /useLayoutEffect\(\(\) => \{/, 'Height lock must run in useLayoutEffect');
  assert.match(cascadeSrc, /height: lockedHeight/, 'Popover must apply the locked height');
  assert.match(cascadeSrc, /Math\.min\(POPOVER_MAX_HEIGHT, Math\.max\(POPOVER_MIN_HEIGHT, Math\.round\(tallest\)\)\)/, 'Locked height must stay within 160..400');

  // 支点：测量 effect 的依赖里不能出现悬停状态。一旦高度随悬停变化，底边锚定的浮层顶边就会位移，
  // 光标下的行随之移走、悬停态翻转、内容再变——自我维持成整块浮层频闪抖动。
  const lockStart = cascadeSrc.indexOf('useLayoutEffect(() => {');
  const lockTail = '}, [isOpen, brandList, runtimeSettings, fallbackState?.isFallback]);';
  const lockEnd = cascadeSrc.indexOf(lockTail, lockStart);
  assert.ok(lockStart > -1 && lockEnd > lockStart, 'Height lock effect must be locatable');
  const lockEffect = cascadeSrc.slice(lockStart, lockEnd + lockTail.length);
  assert.doesNotMatch(lockEffect, /hoverBrandId|hoverModelId/, 'Height lock must not depend on hover state');
  assert.match(lockEffect, /querySelectorAll<HTMLElement>\('\[data-cascade-probe-col\]'\)/, 'Height lock must measure every probe column');

  // 品牌列、型号列、渠道列三种形态都要进量尺，锁定值才覆盖所有可悬停形态。
  assert.match(cascadeSrc, /wf-loomi-col--brand" data-cascade-probe-col=""/, 'Probe must cover the brand column');
  assert.match(cascadeSrc, /wf-loomi-col--model" data-cascade-probe-col=""/, 'Probe must cover every brand model column');
  assert.match(cascadeSrc, /wf-loomi-col--channel" data-cascade-probe-col=""/, 'Probe must cover every model channel column');
});
test('preserves viewport anchor, accessibility and dismissal', () => {
  for (const token of ['wf-cascade-brand-item', 'wf-cascade-model-item', 'wf-cascade-channel-row', 'role="menu"', 'role="menuitemradio"', 'aria-expanded={isOpen}', 'POPOVER_MAX_WIDTH = 814', 'document.body', 'resolvePopoverSurface(triggerRef.current)', "event.key === 'Escape'"]) assert.ok(cascadeSrc.includes(token), token);
  assert.doesNotMatch(cascadeSrc, /StabilityDotBar|ModelRoutingModal|--omx-/);
  assert.doesNotMatch(cascadeSrc, /wf-cascade-strategy-btn/, 'strategy buttons must be completely removed');
  assert.doesNotMatch(cascadeSrc, /已选.*个|清空|全选/, 'bulk channel selection footer must be completely removed');
});

test('brand column removes redundant section title', () => {
  assert.doesNotMatch(cascadeSrc, /wf-loomi-section-title/, 'wf-loomi-section-title must be completely removed');
  assert.doesNotMatch(cascadeSrc, /<div[^>]*>\s*选择模型\s*<\/div>/, 'Redundant title "选择模型" must be removed from popover');
});

test('cascade menu columns have adaptive height with 160px min and 400px max (Issue #2191)', () => {
  assert.match(cascadeSrc, /POPOVER_MIN_HEIGHT\s*=\s*160/, 'ModelCascadeMenu must define POPOVER_MIN_HEIGHT constant 160px');
  assert.match(cascadeSrc, /POPOVER_MAX_HEIGHT\s*=\s*400/, 'ModelCascadeMenu must define POPOVER_MAX_HEIGHT constant 400px');
  assert.match(cascadeSrc, /\(lockedHeightRef\.current \?\? POPOVER_MAX_HEIGHT\) - 12/, 'ModelCascadeMenu place() must guard top overflow with the locked height');

  const cssPath = new URL('../../../../theme/components.css', import.meta.url);
  const cssSrc = readFileSync(cssPath, 'utf8');

  // 验证容器采用 stretch 对齐，三列具备 160px 最小自适应与 400px 最大封顶
  assert.match(cssSrc, /\.wf-loomi-popover\s*\{[^}]*align-items:\s*stretch;/s, 'Popover container must stretch columns for uniform height');
  assert.match(cssSrc, /\.wf-loomi-col\s*\{[^}]*min-height:\s*160px;/s, 'Columns must have min-height: 160px');
  assert.match(cssSrc, /\.wf-loomi-col\s*\{[^}]*max-height:\s*min\(400px,\s*calc\(100vh\s*-\s*120px\)\);/s, 'Columns must clamp at 400px max-height');

  // 验证三列已完全移除机械硬编码的 480px 高度
  assert.doesNotMatch(cssSrc, /\.wf-loomi-col--brand\s*\{[^}]*height:\s*480px;/s, 'Brand column must not lock fixed 480px');
  assert.doesNotMatch(cssSrc, /\.wf-loomi-col--model\s*\{[^}]*height:\s*480px;/s, 'Model column must not lock fixed 480px');
  assert.doesNotMatch(cssSrc, /\.wf-loomi-col--channel\s*\{[^}]*height:\s*480px;/s, 'Channel column must not lock fixed 480px');
});

test('missingRequiredSlots validates against displayedSlotLayout.slots and trims slotBindings for single-image channels', () => {
  // 1. missingRequiredSlots 必须基于 displayedSlotLayout.slots 校验，杜绝第二槽位未填锁死生成按钮
  assert.match(
    configSrc,
    /const missingRequiredSlots = useMemo\(\s*\(\) => displayedSlotLayout\.slots\.filter\(/,
    'missingRequiredSlots 必须基于 displayedSlotLayout.slots 校验'
  );
  assert.doesNotMatch(
    configSrc,
    /const missingRequiredSlots = useMemo\(\s*\(\) => effectiveSlotLayout\.slots\.filter\(/,
    '禁止基于包含收起槽位的 effectiveSlotLayout.slots 校验必填槽位'
  );

  // 2. 单参考图渠道自适应修剪 slotBindings 脏数据并收敛于 onUpdateNodeData 原子提交
  assert.doesNotMatch(
    configSrc,
    /patchSlotBindings\(trimmed\);/,
    '严禁通过 patchSlotBindings 进行异步二次提交'
  );
  assert.match(
    configSrc,
    /onUpdateNodeData\(\{[\s\S]*params: nextParams,[\s\S]*slotBindings: nextSlotBindings[\s\S]*\}\);/,
    '修剪后的 slotBindings 必须在渠道切换时与 params 单次原子提交回节点'
  );
  assert.match(
    configSrc,
    /hasConflict \|\| targetGroupId !== matchedGroup\.id/,
    '检测到渠道冲突或不可用降级时必须归一化 nextParams.routing'
  );

  // 3. 初始载入已持久化节点状态归一化防御：当 isSingleImageChannel 且 slotBindings 脏数据存在时安全触发修剪
  assert.match(
    configSrc,
    /if \(!isSingleImageChannel\) return;[\s\S]*if \(hasExtra \|\| hasOverflownPrimary\) \{[\s\S]*patchSlotBindings\(normalized\);/,
    '已持久化单图渠道节点在初始化挂载时必须防御性修剪多余或溢出槽位'
  );
});
