import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const evidenceDir = join(repoRoot, 'docs/evidence/viewer-picker-mime-3548');
const reportPath = join(evidenceDir, 'report.json');

function readReport() {
  assert.equal(existsSync(reportPath), true, '必须存在 picker MIME 浏览器证据');
  return JSON.parse(readFileSync(reportPath, 'utf8'));
}

test('浏览器证据：本地资产选择不再提示格式不明并成功入槽', () => {
  const report = readReport();
  assert.equal(report.pass, true);
  assert.equal(report.issue, 3548);
  assert.match(report.sourceCommit, /^[0-9a-f]{40}$/);
  assert.equal(report.sourceDirty, false, '证据必须在干净源码提交上生成');
  assert.equal(report.assertions.length, 3);
  assert.equal(report.assertions.filter((item) => item.pass).length, 3);
  assert.ok(report.after.slotCards >= 1, '本地资产必须入槽');
  assert.equal(report.after.notice, '素材 [本地角色] 已入槽');
  assert.doesNotMatch(report.after.notice, /格式不明/);
  assert.equal(report.after.pickerOpen, false);
  assert.match(report.after.slotImages[0], /\/omnimux\/assets\/library\/preview/);
});

test('浏览器证据截图可解码且覆盖选择前后', () => {
  const report = readReport();
  assert.deepEqual(report.screenshots, ['before-picker.png', 'picker-open.png', 'after-select.png']);
  for (const name of report.screenshots) {
    const file = join(evidenceDir, name);
    assert.equal(existsSync(file), true, `缺少截图 ${name}`);
    const png = PNG.sync.read(readFileSync(file));
    assert.ok(png.width > 0 && png.height > 0);
  }
});

test('证据哈希覆盖 picker 映射、MIME helper 与 harness', () => {
  const report = readReport();
  const files = {
    picker: join(here, 'ReferencePickerPopover.jsx'),
    mime: join(here, 'picker-asset-mime.js'),
    harness: join(here, '../../test-support/picker-mime-3548/harness.jsx'),
  };
  for (const key of Object.keys(files)) {
    assert.match(report.sources[key] || '', /^[0-9a-f]{64}$/, `证据缺少 ${key} 哈希`);
    assert.equal(report.sources[key], createHash('sha256').update(readFileSync(files[key])).digest('hex'), `证据与 ${key} 源码不一致`);
  }
});
