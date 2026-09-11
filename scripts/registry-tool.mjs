#!/usr/bin/env node
/**
 * @file scripts/registry-tool.mjs
 * OmniMux 插件注册表自动化编译、反查校验与极速查询 CLI（主仓库自包含版）
 *
 * 用法:
 *   node scripts/registry-tool.mjs build          # 聚合 plugins/* 的 dsh.manifest.json -> plugins.registry.json
 *   node scripts/registry-tool.mjs verify         # 静态反查代码防漂移 (入口/工具名/Schema)
 *   node scripts/registry-tool.mjs query <kw>     # Agent 极速查询匹配 (按工具名/标签/描述)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const REGISTRY_FILE = path.join(ROOT_DIR, 'plugins.registry.json');
const SCHEMA_FILE = path.join(ROOT_DIR, 'schemas', 'dsh-plugin.schema.json');

const SEARCH_DIRS = [
  'plugins'
];

/**
 * 递归收集所有插件的 dsh.manifest.json
 */
export function collectManifests() {
  const manifests = [];
  for (const baseRel of SEARCH_DIRS) {
    const fullBase = path.join(ROOT_DIR, baseRel);
    if (!fs.existsSync(fullBase)) continue;

    const entries = fs.readdirSync(fullBase, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const pluginDir = path.join(fullBase, entry.name);
        const manifestPath = path.join(pluginDir, 'dsh.manifest.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const raw = fs.readFileSync(manifestPath, 'utf8');
            const data = JSON.parse(raw);
            data.path = path.relative(ROOT_DIR, pluginDir);
            manifests.push(data);
          } catch (e) {
            console.error(`[Error] Failed to parse manifest at: ${manifestPath}: ${e.message}`);
          }
        }
      }
    }
  }
  return manifests;
}

/**
 * 编译并生成全局 plugins.registry.json
 */
export function buildRegistry() {
  const manifests = collectManifests();
  
  // 统计指标
  let totalTools = 0;
  let totalSeams = 0;
  for (const m of manifests) {
    totalTools += m.capabilities?.tools?.length || 0;
    totalSeams += m.capabilities?.seamsProvided?.length || 0;
  }

  // 排序：按 Tier 顺序，再按 ID
  const tierOrder = {
    'tier-0-hub': 0,
    'tier-1-app': 1,
    'tier-2-vertical': 2,
    'tier-3-personal': 3,
    'tier-4-archived': 4
  };

  manifests.sort((a, b) => {
    const ta = tierOrder[a.tier] ?? 99;
    const tb = tierOrder[b.tier] ?? 99;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });

  const registry = {
    schemaVersion: '1.0.0',
    updatedAt: new Date().toISOString(),
    topology: {
      tiers: [
        {
          tierId: 'tier-0-hub',
          name: '基础设施与执行Hub',
          rootDirectory: 'plugins/omnimux',
          description: '提供全局身份认证、多模态媒体路由、抓取服务与埋点基础设施'
        },
        {
          tierId: 'tier-1-app',
          name: '官方一级商业应用',
          rootDirectory: 'plugins/omnimux-*',
          description: 'OmniMux 核心一级功能矩阵：市场、工作流、资产库、商品库、账号池与灵感社区'
        },
        {
          tierId: 'tier-2-vertical',
          name: '垂直业务套件',
          rootDirectory: 'plugins/dsh-*',
          description: '垂直生产力套件：短剧全流程制作与本地 FFmpeg 视频重度处理'
        }
      ],
      summary: {
        totalPlugins: manifests.length,
        totalTools,
        totalSeams
      }
    },
    plugins: manifests
  };

  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf8');
  console.log(`✅ [Registry Build] Compiled ${manifests.length} plugins (${totalTools} tools, ${totalSeams} seams) into plugins.registry.json`);
}

/**
 * 递归获取目录下所有源码文本
 */
function getSourceText(dir) {
  let combined = '';
  if (!fs.existsSync(dir)) return combined;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.git') {
        combined += '\n' + getSourceText(full);
      }
    } else if (entry.isFile() && /\.(js|ts|jsx|tsx|json|yml|yaml|md)$/.test(entry.name)) {
      try {
        combined += '\n' + fs.readFileSync(full, 'utf8');
      } catch {}
    }
  }
  return combined;
}

/**
 * 静态反查代码防漂移校验
 */
