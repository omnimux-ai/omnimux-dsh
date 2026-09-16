/**
 * plugins/omnimux-apps/src/host/packageEntry.test.mjs
 *
 * Packaging contract for the installed runtime (Issue #2012):
 * the plugin is loaded from node_modules, where Node refuses to strip TypeScript
 * types, so every package entry must resolve to built JavaScript and the client
 * bundle must keep the host module-loader shape.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pkgRoot = path.resolve(import.meta.dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf-8'));

test('P01: 安装入口全部指向构建产物，不含 TypeScript 源码', () => {
  const entries = [pkg.main, ...Object.values(pkg.exports)];
  for (const entry of entries) {
    assert.ok(typeof entry === 'string', `入口必须是字符串：${entry}`);
    assert.ok(!entry.endsWith('.ts') && !entry.endsWith('.tsx'), `入口不得指向源码：${entry}`);
  }
  assert.equal(pkg.main, 'dist/index.js');
  assert.equal(pkg.exports['.'], './dist/index.js');
  assert.equal(pkg.exports['./client'], './lib/client.js');
});

test('P02: 构建脚本存在且被 build / prepare 调用', () => {
  for (const script of ['scripts/build-host.mjs', 'scripts/build-client.mjs']) {
    assert.ok(fs.existsSync(path.join(pkgRoot, script)), `缺少构建脚本：${script}`);
  }
  assert.match(pkg.scripts.build, /build-host\.mjs/);
  assert.match(pkg.scripts.build, /build-client\.mjs/);
  assert.equal(pkg.scripts.prepare, 'npm run build');
});

test('P03: files 清单覆盖产物与脚本，构建依赖已声明', () => {
  for (const required of ['dist', 'lib', 'src', 'scripts']) {
    assert.ok(pkg.files.includes(required), `files 缺少：${required}`);
  }
  assert.ok(pkg.devDependencies.esbuild, '必须声明 esbuild 构建依赖');
});

test('P04: 客户端包保持宿主模块加载器包装（产物存在时核对内容）', () => {
  const clientFile = path.join(pkgRoot, 'lib', 'client.js');
  if (!fs.existsSync(clientFile)) {
    assert.ok(true, '产物未构建，跳过内容核对（由同步前的 prepare 生成）');
    return;
  }
  const code = fs.readFileSync(clientFile, 'utf-8');
  assert.match(code, /window\.__ModuleLoader__\.load\(/);
  assert.match(code, /id:\s*"omnimux-apps"/);
  assert.match(code, /omnimux-apps-css:/, '样式必须以注入模块形式随包发布');
});

test('P05: 宿主产物可被真实解析（产物存在时）', async () => {
  const hostFile = path.join(pkgRoot, 'dist', 'index.js');
  if (!fs.existsSync(hostFile)) {
    assert.ok(true, '产物未构建，跳过导入核对');
    return;
  }
  const mod = await import(hostFile);
  assert.ok(Object.keys(mod).length > 0, '宿主入口必须导出可用的运行时 API');
});

test('P06: 构建产物执行 apply(ctx) 与源码同构（产物存在时）', async () => {
  const hostFile = path.join(pkgRoot, 'dist', 'index.js');
  if (!fs.existsSync(hostFile)) {
    assert.ok(true, '产物未构建，跳过 apply 演练');
    return;
  }
  const mod = await import(hostFile);
  const provided = {};
  const ctx = { provide: (name, value) => { provided[name] = value; } };
  assert.equal(typeof mod.apply, 'function', '产物必须导出 apply');
  mod.apply(ctx);
  assert.ok(provided['omnimux-apps'], 'apply 必须注册 omnimux-apps 服务');
  assert.equal(typeof provided['omnimux-apps'].validateManifest, 'function');
  assert.equal(mod.default?.name, 'omnimux-apps');
});
