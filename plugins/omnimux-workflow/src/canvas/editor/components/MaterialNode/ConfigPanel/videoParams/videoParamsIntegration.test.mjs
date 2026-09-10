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
 *  - handleModelChange 委托 buildVideoParamTransition（仅视频）；
 *  - videoPopoverOpen / imagePopoverOpen 状态接线存在（音频浮层状态已随 #763 移除）；
 *  - components.css 已下线 .wf-param-pill--video-summary；
 *
 * i18n 决策记录：cfg/imageParams/audioParams 组件群沿用硬编码中文（生成方式/
 * 比例/清晰度/时长/音色/纯音乐等），与仓库同模块既有硬编码中文先例保持一致，
 * 不引入 panel.*Param* key，避免半中半典。
 */
import assert from 'node:assert/strict';
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

test('handleModelChange 仅视频模型消费 buildVideoParamTransition', () => {
  assert.ok(
    source.includes('buildVideoParamTransition('),
    'handleModelChange 应委托 buildVideoParamTransition',
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

test('Issue #982：ConfigPanel 为视频节点提供 first_frame 素材卡槽常驻兜底', () => {
  assert.match(
    source,
    /materialType === 'video' && \(slotLayout\.preset === 'none' \|\| slotLayout\.slots\.length === 0\)/,
    '视频节点应在空态或文生视频下提供常驻卡槽兜底',
  );
  assert.match(source, /opsState\.selectedOperationId \|\| 'text_to_video'/);
  assert.match(source, /preset:\s*'strip'/);
  assert.match(source, /addButton:\s*true/);
  assert.match(source, /panel\.slot\.first_frame/);
});
