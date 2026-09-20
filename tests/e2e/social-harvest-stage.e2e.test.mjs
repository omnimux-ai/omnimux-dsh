/**
 * tests/e2e/social-harvest-stage.e2e.test.mjs
 *
 * 社媒采集工作台端到端契约（Issue #2426）：
 * 驱动工作树隔离浏览器 QA（真实 Chrome + 动态端口 + 自清理），
 * 断言 14 项旅程断言全过：平台列表 / 徽章 / 弹窗表单规格渲染 /
 * 必填校验 / 执行回显 / AUTH 错误路径。
 * 证据：docs/evidence/social-harvest-stage-qa.png + -report.json。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

test('社媒采集工作台：真实浏览器旅程 14 项断言全过', { timeout: 120_000 }, () => {
  const driver = join(__dirname, 'social-harvest-stage.browser.mjs');
  const run = spawnSync(process.execPath, [driver], { cwd: ROOT, encoding: 'utf8', timeout: 110_000 });
  assert.equal(run.status, 0, `浏览器 QA 驱动失败：\n${run.stdout}\n${run.stderr}`);

  const reportPath = join(ROOT, 'docs/evidence/social-harvest-stage-qa-report.json');
  assert.ok(existsSync(reportPath), '结构化报告未落盘');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(report.pass, true, `存在失败断言：${JSON.stringify(report.assertions?.filter((a) => !a.pass))}`);
  assert.equal(report.failed, 0);
  assert.ok(report.screenshotBytes > 10_000, '截图证据过小，疑似空图');
});

test('社媒采集侧边栏入口下架合规性：client 入口不再自动挂载 mountSidebarEntry', () => {
  const content = readFileSync(join(ROOT, 'plugins/omnimux-social-harvest/src/client/index.js'), 'utf8');
  assert.ok(!content.includes('mountSidebarEntry'), 'src/client/index.js 不得包含 mountSidebarEntry 调用');
  const bundle = readFileSync(join(ROOT, 'plugins/omnimux-social-harvest/lib/client.js'), 'utf8');
  assert.ok(!bundle.includes('mountSidebarEntry'), 'lib/client.js 打包产物中不得包含 mountSidebarEntry');
});
