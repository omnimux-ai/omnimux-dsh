/**
 * 集成契约测试 — ConfigPanel 全模态接线（2026-09-07 全模态收敛 / T06 更新；Issue #763 更新）
 *
 * 以源码契约风格（readFileSync + node:test）锁定 ConfigPanel 与三材质
 * 组件群的集成边界：
 *  - ConfigPanel 消费 VideoTriggerBar / VideoParamPopover / 参数解析与回退适配器；
 *  - 图像分支废除 wf-param-pill--video-summary 幽灵 Select，改挂
 *    ImageTriggerBar / ImageParamPopover；
 *  - 音频（非 ASR）分支在 Issue #763 中彻底移除 AudioTriggerBar / AudioParamPopover
 *    （时长由文本长度决定），底栏只保留模型下拉 + wf-voice-trigger + 生成按钮；
 *  - handleModelChange 委托 buildVideoParameterSelection（仅视频）；
 *  - videoPopoverOpen / imagePopoverOpen 状态接线存在（音频浮层状态已随 #763 移除）；
 *  - components.css 已下线 .wf-param-pill--video-summary；
 *
 * i18n 决策记录：cfg/imageParams/audioParams 组件群沿用硬编码中文（生成方式/
 * 比例/清晰度/时长/音色/纯音乐等），与仓库同模块既有硬编码中文先例保持一致，
 * 不引入 panel.*Param* key，避免半中半典。
 */
import assert from 'node:assert/strict';
import { deriveSlotLayout, autoFillSlots, effectiveSlotFingerprint, feedFromFingerprint } from '../../../../../../shared/graph/feedSlot/index.ts';
import { resolveSlotOperation } from '../../../../../../shared/graph/feedSlot/resolveSlotOperation.ts';
import { buildUiUpstreamFingerprint, buildEffectiveOpsUiState, shouldRenderModeUi } from '../../../../../../shared/validation/operationUi.ts';
import { resolveEffectiveVideoParams, validateVideoParamsForUi } from './videoParamAdapter.ts';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPanelPath = join(__dirname, '..', 'index.tsx');
const componentsCssPath = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'theme',
  'components.css',
);
const source = readFileSync(configPanelPath, 'utf8');
const css = readFileSync(componentsCssPath, 'utf8');

test('load migration is revision guarded and does not replay after undo', () => {
  assert.match(source, /migrationCatalogRef/);
  assert.match(source, /liveState\.future\.length > 0/);
  assert.match(source, /liveNode\.data\.params !== params/);
});

