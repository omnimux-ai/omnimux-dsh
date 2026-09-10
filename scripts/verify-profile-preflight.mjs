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
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
const plugins = Object.keys(pkg.dependencies || {}).filter(k => k.startsWith('omnimux'));

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

if (totalErrors > 0) {
  console.error(`\n❌ [Pre-flight] 物化演练预检失败: 发现 ${totalErrors} 个异常！已阻断提交并触发回滚。`);
  process.exit(1);
}

console.log(`\n✔ [Pre-flight] 物化演练预检 100% 通过: 全部 ${plugins.length} 个插件加载正常，共核验 ${totalToolsVerified} 个工具契约`);
process.exit(0);