export function verifyAntiDrift() {
  console.log('🔍 [Registry Verify] Starting code-to-manifest anti-drift audit...');
  const manifests = collectManifests();
  const errors = [];
  const warnings = [];

  for (const m of manifests) {
    const pluginDir = path.join(ROOT_DIR, m.path);

    // 1. 校验必填字段
    if (!m.id || !m.name || !m.tier || !m.path || !m.entrypoint || !m.status) {
      errors.push(`[${m.id || 'unknown'}] Missing mandatory fields (id, name, tier, path, entrypoint, status).`);
      continue;
    }

    // 2. 校验入口文件
    const entryFile = path.join(pluginDir, m.entrypoint);
    if (m.status !== 'archived' && !fs.existsSync(entryFile)) {
      errors.push(`[${m.id}] Missing entrypoint file: ${m.entrypoint} (at ${entryFile})`);
    }

    // 3. 校验 package.json 一致性
    const pkgPath = path.join(pluginDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.name && pkg.name !== m.name) {
          warnings.push(`[${m.id}] Name mismatch: manifest has '${m.name}', package.json has '${pkg.name}'`);
        }
      } catch {}
    }

    // 4. 静态扫描检查声明的 tools 是否在代码或文档中存在
    if (m.capabilities?.tools && m.capabilities.tools.length > 0) {
      const codeText = getSourceText(pluginDir);
      for (const tool of m.capabilities.tools) {
        if (!codeText.includes(tool.name)) {
          errors.push(`[${m.id}] Tool '${tool.name}' declared in manifest but not found in plugin source/docs!`);
        }
      }
    }
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Warnings:');
    warnings.forEach(w => console.warn(`  - ${w}`));
  }

  if (errors.length > 0) {
    console.error('❌ Anti-drift validation failed:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  } else {
    console.log(`✅ Anti-drift verification passed! All ${manifests.length} plugins are consistent.`);
  }
}

/**
 * Agent 极速查询 CLI
 */
export function queryRegistry(query) {
  if (!fs.existsSync(REGISTRY_FILE)) {
    buildRegistry();
  }
  const registry = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  const q = (query || '').toLowerCase().trim();

  if (!q) {
    console.log(JSON.stringify(registry.topology, null, 2));
    return;
  }

  const results = [];
  for (const p of registry.plugins) {
    let score = 0;
    const matchReasons = [];

    // 精确匹配 ID
    if (p.id.toLowerCase() === q || p.name.toLowerCase() === q) {
      score += 100;
      matchReasons.push('id/name match');
    } else if (p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)) {
      score += 30;
      matchReasons.push('id/name partial match');
    }

    // 匹配 Tools
    const matchedTools = (p.capabilities?.tools || []).filter(t => 
      t.name.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q)
    );
    if (matchedTools.length > 0) {
      score += 50 * matchedTools.length;
      matchReasons.push(`tools match: [${matchedTools.map(t => t.name).join(', ')}]`);
    }

    // 匹配 Seams
    const matchedSeams = (p.capabilities?.seamsProvided || []).filter(s => 
      s.name.toLowerCase().includes(q)
    );
    if (matchedSeams.length > 0) {
      score += 40;
      matchReasons.push(`seams provided match: [${matchedSeams.map(s => s.name).join(', ')}]`);
    }

    // 匹配 Tags
    if ((p.tags || []).some(t => t.toLowerCase().includes(q))) {
      score += 20;
      matchReasons.push('tag match');
    }

    // 匹配 Description
    if (p.description && p.description.toLowerCase().includes(q)) {
      score += 10;
      matchReasons.push('description match');
    }

    if (score > 0) {
      results.push({
        id: p.id,
        tier: p.tier,
        path: p.path,
        entrypoint: p.entrypoint,
        status: p.status,
        score,
        matchReasons,
        tools: (p.capabilities?.tools || []).map(t => t.name),
        seamsProvided: (p.capabilities?.seamsProvided || []).map(s => s.name),
        description: p.description
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  console.log(JSON.stringify(results, null, 2));
}

// 命令路由
const command = process.argv[2] || 'build';
const arg = process.argv[3];

if (command === 'build') {
  buildRegistry();
} else if (command === 'verify') {
  verifyAntiDrift();
} else if (command === 'query') {
  queryRegistry(arg);
} else {
  console.log(`
OmniMux DSH Plugin Registry Tool

Commands:
  build             Aggregate all manifests into plugins.registry.json
  verify            Run anti-drift verification on all plugins
  query <keyword>   Fast match plugins/tools by keyword for AI Agents
  `);
}
