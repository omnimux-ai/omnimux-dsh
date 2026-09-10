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
  const pluginsDir = join(rootDir, 'plugins');
  const allTools = new Map();

  if (!existsSync(pluginsDir)) return allTools;

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

    mockCtx.cleanup();
  }

  return allTools;
}
