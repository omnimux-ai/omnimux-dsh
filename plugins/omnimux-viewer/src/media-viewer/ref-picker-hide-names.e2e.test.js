/**
 * Issue #3000 选择素材面板：隐藏卡片名称 + 本地上传两行占位
 * 规格：specs/3000-ref-picker-hide-names-upload-span.spec.md
 * 结构证据：.agent-reports/issue-3000-ref-picker/picker-after.png
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { MEDIA_VIEWER_CSS } from '../../../omnimux/src/client/media-viewer/styles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const popoverSrc = fs.readFileSync(path.join(__dirname, 'ReferencePickerPopover.jsx'), 'utf8');

describe('E2E: ReferencePicker 隐藏名称与本地上传两行占位 (#3000)', () => {
  it('素材卡片不渲染可见名称，仅保留无障碍属性（全 Tab 共用模板）', () => {
    assert.ok(!popoverSrc.includes('omx-ref-picker-asset-title'), '严禁可见名称节点');
    assert.match(popoverSrc, /aria-label=\{asset\.title\}/);
    assert.match(popoverSrc, /title=\{asset\.title\}/);
    assert.match(popoverSrc, /<img[^>]*alt=""/);
    assert.ok(!MEDIA_VIEWER_CSS.includes('.omx-ref-picker-asset-title'), '样式不得残留名称规则');
  });

  it('本地上传卡跨两行并加宽，去掉 1/1 单行方卡', () => {
    assert.match(
      MEDIA_VIEWER_CSS,
      /\.omx-ref-picker-upload-card\s*\{[^}]*grid-row:\s*span\s*2;/s,
    );
    assert.match(
      MEDIA_VIEWER_CSS,
      /\.omx-ref-picker-upload-card\s*\{[^}]*min-width:\s*120px;/s,
    );
    assert.match(
      MEDIA_VIEWER_CSS,
      /\.omx-ref-picker-upload-card\s*\{[^}]*min-height:\s*190px;/s,
    );
    assert.doesNotMatch(
      MEDIA_VIEWER_CSS,
      /\.omx-ref-picker-upload-card\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1;/s,
    );
    assert.ok(popoverSrc.includes('从本地上传'), '上传文案不得改写');
  });

  it('工作树结构证据与规格已落盘', () => {
    const reportDir = path.resolve(__dirname, '../../../../.agent-reports/issue-3000-ref-picker');
    assert.ok(fs.existsSync(path.join(reportDir, 'picker-after.png')), '必须保留视觉证据 PNG');
    assert.ok(fs.existsSync(path.join(reportDir, 'REPORT.md')), '必须保留验收报告');
    assert.ok(
      fs.existsSync(path.resolve(__dirname, '../../../../specs/3000-ref-picker-hide-names-upload-span.spec.md')),
      '必须保留规格',
    );
  });
});
