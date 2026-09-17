import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { groupPickerCandidates, isPickerCandidate } from './modelPickerCandidates.ts';
import { transformSync } from 'esbuild';
const cascadeSrc = readFileSync(new URL('./ModelCascadeMenu.tsx', import.meta.url), 'utf8');
const configSrc = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

test('production emit rejects stale models and alien channel groups', () => {
  const start = cascadeSrc.indexOf('const emit = useCallback(') + 'const emit = useCallback('.length;
  const end = cascadeSrc.indexOf('}, [onSelect, options]);', start) + 1;
  const expression = transformSync(`const emit = ${cascadeSrc.slice(start, end)};`, { loader: 'ts' }).code;
  const calls = [];
  const options = [{ id: 'legal', label: 'Legal' }];
  const emit = new Function('options', 'isPickerCandidate', 'getModelChannelGroups', 'onSelect', `${expression}; return emit;`)(options, isPickerCandidate, () => [{ id: 'pool' }], (value) => calls.push(value));
  emit('stale', ['pool']);
  emit('legal', ['alien']);
  assert.equal(calls.length, 0);
  emit('legal', ['pool']);
  assert.deepEqual(calls, [{ modelId: 'legal', strategy: 'auto', allowedGroups: ['pool'] }]);
  options.length = 0;
  emit('legal', ['pool']);
  assert.equal(calls.length, 1);
});

test('actual model handler preserves routing-only parameters and transitions switches once', () => {
  const start = configSrc.indexOf('const handleModelChange = useCallback(') + 'const handleModelChange = useCallback('.length;
  const end = configSrc.indexOf('\n    [filteredModels.options', start);
  const expression = configSrc.slice(start, end).trim().replace(/,$/, '');
  const compiled = transformSync(`const handler = ${expression};`, { loader: 'ts' }).code;
  const params = { model: 'seedance-2-0', duration: 99, resolution: '480p', prompt: 'keep', routing: { strategy: 'cost_first' } };
  const writes = [];
  let transitions = 0;
  const context = {
    filteredModels: { options: [{ id: 'seedance-2-0' }, { id: 'seedance-2-5' }] },
    activeCatalog: { video: [{ id: 'seedance-2-0' }, { id: 'seedance-2-5' }] },
    materialType: 'video', params, modelValue: params.model,
    upstreamSnapshots: [], localPrompt: 'keep', fingerprint: {}, outputTypeForCompat: 'video', preferredOperationId: undefined,
    buildVideoParamTransition: (_params, model) => { transitions++; return { params: { model: model.id, duration: 5, resolution: '720p' } }; },
    onUpdateNodeData: (value) => writes.push(value), rememberGenerationModel: () => Promise.resolve(), toast: { error() {} }, t: x => x,
  };
  const handler = new Function(...Object.keys(context), `${compiled}; return handler;`)(...Object.values(context));
  handler('seedance-2-0', { strategy: 'stability_first', allowedGroups: ['pool'] });
  assert.equal(transitions, 0, 'routing-only must not invoke model transition');
  assert.deepEqual(writes, [{ params: { ...params, routing: { strategy: 'stability_first', allowedGroups: ['pool'] } } }]);
  handler('seedance-2-5', { strategy: 'cost_first', allowedGroups: ['pool'] });
  assert.equal(transitions, 1);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].params, { model: 'seedance-2-5', duration: 5, resolution: '720p', routing: { strategy: 'cost_first', allowedGroups: ['pool'] } });
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
  assert.match(cascadeSrc, /groupIds\.some\(\(id\) => !groups\.some/);
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
  assert.match(picker, /handleModelChange\(modelId, \{ strategy, allowedGroups \}\)/);
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
  const lockTail = '}, [isOpen, brandList]);';
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