test('actual migration effect preserves redo after panel remount and rejects stale params', () => {
  const body = source.match(/useEffect\(\(\) => \{\n    if \(!videoSelection\?\.parameterSelections[\s\S]*?\n  \}, \[videoSelection/)[0].replace(/^useEffect\(\(\) => \{/, '').replace(/\n  \}, \[videoSelection$/, '');
  const run = new Function('videoSelection','activeCatalog','migrationCatalogRef','migrationKey','useCanvasStore','nodeId','params','parameterSelections','commitVideoSelection',body);
  const params = {model:'a',resolution:'480p'}; const selection={params:{model:'a',resolution:'720p'},parameterSelections:{version:1,byModel:{}}};
  let writes=0; const invoke=(state,ref={current:new Map()})=>run(selection,{},ref,'w:a',{getState:()=>state},'a',params,undefined,()=>writes++);
  invoke({future:[{}],nodes:[{id:'a',data:{params}}]});
  invoke({future:[{}],nodes:[{id:'a',data:{params}}]}); // new ref simulates remount
  assert.equal(writes,0);
  invoke({future:[],nodes:[{id:'a',data:{params:{...params,resolution:'1080p'}}}]});
  assert.equal(writes,0);
  invoke({future:[],nodes:[{id:'a',data:{params}}]});
  assert.equal(writes,1);
});

test('model cascade delegates one atomic model/routing/history update without stale params write', () => {
  const selectKey = 'onSelect={({ modelId, strategy, allowedGroups';
  const callback = source.slice(source.indexOf(selectKey), source.indexOf(selectKey) + 700).split('/>')[0];
  assert.doesNotMatch(callback, /onUpdateNodeData|\.\.\.params/);
  assert.match(callback, /handleModelChange\(modelId,/);
  assert.match(source, /parameterSelections: transition.parameterSelections/);
});

const imageSlot = slot => ({slot,type:'image',role:'reference',source:'upstream_edge',min:1,max:1});
const videoCatalog = {models:[{id:'video-test',operations:[
  {id:'text_to_video',listed:true,output:{type:'video'},inputs:[]},
  {id:'first_frame',listed:true,output:{type:'video'},inputs:[imageSlot('first_frame')]},
  {id:'first_last_frame',listed:true,output:{type:'video'},inputs:[imageSlot('first_frame'),imageSlot('last_frame')]},
  {id:'video_multi_ref',listed:true,output:{type:'video'},inputs:[{...imageSlot('reference_images'),max:3}]},
]}]};

test('video raw supply keeps modes discoverable while the selected first-frame gate consumes one image', () => {
  const raw = buildUiUpstreamFingerprint({prompt:'1dog',upstreams:[0,1].map(i => ({nodeId:`image-${i}`,edgeId:`edge-${i}`,materialType:'image',hasMedia:true,url:`https://example.test/${i}.png`,mimeType:'image/png'}))});
  const operation = resolveSlotOperation(videoCatalog, 'video-test', 'first_frame', 'video', raw);
  assert.equal(operation, 'first_frame');
  const layout = deriveSlotLayout(videoCatalog, 'video-test', operation, 'video');
  assert.deepEqual(layout.slots.map(s => s.slot), ['first_frame']);
  const fill = autoFillSlots(feedFromFingerprint(raw), layout);
  const consumed = effectiveSlotFingerprint(raw, layout, fill.bindings, []);
  assert.equal(consumed.assets.filter(a => a.type === 'image').length, 1);
  const args = {catalog:videoCatalog,modelId:'video-test',preferredOperationId:operation,outputType:'video'};
  const available = buildEffectiveOpsUiState({...args,fingerprint:raw});
  assert.equal(shouldRenderModeUi(available), true);
  assert.deepEqual(available.effectiveOps.map(op => op.id), ['text_to_video','first_frame','first_last_frame','video_multi_ref']);
  const current = buildEffectiveOpsUiState({...args,fingerprint:consumed});
  assert.equal(current.selectedOperationId, 'first_frame');
  assert.equal(current.blockGenerate, false);
  const disconnected = buildUiUpstreamFingerprint({prompt:'1dog',upstreams:[]});
  assert.equal(resolveSlotOperation(videoCatalog, 'video-test', 'first_frame', 'video', disconnected), 'first_frame');
  const missing = buildEffectiveOpsUiState({...args,fingerprint:disconnected});
  assert.equal(missing.blockGenerate, true);
});

test('R4: standby image cannot erase a single-operation duration schema or its validation', () => {
  const duration = {options:[{value:5}],defaultValue:5};
  const catalog = {models:[{id:'single-frame',operations:[{id:'first_frame',listed:true,output:{type:'video'},inputs:[{slot:'prompt',type:'text',role:'prompt',source:'node_field',min:0,max:1},imageSlot('first_frame')],parameters:{duration}}]}]};
  const upstreams = [0,1].map(i => ({nodeId:`image-${i}`,edgeId:`edge-${i}`,materialType:'image',hasMedia:true,availability:'ready',url:`https://example.test/${i}.png`,mimeType:'image/png'}));
  upstreams.push({nodeId:'table',edgeId:'table-edge',materialType:'table',textContent:'table-body-unique',availability:'ready'});
  const raw = buildUiUpstreamFingerprint({prompt:'1dog',upstreams});
  const layout = deriveSlotLayout(catalog, 'single-frame', 'first_frame', 'video');
  const bindings = {first_frame:[{edgeId:'edge-0',sourceNodeId:'image-0'}]};
  const consumed = effectiveSlotFingerprint(raw, layout, bindings, []);
  const consumedEdgeIds = new Set(consumed.assets.map(asset => asset.edgeId));
  const consumedUpstreams = upstreams.filter(item => consumedEdgeIds.has(item.edgeId) && ['image', 'video', 'audio'].includes(item.materialType));
  assert.equal(upstreams.filter(item => item.materialType === 'image').length, 2);
  assert.equal(consumed.prompt.split('table-body-unique').length - 1, 1);
  const adapterFingerprint = buildUiUpstreamFingerprint({prompt:consumed.prompt,upstreams:consumedUpstreams});
  assert.equal(adapterFingerprint.prompt, consumed.prompt, '适配器重算不得再次拼接table正文');
  assert.deepEqual(consumedUpstreams.map(item => item.edgeId), ['edge-0']);
  const rawParams = {model:'single-frame',operation:'first_frame',duration:10};
  const effective = resolveEffectiveVideoParams({params:rawParams,schema:{},modelItem:catalog.models[0],catalog,upstreams:consumedUpstreams,prompt:consumed.prompt});
  assert.deepEqual(effective.schema.duration, duration);
  assert.equal(effective.duration, 10, '非法保存值不能被静默改成默认值');
  const errors = validateVideoParamsForUi({prompt:consumed.prompt,rawParams,params:effective,upstreams:consumedUpstreams});
  assert.ok(errors.length > 0);
  assert.ok(errors.some(error => error.includes('duration') && error.includes('10')));
  const validRaw = {...rawParams,duration:5};
  const valid = resolveEffectiveVideoParams({params:validRaw,schema:{},modelItem:catalog.models[0],catalog,upstreams:consumedUpstreams,prompt:consumed.prompt});
  assert.deepEqual(validateVideoParamsForUi({prompt:consumed.prompt,rawParams:validRaw,params:valid,upstreams:consumedUpstreams}), []);
  const panelResolution = source.slice(source.indexOf('const videoEffectiveParams ='), source.indexOf('const videoEffectiveParams =') + 1000);
  assert.match(panelResolution, /upstreams: consumedUpstreams\.filter\(\(source\) => \['image', 'video', 'audio'\]\.includes\(source\.materialType\)\)/);
  assert.match(panelResolution, /prompt: consumedFingerprint\.prompt/);
});

test('ConfigPanel 导入并消费 VideoTriggerBar / VideoParamPopover', () => {
  assert.ok(
    source.includes("import { VideoTriggerBar } from './videoParams/VideoTriggerBar';"),
    '应导入 VideoTriggerBar',
  );
  assert.ok(
    source.includes("import { VideoParamPopover } from './videoParams/VideoParamPopover';"),
    '应导入 VideoParamPopover',
  );
  assert.ok(source.includes('<VideoTriggerBar'), '视频分支应渲染 <VideoTriggerBar>');
  assert.ok(source.includes('<VideoParamPopover'), '面板根部应渲染 <VideoParamPopover>');
});

test('图像 / 音频分支幽灵入口已移除（wf-param-pill--video-summary 全源码 0 处）', () => {
  const occurrences = (source.match(/wf-param-pill--video-summary/g) || []).length;
  assert.equal(
    occurrences,
    0,
    'wf-param-pill--video-summary 幽灵 Select 已随图像分支废除，源码不得再出现',
  );
  // 视频分支使用 TriggerBar 包裹层
  const videoBlock = source.slice(
    source.indexOf("{materialType === 'video'"),
    source.indexOf('{materialType === \'video\'', source.indexOf("{materialType === 'video'") + 1) + 4000,
  );
  assert.ok(videoBlock.includes('wf-video-trigger-bar__wrap'), '视频分支应含 TriggerBar 包裹层');
});

test('handleModelChange 仅视频模型消费 buildVideoParameterSelection', () => {
  assert.ok(
    source.includes('buildVideoParameterSelection('),
    'handleModelChange 应委托 buildVideoParameterSelection',
  );
  assert.ok(
    source.includes("if (materialType === 'video' && newModelItem) {"),
    '只有目录中的视频模型使用视频参数转换，其他类型由共享兼容状态决定方式',
  );
  // W2: catalog/upstreams 传入 fallback，便于 operation 收敛
  assert.ok(source.includes('catalog: activeCatalog') || source.includes('catalog,'));
});

test('videoPopoverOpen 状态与 setVideoPopoverOpen 接线存在', () => {
  assert.ok(source.includes('const [videoPopoverOpen, setVideoPopoverOpen] = useState(false);'));
  assert.ok(source.includes('setVideoPopoverOpen(false)'));
  assert.ok(source.includes('setVideoPopoverOpen((p) => !p)'));
  assert.ok(source.includes('videoTriggerRef'));
});

test('视频有效参数经 resolveEffectiveVideoParams 解析（消费 catalog/upstreams）', () => {
  assert.ok(
    source.includes('resolveEffectiveVideoParams({'),
    '应通过 resolveEffectiveVideoParams 对象参数解析有效视频参数',
  );
  assert.ok(source.includes('catalog: activeCatalog') || source.includes('catalog,'), '应传入 catalog');
  assert.ok(source.includes('videoEffectiveParams'));
});

test('图像分支废除幽灵 CustomSelect，改挂 ImageTriggerBar / ImageParamPopover', () => {
  assert.ok(
    source.includes("import { ImageTriggerBar } from './imageParams/ImageTriggerBar';"),
    '应导入 ImageTriggerBar',
  );
  assert.ok(
    source.includes("import { ImageParamPopover } from './imageParams/ImageParamPopover';"),
    '应导入 ImageParamPopover',
  );
  assert.ok(source.includes('resolveEffectiveImageParams({'), '应经 resolveEffectiveImageParams 解析');
  const imageBlock = source.slice(source.indexOf("{materialType === 'image'"));
  assert.ok(imageBlock.includes('<ImageTriggerBar'), '图像分支应渲染 <ImageTriggerBar>');
  assert.ok(imageBlock.includes('<ImageParamPopover'), '面板根部应渲染 <ImageParamPopover>');
  assert.ok(imageBlock.includes('imagePopoverOpen'), '图像浮层状态接线存在');
  assert.ok(!imageBlock.includes('wf-param-bar__select--ghost'), '图像分支不得再含幽灵 Select');
});

test('音频（非 ASR）分支：Issue #763 移除时长摘要条与参数浮层，仅保留音色胶囊', () => {
  assert.ok(!source.includes('AudioTriggerBar'), '音频分支不得再渲染/导入 AudioTriggerBar');
  assert.ok(!source.includes('AudioParamPopover'), '面板根部不得再渲染/导入 AudioParamPopover');
  assert.ok(!source.includes('audioPopoverOpen'), '音频浮层状态已移除');
  assert.ok(!source.includes('audioTriggerRef'), '音频触发条 ref 已移除');
  assert.ok(source.includes('resolveEffectiveAudioParams({'), '音色读侧仍经 resolveEffectiveAudioParams 解析');
  assert.ok(source.includes('wf-voice-trigger'), '底栏保留 wf-voice-trigger 音色胶囊');
  assert.ok(source.includes("materialType === 'audio' && !isAsrTool"), 'ASR 分支守卫保留');
  assert.ok(!source.includes('SlidersHorizontal'), '音频底栏不得再有孤立齿轮');
  assert.ok(!source.includes('advanced-drawer'), '内联抽屉整段已废除');
  assert.ok(!source.includes('showAdvanced'), 'showAdvanced 状态已废除');
});

test('components.css 已下线 .wf-param-pill--video-summary，wf-cfg-* 双选择器在位', () => {
  assert.ok(
    !css.includes('.wf-param-pill--video-summary'),
    '图像不再消费该胶囊类，CSS 规则必须下线',
  );
  // cfg 底座与视频别名：单规则双选择器，数值只出现一次
  assert.ok(css.includes('.wf-cfg-summary-bar,'), 'wf-cfg-summary-bar 双选择器规则应存在');
  assert.ok(css.includes('.wf-video-trigger-bar'), 'wf-video-trigger-bar 别名应保留');
  assert.ok(css.includes('.wf-cfg-popover,'), 'wf-cfg-popover 双选择器规则应存在');
  assert.ok(css.includes('.wf-video-param-popover'), 'wf-video-param-popover 别名应保留');
});

test('i18n 决策锁定：videoParams 组件群保持硬编码中文，不引入 panel.videoParam*', () => {
  const zhDictPath = join(__dirname, '..', '..', '..', '..', '..', 'i18n', 'dict.zh.ts');
  const enDictPath = join(__dirname, '..', '..', '..', '..', '..', 'i18n', 'dict.en.ts');
  const zh = readFileSync(zhDictPath, 'utf8');
  const en = readFileSync(enDictPath, 'utf8');
  assert.ok(
    !zh.includes('videoParam') && !en.includes('videoParam'),
    '不应新增 panel.videoParam* i18n key（与仓库硬编码中文先例保持一致）',
  );
});

test('不应存在待确认视频参数调整提示与确认/保留原值动作（已移除）', () => {
  assert.ok(!source.includes('wf-video-param-notice'));
  assert.ok(!source.includes('确认调整'));
  assert.ok(!source.includes('保留原值'));
  assert.ok(!source.includes('Boolean(pendingVideoParamAdjustment)'));
});

test('Issue #986：ConfigPanel 为视频节点提供基于模型能力的卡槽驱动与素材模式双向流转', () => {
  assert.match(
    source,
    /materialType === 'video'/,
    '视频节点应支持基于模型能力的卡槽逻辑',
  );
  assert.match(source, /resolveSlotOperation\(activeCatalog, modelValue, preferredOperationId, outputTypeForCompat, fingerprint\)/);
  assert.match(source, /deriveSlotLayout\(activeCatalog, modelValue, currentOperationId\)/);
  assert.match(source, /fingerprint: consumedFingerprint/);
  assert.doesNotMatch(source, /updateParam\('operation', 'text_to_video'\)/, '断开供给不能重置已选模式');
});

test('Issue #1007：视频节点生成模式防退化长效保障，连线素材下生成模式选择器与底栏文字不可被误杀隐藏', () => {
  assert.match(
    source,
    /VideoTriggerBar/,
    '视频节点必须引入 VideoTriggerBar 作为四段式模式底栏',
  );
  assert.match(
    source,
    /VideoParamPopover/,
    '视频节点必须挂载 VideoParamPopover 支持多模式切换',
  );
  assert.match(
    source,
    /shouldRenderModeUi\(availableOpsState\)/,
    '模式发现使用原始供给，当前提交门禁使用消费投影',
  );
});
