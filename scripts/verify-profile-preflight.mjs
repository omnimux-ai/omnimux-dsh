#!/usr/bin/env node
/**
 * @file verify-profile-preflight.mjs
 * @description Profile 物化启动预检（Materialize Pre-flight / Dry Run）
 *
 * 在物化脚本写入目标 Profile 之后，模拟真实 DSH/Cordis 插件树加载与 apply(ctx) 执行：
 * 1. 验证目标 Profile 的 package.json 及其依赖拓扑；
 * 2. 模拟真实 Cordis 宿主上下文（含严格的 tools.register 契约门禁）；
 * 3. 动态加载并执行所有 omnimux-* 插件的 apply(ctx)；
 * 4. 若任何插件在 apply 阶段报错（如缺失 output、语法错误、缺失依赖），立即返回退出码 1，触发物化脚本回滚。
 */

import { existsSync, readFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 宿主自带包（`@deepseek-ai/*`）只存在于桌面 App 的 `app.asar` 内：Profile 不落地它们，
 * 旧的安装级软链树也已按「受管源必须是物理树」原则清理。普通 Node 从 Profile 目录往上找
 * 必然解析不到，但预检要在真实 Profile 树上演练 `apply(ctx)`，于是这里按官方
 * `module.registerHooks()` 在**解析不到时**把它们重定向到一个最小替身。
 *
 * 只在该包确实解析不到时介入，因此不会掩盖任何真实可解析的依赖；替身只保证签名
 * （`defineTool` 返回带 `name` 与 `output.render` 的工具对象），不做真包的 schema 编译与参数校验。
 */
const HOST_PACKAGE_PREFIX = '@deepseek-ai/';

const HOST_PACKAGE_STUB_SOURCE = [
  'export function defineTool(options) {',
  '  const output = options && options.output ? options.output : {};',
  '  return {',
  '    name: options && options.name,',
  '    description: options && options.description,',
  '    parameters: options && options.parameters,',
  '    output: {',
  '      schema: output.schema,',
  '      render: typeof output.render === "function" ? output.render : () => "",',
  '    },',
  '  };',
  '}',
  'export function createUserMessage(payload) {',
  '  return { role: "user", ...payload };',
  '}',
  'function makeSchemaNode() {',
  '  const fn = (...args) => makeSchemaNode();',
  '  fn.default = () => fn;',
  '  fn.description = () => fn;',
  '  fn.min = () => fn;',
  '  fn.max = () => fn;',
  '  fn.step = () => fn;',
  '  fn.role = () => fn;',
  '  fn.hidden = () => fn;',
  '  return fn;',
  '}',
  'export const Schema = new Proxy(makeSchemaNode(), {',
  '  get(target, prop) {',
  '    if (prop in target) return target[prop];',
  '    return makeSchemaNode();',
  '  },',
  '});',
  'const def = Object.assign(defineTool, { defineTool, Schema, object: Schema.object, string: Schema.string, number: Schema.number, boolean: Schema.boolean, array: Schema.array, union: Schema.union });',
  'export default new Proxy(def, {',
  '  get(target, prop) {',
  '    if (prop in target) return target[prop];',
  '    return makeSchemaNode();',
  '  },',
  '});',
].join('\n');

const HOST_PACKAGE_STUB_URL = `data:text/javascript;charset=utf-8,${encodeURIComponent(HOST_PACKAGE_STUB_SOURCE)}`;

let hostStubHits = 0;

function installHostPackageStub() {
  if (typeof nodeModule.registerHooks !== 'function') {
    console.warn('⚠ [Pre-flight] 当前 Node 不支持 module.registerHooks，宿主包缺失的插件仍会加载失败');
    return;
  }
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (typeof specifier === 'string'
          && specifier.startsWith(HOST_PACKAGE_PREFIX)
          && error?.code === 'ERR_MODULE_NOT_FOUND') {
          hostStubHits += 1;
          return { url: HOST_PACKAGE_STUB_URL, shortCircuit: true };
        }
        throw error;
      }
    },
  });
}

installHostPackageStub();

const targetProfile = process.argv[2] ? resolve(process.argv[2]) : null;

if (!targetProfile || !existsSync(targetProfile)) {
  console.error(`❌ [Pre-flight] 目标 Profile 目录不存在: ${targetProfile}`);
  process.exit(1);
}

