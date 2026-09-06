/**
 * T05 集成契约测试 — Video Param Popover 宿主接线
 *
 * 以源码契约风格（readFileSync + node:test）锁定 ConfigPanel 与 videoParams
 * 组件群的集成边界：
 *  - ConfigPanel 消费 VideoTriggerBar / VideoParamPopover / 参数解析与回退适配器；
 *  - 视频分支旧版 3 个 ghost CustomSelect 胶囊块已移除（wf-param-pill--video-summary
 *    仅剩图片分支一处消费）；
 *  - handleModelChange 委托 validateAndFallbackVideoParams；
 *  - videoPopoverOpen / setVideoPopoverOpen 状态接线存在；
 *  - 图片节点分支的 CustomSelect 逻辑保持不变；
 *  - components.css 中 .wf-param-pill--video-summary 因图片分支仍消费而保留。
 *
 * i18n 决策记录：videoParams 组件群沿用 T03/T04 交付的硬编码中文（全能参考/首尾帧/
 * 比例/清晰度/时长/有声等），与仓库同模块既有硬编码中文先例（如 index.tsx 的
 * '降级'/'不可用'、提示文案）保持一致，不引入 panel.videoParam* key，避免半中半典。
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

test('视频分支已移除旧版胶囊块（wf-param-pill--video-summary 仅剩图片分支一处）', () => {
  const occurrences = (source.match(/wf-param-pill--video-summary/g) || []).length;
  assert.equal(
    occurrences,
    1,
    'wf-param-pill--video-summary 应仅剩 1 处（图片分支），旧视频胶囊块已移除',
  );
  // 视频分支不再包含针对 aspectRatio/duration/resolution 的三个 ghost CustomSelect 组合
  const videoBlock = source.slice(
    source.indexOf("{materialType === 'video'"),
    source.indexOf('{materialType === \'video\'', source.indexOf("{materialType === 'video'") + 1) + 4000,
  );
  assert.ok(!videoBlock.includes('wf-param-pill--video-summary'), '视频分支不应再含旧胶囊类名');
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

test('图片节点分支仍保留其 CustomSelect 逻辑', () => {
  const imageBlock = source.slice(source.indexOf("{materialType === 'image'"));
  assert.ok(imageBlock.includes("materialType === 'image'"), '图片分支应存在');
  assert.ok(imageBlock.includes('<CustomSelect'), '图片分支应保留 CustomSelect');
  assert.ok(
    imageBlock.includes("updateParam('aspectRatio', value)"),
    '图片分支应保留 aspectRatio 更新',
  );
});

test('components.css 保留 .wf-param-pill--video-summary（图片分支仍消费）', () => {
  assert.ok(
    css.includes('.wf-param-pill--video-summary'),
    '图片分支仍消费该胶囊类，CSS 规则应保留',
  );
  // 视频浮层 / 触发条样式已落地
  assert.ok(css.includes('.wf-video-trigger-bar'), 'wf-video-trigger-bar 样式应存在');
  assert.ok(css.includes('.wf-video-param-popover'), 'wf-video-param-popover 样式应存在');
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

test('待确认视频参数调整持久化，并提供确认或保留原值的显式动作', () => {
  assert.ok(source.includes('readPendingVideoParamAdjustment(params as Record<string, unknown>)'));
  assert.ok(source.includes('applyPendingVideoParamAdjustment(params as Record<string, unknown>)'));
  assert.ok(source.includes('keepCurrentVideoParamValues(params as Record<string, unknown>)'));
  assert.ok(source.includes('确认调整'));
  assert.ok(source.includes('保留原值'));
  assert.ok(source.includes('Boolean(pendingVideoParamAdjustment)'));
  assert.equal(source.includes('const [videoParamNotices'), false, '提示必须保存在节点 params 中，重载后仍可确认');
});
