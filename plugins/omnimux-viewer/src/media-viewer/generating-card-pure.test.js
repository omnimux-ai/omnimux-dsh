/**
 * 生成中任务卡"去头行、动效铺满"契约测试 (specs/viewer-generating-card-pure.spec.md)
 * 验证：
 * 1. GeneratingStateCard 不再向 GenWaveCard 传 statusText（卡片无图标、无文案行）；
 * 2. MediaViewerTab 所有调用点均不传 statusText；
 * 3. GenWaveCard 头行变为条件渲染，且无 statusText 时点阵画布无顶部留白。
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

describe('生成中任务卡去头行契约', () => {
  it('AC-1: GeneratingStateCard 不传 statusText，仅保留 className/status 参数', () => {
    const src = readFileSync(join(here, 'GeneratingStateCard.jsx'), 'utf8');
    assert.doesNotMatch(src, /statusText/, 'GeneratingStateCard 严禁再出现 statusText 参数或透传');
    assert.match(src, /<GenWaveCard className="omx-genwave-fill" \/>/, '必须以无 props 方式渲染 GenWaveCard');
    assert.doesNotMatch(src, /等待生成工具启动/, '严禁残留默认文案');
  });

  it('AC-2: MediaViewerTab 所有调用点不传 statusText', () => {
    const src = readFileSync(join(here, 'MediaViewerTab.jsx'), 'utf8');
    assert.doesNotMatch(src, /statusText/, 'MediaViewerTab 严禁再向 GeneratingStateCard 传 statusText');
  });

  it('AC-3: GenWaveCard 头行条件渲染 + 无头行时画布零顶部留白', () => {
    const tsx = readFileSync(
      join(repoRoot, 'packages/dsh-ui-kit/src/gen-wave-card/GenWaveCard.tsx'),
      'utf8'
    );
    assert.match(tsx, /statusText\?:\s*string/, 'statusText 必须为可选参数');
    assert.match(tsx, /\{statusText \? \(/, '头行必须按 statusText 条件渲染');
    assert.match(tsx, /statusText \? "" : cssClass\(css\.cardFull, "cardFull"\)/, '无头行时必须切换卡片为铺满变体');
    assert.match(tsx, /statusText \? "" : cssClass\(css\.fieldFull, "fieldFull"\)/, '无头行时必须切换画布为铺满变体');
    const css = readFileSync(
      join(repoRoot, 'packages/dsh-ui-kit/src/gen-wave-card/GenWaveCard.module.css'),
      'utf8'
    );
    assert.match(css, /\.fieldFull\s*\{[^}]*margin-top:\s*0/s, '铺满变体必须清零顶部间距');
    assert.match(css, /\.cardFull\s*\{[^}]*padding:\s*0/s, '铺满变体必须清零四周 padding');
  });
});
