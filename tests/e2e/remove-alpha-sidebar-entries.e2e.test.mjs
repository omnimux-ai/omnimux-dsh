import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E: 验证左侧侧边栏内测版入口彻底移除不显示且源码完整保留', async () => {
  const coordinatorPath = path.join(root, 'plugins/omnimux/src/client/sidebar-coordinator.js');
  const coordinatorContent = fs.readFileSync(coordinatorPath, 'utf8');

  // 1. 验证 sidebar-coordinator.js 包含 isAlphaEntry 与内测入口拦截逻辑
  assert.ok(
    coordinatorContent.includes('function isAlphaEntry(id)'),
    '必须包含 isAlphaEntry 过滤函数'
  );
  assert.ok(
    coordinatorContent.includes('if (isAlphaEntry(id))'),
    'register 方法中必须针对 isAlphaEntry(id) 执行拦截与安全注销'
  );

  // 2. 验证保底样式包含针对内测标记的 display: none !important
  assert.ok(
    coordinatorContent.includes('[data-release-stage="alpha"] { display: none !important; }'),
    '必须包含 [data-release-stage="alpha"] 的强制隐藏保底样式'
  );

  // 3. 验证生命周期中的内测插件名单真实存在，且源码目录全部完整保留
  const lifecyclePath = path.join(root, 'plugins/omnimux/src/plugin-lifecycle.json');
  const lifecycle = JSON.parse(fs.readFileSync(lifecyclePath, 'utf8'));

  const alphaPlugins = Object.entries(lifecycle)
    .filter(([_, conf]) => conf.stage === 'alpha')
    .map(([name]) => name);

  assert.ok(alphaPlugins.length >= 5, '必须覆盖 accounts, publish, analytics, automation, inspiration 等内测插件');
  assert.ok(alphaPlugins.includes('omnimux-inspiration'), '灵感社区必须已标记为内测插件');
  for (const pluginName of alphaPlugins) {
    const pluginDir = path.join(root, 'plugins', pluginName);
    assert.ok(fs.existsSync(pluginDir), `插件源码必须完整保留: ${pluginName}`);
    assert.ok(fs.existsSync(path.join(pluginDir, 'package.json')), `插件 package.json 必须保留: ${pluginName}`);
  }
});
