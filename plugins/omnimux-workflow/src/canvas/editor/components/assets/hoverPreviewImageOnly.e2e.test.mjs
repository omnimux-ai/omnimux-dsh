/**
 * E2E 契约：资产抽屉的悬停预览卡只保留图像（Issue #3123）。
 *
 * 用户要求悬停时只看到图像本身，底部深色信息区（素材名 + 类型徽标、更新时间、
 * 分辨率、文件大小、本地路径 / Prompt、标签）全部移除。本用例把「信息区不得回归」
 * 与「图像区域必须保留」钉成源码契约。
 *
 * 位置说明：本仓插件目录下的 tests/e2e 子目录不在插件 test 脚本的 glob 内
 * （glob 只覆盖 src 下的 test 文件与 tests 根目录一层），因此把契约用例放在
 * 被测源码同级，确保它随常规测试套件一起执行、真正成为回归门禁。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(join(here, 'views/HoverInspector.tsx'), 'utf8');
const css = readFileSync(join(here, '../../../theme/components.css'), 'utf8');

/** 被移除的信息区类名：出现在源码或样式里都说明信息区回归了。 */
const REMOVED_CLASSES = [
  'wf-hover-inspector-content',
  'wf-hover-inspector-title',
  'wf-hover-inspector-grid',
  'wf-hover-inspector-row',
  'wf-hover-inspector-label',
  'wf-hover-inspector-value',
  'wf-hover-inspector-tags',
  'wf-hover-inspector-tag',
];

/** 被移除的信息区字段文案。 */
const REMOVED_COPY = ['更新时间', '分辨率', '文件大小', '本地路径', 'Prompt'];

const countOf = (haystack, needle) => haystack.split(needle).length - 1;
const occurrencesIn = (haystack, needles) => needles.filter((n) => haystack.includes(n));

test('E2E: 悬停预览卡只保留图像（Issue #3123）', async (t) => {
  await t.test('组件不再渲染信息区类名', () => {
    assert.equal(
      occurrencesIn(component, REMOVED_CLASSES).length,
      0,
      `组件仍渲染被移除的信息区类名：${occurrencesIn(component, REMOVED_CLASSES).join(', ')}`,
    );
  });

  await t.test('样式表不再定义信息区规则', () => {
    assert.equal(
      occurrencesIn(css, REMOVED_CLASSES).length,
      0,
      `样式表仍定义被移除的信息区规则：${occurrencesIn(css, REMOVED_CLASSES).join(', ')}`,
    );
  });

  await t.test('组件不再输出信息区文案与字段', () => {
    assert.equal(
      occurrencesIn(component, REMOVED_COPY).length,
      0,
      `组件仍输出被移除的信息区文案：${occurrencesIn(component, REMOVED_COPY).join(', ')}`,
    );
    assert.equal(countOf(component, 'formattedDate'), 0, '日期格式化逻辑必须随信息区一起移除');
    assert.equal(countOf(component, 'toLocaleDateString'), 0, '不再需要本地化日期格式化');
    assert.equal(countOf(component, 'real_path'), 0, '不再展示本地路径');
    assert.equal(countOf(component, 'nodeKind'), 1, 'nodeKind 仅保留用于判定素材类型');
  });

  await t.test('仅被信息区使用的图标引用已清理', () => {
    for (const icon of ['Calendar', 'HardDrive', 'Maximize2', 'Tag']) {
      assert.equal(countOf(component, icon), 0, `${icon} 仅被信息区使用，必须从引用中移除`);
    }
    assert.equal(countOf(component, 'Sparkles'), 2, '占位图标仍用于无预览素材');
  });

  await t.test('图像区域与时长角标保留', () => {
    assert.equal(countOf(component, 'wf-hover-inspector-preview'), 1, '缩略图容器必须保留');
    assert.equal(countOf(component, 'wf-hover-inspector-img'), 1, '缩略图元素类必须保留');
    assert.equal(countOf(component, 'wf-hover-inspector-duration'), 1, '时长角标必须保留（它属于图像区域）');
    assert.equal(countOf(component, '<MediaThumb'), 1, '缩略图仍走共享媒体渲染');
    assert.equal(countOf(css, '.wf-hover-inspector-preview'), 1, '缩略图容器样式必须保留');
    assert.equal(countOf(css, '.wf-hover-inspector-duration'), 1, '时长角标样式必须保留');
  });

  await t.test('卡片尺寸按原素材比例拟合，不再固定 140 高', () => {
    assert.equal(
      /PREVIEW_MAX_EDGE\s*=\s*360/.test(component),
      true,
      '最大边必须限制为 360',
    );
    assert.equal(
      /fitWithinMaxEdge/.test(component),
      true,
      '必须按原比例拟合宽高',
    );
    assert.equal(
      /\.wf-hover-inspector-preview\s*\{[^}]*height:\s*140px;/.test(css),
      false,
      '缩略图区域不得再固定 140px 高',
    );
  });
});
