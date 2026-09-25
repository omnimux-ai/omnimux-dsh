import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const componentsCssPath = join(here, '../../src/canvas/theme/components.css');
const slotWellsTsxPath = join(
  here,
  '../../src/canvas/editor/components/MaterialNode/ConfigPanel/SlotWells/SlotWells.tsx',
);

const componentsCss = readFileSync(componentsCssPath, 'utf8');
const slotWellsTsx = readFileSync(slotWellsTsxPath, 'utf8');

test('E2E: 卡槽媒体预览必须等比例缩放铺满 (object-fit: cover)，杜绝黑边与留白缝隙', () => {
  // 1. .wf-slot-well__media 必须使用 object-fit: cover
  const mediaMatch = componentsCss.match(/\.wf-slot-well__media\s*\{([^}]+)\}/);
  assert.ok(mediaMatch, '必须定义 .wf-slot-well__media 选择器');
  assert.match(
    mediaMatch[1],
    /object-fit:\s*cover;/,
    '卡槽缩略媒体必须使用 object-fit: cover，消除左右/上下黑边',
  );
  assert.doesNotMatch(
    mediaMatch[1],
    /object-fit:\s*contain;/,
    '禁止回退为带有黑边的 object-fit: contain',
  );

  // 2. 视频与图片容器必须保持 overflow: hidden 和统一圆角约束
  const videoBoxMatch = componentsCss.match(/\.wf-slot-well__video-box\s*\{([^}]+)\}/);
  assert.ok(videoBoxMatch, '必须定义 .wf-slot-well__video-box 视频卡槽容器');
  assert.match(videoBoxMatch[1], /overflow:\s*hidden;/, '视频容器必须溢出裁剪');
  assert.match(videoBoxMatch[1], /border-radius:\s*9px;/, '视频容器必须对齐内边圆角');

  // 3. SlotWells 组件渲染核查：图片与视频均应用 wf-slot-well__media
  assert.match(
    slotWellsTsx,
    /<img[\s\S]*?className="wf-slot-well__media"/,
    '图片元素必须带有 wf-slot-well__media 类',
  );
  assert.match(
    slotWellsTsx,
    /<video[\s\S]*?className="wf-slot-well__media"/,
    '视频元素必须带有 wf-slot-well__media 类',
  );
});

test('E2E: 顶栏多卡槽共存时必须自左向右紧凑排布 (justify-content: flex-start; gap: 8px)，右侧展开按钮 margin-left: auto 吸附右端 (Issue #2651)', () => {
  const headerMatch = componentsCss.match(/\.wf-config-panel__prompt-header\s*\{([^}]+)\}/);
  assert.ok(headerMatch, '必须定义 .wf-config-panel__prompt-header 选择器');
  assert.match(headerMatch[1], /justify-content:\s*flex-start;/, '顶栏必须使用 justify-content: flex-start 左对齐');
  assert.match(headerMatch[1], /gap:\s*8px;/, '顶栏卡槽组间距必须为 8px');
  assert.doesNotMatch(headerMatch[1], /justify-content:\s*space-between;/, '禁止使用 space-between 导致第 2 个卡槽组被推到 50% 中间位置');

  const actionsMatch = componentsCss.match(/\.wf-config-panel__prompt-header-actions\s*\{([^}]+)\}/);
  assert.ok(actionsMatch, '必须定义 .wf-config-panel__prompt-header-actions 选择器');
  assert.match(actionsMatch[1], /margin-left:\s*auto;/, '右侧操作栏必须通过 margin-left: auto 吸附最右端');
});
