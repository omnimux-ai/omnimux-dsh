/**
 * @file loader.mjs
 * @description 全局工具动态加载器：从各插件中扫描并收集全量 DSH Agent 工具
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMockToolContext } from './mock-context.mjs';

/**
 * 递归扫描并提取静态声明的工具对象（作为动态加载的保底与补充）
 */
function extractStaticTools(pluginDir) {
  const srcDir = join(pluginDir, 'src');
  if (!existsSync(srcDir)) return [];

  const tools = [];

  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', 'client', '__tests__', 'dist'].includes(e.name)) continue;
        walk(full);
      } else if (e.name.endsWith('.js') && !e.name.includes('.test.') && !e.name.includes('.spec.')) {
        const code = readFileSync(full, 'utf-8');
        // 匹配 name: 'xxx', description: '...', parameters: {...}
        const toolRegex = /name:\s*['"`]([a-z0-9_]+)['"`][\s\S]*?description:\s*['"`]([\s\S]*?)['"`][\s\S]*?parameters:\s*(\{[\s\S]*?\n\s*\})/g;
        let m;
        while ((m = toolRegex.exec(code)) !== null) {
          const name = m[1];
          const description = m[2];
          tools.push({
            name,
            description,
            parameters: { type: 'object', properties: {} },
            output: {
              schema: { type: 'object' },
              render: () => ({ kind: 'text', content: 'ok' }),
            },
            execute: async () => ({ ok: true }),
            _source: 'static',
            _file: full,
          });
        }
      }
    }
  }

  walk(srcDir);
  return tools;
}

/**
 * 动态装配并加载工作区内全部插件导出的工具列表
 * @param {string} rootDir 仓库根目录
 * @returns {Promise<Map<string, object>>} toolName -> ToolObject
 */
export async function loadAllPluginTools(rootDir = process.cwd()) {
  const { tools } = await loadAllPluginSurfaces(rootDir);
  return tools;
}

/**
 * 一次装配同时收集工具与系统提示词贡献（第 5 层上下文预算使用）
 * @param {string} rootDir 仓库根目录
 * @returns {Promise<{ tools: Map<string, object>, prompts: Array<object>, plugins: Array<{ name: string, dynamic: boolean }> }>}
 */
export async function loadAllPluginSurfaces(rootDir = process.cwd()) {
  const pluginsDir = join(rootDir, 'plugins');
  const allTools = new Map();
  const prompts = [];
  const plugins = [];

  if (!existsSync(pluginsDir)) return { tools: allTools, prompts, plugins };

  const pluginFolders = readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name);

  for (const pluginName of pluginFolders) {
    const pluginDir = join(pluginsDir, pluginName);
    const mockCtx = createMockToolContext();

    let dynamicSuccess = false;

    // 尝试动态 import 插件入口
    const candidates = ['src/index.js', 'src/tools.js'];
    for (const rel of candidates) {
      const entryFile = join(pluginDir, rel);
      if (existsSync(entryFile)) {
        try {
          const mod = await import(pathToFileURL(entryFile).href);
          if (typeof mod.apply === 'function') {
            await mod.apply(mockCtx);
            dynamicSuccess = true;
          }
          if (typeof mod.createClipTools === 'function') {
            const clipTools = mod.createClipTools({
              store: {
                load: () => ({ schema: { canvasConfig: { durationMs: 5000 }, tracks: [] } }),
                patchPlayback: () => {},
                list: () => [],
                create: (id, schema) => ({ id, schema, updatedAt: Date.now() }),
                paths: { snapshotsDir: mockCtx.workspaceDir, exportsDir: mockCtx.workspaceDir },
              },
              overlayReady: () => false, // 正常模拟未挂载
            });
            for (const t of clipTools) mockCtx.tools.register(t);
            dynamicSuccess = true;
          }
        } catch (err) {
          // 动态加载报错时转入静态扫描兜底
        }
      }
    }

    // 收集动态注册的工具
    for (const tool of mockCtx.tools.list()) {
      tool._plugin = pluginName;
      tool._source = 'dynamic';
      allTools.set(tool.name, tool);
    }

    // 静态补齐
    const staticTools = extractStaticTools(pluginDir);
    for (const st of staticTools) {
      if (!allTools.has(st.name)) {
        st._plugin = pluginName;
        allTools.set(st.name, st);
      }
    }

    for (const contribution of mockCtx.promptContributions) {
      prompts.push({ ...contribution, plugin: pluginName });
    }
    plugins.push({ name: pluginName, dynamic: dynamicSuccess });

    mockCtx.cleanup();
  }

  return { tools: allTools, prompts, plugins };
}

function packageEntry(pluginDir) {
  const pkgPath = join(pluginDir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const root = pkg.exports?.['.'];
  const rel = typeof root === 'string' ? root : root?.default || root?.import || pkg.main;
  return rel ? join(pluginDir, rel) : null;
}

/**
 * 第 5 层专用装配：在 loadAllPluginSurfaces 基础上，对动态装载失败的插件再按 package 入口、
 * 以最小宿主桩（provide / inject / effect / on / get）补装一次，只用于体积度量。
 * 不影响第 1–4 层的覆盖面；补装仍失败的插件如实记录原因，不伪造度量。
 * @param {string} rootDir 仓库根目录
 * @param {Awaited<ReturnType<typeof loadAllPluginSurfaces>>} [loaded] 已装配结果，传入可避免重复装载
 */
export async function loadBudgetSurfaces(rootDir = process.cwd(), loaded) {
  const base = loaded ?? (await loadAllPluginSurfaces(rootDir));
  const tools = new Map(base.tools);
  const prompts = [...base.prompts];
  const plugins = [];

  for (const plugin of base.plugins) {
    if (plugin.dynamic) {
      plugins.push(plugin);
      continue;
    }
    const pluginDir = join(rootDir, 'plugins', plugin.name);
    const entry = packageEntry(pluginDir);
    if (!entry || !existsSync(entry)) {
      plugins.push({ ...plugin, loadError: entry ? `入口产物不存在: ${entry}` : 'package.json 未声明入口' });
      continue;
    }
    const ctx = createMockToolContext();
    Object.assign(ctx, {
      provide() {},
      inject() {},
      effect(fn) {
        const dispose = fn();
        return typeof dispose === 'function' ? dispose : () => {};
      },
      on() {
        return () => {};
      },
      get() {
        return undefined;
      },
    });
    try {
      const mod = await import(pathToFileURL(entry).href);
      if (typeof mod.apply !== 'function') throw new Error('入口未导出 apply');
      await mod.apply(ctx, {});
      for (const [name, tool] of tools) {
        if (tool._plugin === plugin.name && tool._source === 'static') tools.delete(name);
      }
      for (const tool of ctx.tools.list()) {
        tools.set(tool.name, { ...tool, _plugin: plugin.name, _source: 'budget-probe' });
      }
      for (const contribution of ctx.promptContributions) prompts.push({ ...contribution, plugin: plugin.name });
      plugins.push({ ...plugin, dynamic: true, probe: true });
    } catch (err) {
      plugins.push({ ...plugin, loadError: String(err?.message || err).split('\n')[0].slice(0, 160) });
    } finally {
      ctx.cleanup();
    }
  }

  return { tools, prompts, plugins };
}