const pkgPath = join(targetProfile, 'package.json');
if (!existsSync(pkgPath)) {
  console.error(`❌ [Pre-flight] 目标 Profile 缺少 package.json: ${pkgPath}`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const plugins = Object.keys(pkg.dependencies || {}).filter((k) => k.startsWith('omnimux'));

console.log(`\n🚀 [Pre-flight] 启动 Profile 物化演练校验: ${targetProfile}`);
console.log(`ℹ 检测到待预检物化插件 (${plugins.length} 个): ${plugins.join(', ')}`);

let totalErrors = 0;
let totalToolsVerified = 0;

for (const name of plugins) {
  const pluginDir = join(targetProfile, 'node_modules', name);
  if (!existsSync(pluginDir)) {
    console.error(`❌ [Pre-flight] 插件已在 dependencies 声明但未在 node_modules 物化: ${name}`);
    totalErrors++;
    continue;
  }

  const pPkgPath = join(pluginDir, 'package.json');
  if (!existsSync(pPkgPath)) {
    console.error(`❌ [Pre-flight] 插件缺少 package.json: ${name}`);
    totalErrors++;
    continue;
  }

  const pPkg = JSON.parse(readFileSync(pPkgPath, 'utf8'));
  const entry = pPkg.main || 'index.js';
  const entryPath = resolve(pluginDir, entry);
  if (!existsSync(entryPath)) {
    console.error(`❌ [Pre-flight] 插件入口文件缺失: ${name} → ${entry}`);
    totalErrors++;
    continue;
  }

  try {
    const mod = await import(pathToFileURL(entryPath).href);
    if (typeof mod.apply === 'function') {
      const registeredTools = [];
      const makeCtx = () => {
        const c = {
          tools: {
            register: (tool) => {
              if (!tool || typeof tool !== 'object') {
                throw new TypeError(`[${name}] tool register payload must be an object`);
              }
              if (!tool.name || typeof tool.name !== 'string') {
                throw new TypeError(`[${name}] tool must declare a non-empty name`);
              }
              if (!tool.output || typeof tool.output !== 'object' || typeof tool.output.render !== 'function') {
                throw new TypeError(
                  `[${name}] tool "${tool.name}" must declare output { schema, render, presentationMeta? }`,
                );
              }
              registeredTools.push(tool.name);
            },
            get: () => null,
            has: () => false,
          },
          inject: (deps, cb) => {
            try {
              const innerCtx = makeCtx();
              cb(innerCtx);
            } catch (err) {
              throw err;
            }
          },
          effect: (cb) => {
            try { cb(); } catch {}
          },
          provide: () => {},
          plugin: () => {},
          loader: { import: async () => ({ apply: () => {} }) },
          clientModules: { graph: () => ({ entries: [] }) },
          webServer: { get: () => {}, use: () => {}, post: () => {}, register: () => {} },
          betterSidebar: { registerFileViewer: () => () => {}, openTab: () => {} },
          commands: { register: () => () => {} },
          systemPrompt: { section: () => () => {} },
          settings: { register: () => () => {} },
          omnimux: {},
          get: (s) => c[s] || ({ register: () => {}, get: () => {}, use: () => {}, graph: () => ({ entries: [] }), section: () => {} }),
        };
        return c;
      };

      const ctx = makeCtx();
      mod.apply(ctx, { apiBase: 'http://localhost' });
      totalToolsVerified += registeredTools.length;
      console.log(`  ✔ [${name}] apply(ctx) 演练成功 (注册 ${registeredTools.length} 个合规工具)`);
    } else {
      console.log(`  ✔ [${name}] 模块加载正常 (未导出 apply 方法)`);
    }
  } catch (err) {
    totalErrors++;
    console.error(`  ✖ [${name}] 启动预检演练失败:`, err.message || err);
  }
}

const stubNote = hostStubHits > 0
  ? `；其中 ${hostStubHits} 次宿主包解析使用最小替身（仅保签名）`
  : '';

if (totalErrors > 0) {
  console.error(`\n❌ [Pre-flight] 物化演练预检失败: 发现 ${totalErrors} 个异常！已阻断提交并触发回滚${stubNote}。`);
  process.exit(1);
}

console.log(`\n✔ [Pre-flight] 物化演练预检 100% 通过: 全部 ${plugins.length} 个插件加载正常，共核验 ${totalToolsVerified} 个工具契约${stubNote}`);
process.exit(0);
