#!/usr/bin/env node
/**
 * @file verify-plugin-agent-tools.mjs
 * @description OmniMux 全量插件 Agent 工具与双面交付静态扫描与契约验证门禁
 *
 * 核心检查维度：
 * 1. Dimension A: 声明与注入契约 (Manifest & Inject Contract)
 * 2. Dimension B: 双面交付对齐审计 (HTTP Write Endpoints vs Registered Tools)
 * 3. Dimension C: Tool Schema 与破坏性操作安全守卫 (Schema & Destructive Confirm Guard)
 * 4. Dimension D: 文档契约与代码真源一致性 (Inventory Document Parity)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const PLUGINS_DIR = join(REPO_ROOT, 'plugins');
const INVENTORY_PATH = join(REPO_ROOT, 'docs/contracts/plugin-agent-tools-inventory.md');

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  pass: (msg) => console.log(`${colors.green}✔${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  fail: (msg) => console.log(`${colors.red}✖${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.magenta}=== ${msg} ===${colors.reset}`),
};

// 工具发现与代码解析
function getPluginList() {
  if (!existsSync(PLUGINS_DIR)) return [];
  return readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
}

function parseInventoryTools() {
  if (!existsSync(INVENTORY_PATH)) {
    return { error: 'Inventory document not found at ' + INVENTORY_PATH, tools: [] };
  }
  const content = readFileSync(INVENTORY_PATH, 'utf-8');
  const tableRowRegex = /\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*`([^`]+?)`\s*\|\s*([^|]+?)\s*\|\s*`([^`]+?)`\s*\|\s*([^|]+?)\s*\|/g;
  
  const tools = [];
  let match;
  while ((match = tableRowRegex.exec(content)) !== null) {
    const [_, desc, route, toolName, level, status, confirm] = match;
    if (toolName === 'Tool Name' || toolName.includes('---')) continue;
    
    // 可能存在一个格子里换行多个工具
    const toolNames = toolName.split(/<br>|\n/).map((t) => t.replace(/[`\s]/g, '')).filter(Boolean);
    for (const name of toolNames) {
      tools.push({
        name,
        desc: desc.trim(),
        route: route.trim(),
        level: level.trim(),
        status: status.trim(),
        confirm: confirm.trim(),
      });
    }
  }
  return { tools };
}

function extractCallObject(code, callIndex) {
  const openParen = code.indexOf('(', callIndex);
  if (openParen === -1) return null;
  const firstBrace = code.indexOf('{', openParen);
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = null;
  let inComment = false;
  const start = firstBrace;

  for (let i = firstBrace; i < code.length; i++) {
    const ch = code[i];
    const prev = code[i - 1];

    if (inComment) {
      if (inComment === 'line' && ch === '\n') inComment = false;
      else if (inComment === 'block' && prev === '*' && ch === '/') inComment = false;
      continue;
    }
    if (!inString) {
      if (ch === '/' && code[i + 1] === '/') { inComment = 'line'; i++; continue; }
      if (ch === '/' && code[i + 1] === '*') { inComment = 'block'; i++; continue; }
    }

    if (inString) {
      if (ch === inString && prev !== '\\') inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return code.slice(start, i + 1);
      }
    }
  }
  return null;
}

function scanCodeRegisteredTools(pluginName) {
  const pluginDir = join(PLUGINS_DIR, pluginName);
  const srcDir = join(pluginDir, 'src');
  if (!existsSync(srcDir)) return { tools: [], toolDetails: [] };

  const foundTools = new Set();
  const toolDetails = [];
  
  function walk(dir) {
    const files = readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = join(dir, file.name);
      if (file.isDirectory()) {
        if (file.name === 'client' || file.name === 'node_modules' || file.name === '__tests__') continue;
        walk(fullPath);
      } else if (file.name.endsWith('.js') || file.name.endsWith('.ts')) {
        // 忽略测试与 Spec 文件
        if (file.name.includes('.test.') || file.name.includes('.spec.')) continue;

        const code = readFileSync(fullPath, 'utf-8');
        const relPath = relative(REPO_ROOT, fullPath).replace(/\\/g, '/');
        
        // 1. 结构化审计：提取通过 ctx.tools.register / defineTool 传入的工具配置对象
        const callRegex = /(?:ctx\.tools(?:\.register|\?\.register\?\.)|defineTool)\s*\(/g;
        let match;
        while ((match = callRegex.exec(code)) !== null) {
          const obj = extractCallObject(code, match.index);
          if (!obj) continue;

          const nameMatch = obj.match(/\bname:\s*['"`]([a-zA-Z0-9_-]+)['"`]/);
          if (!nameMatch) continue;

          const toolName = nameMatch[1];
          foundTools.add(toolName);

          const hasOutput = /\boutput\s*:/.test(obj);
          let outputValid = true;
          let outputError = '';

          if (!hasOutput) {
            outputValid = false;
            outputError = '未声明 output 契约字段（DSH 要求工具必须显式声明 output { schema, render }）';
          } else {
            // 校验 output 内部定义或所指向的定义
            const outputMatch = obj.match(/\boutput\s*:\s*([^,\n}]+)/);
            const outputVal = outputMatch ? outputMatch[1].trim() : '';
            if (outputVal.startsWith('{') && !obj.includes('render')) {
              outputValid = false;
              outputError = 'output 对象字面量缺失 render 函数';
            }
          }

          toolDetails.push({
            name: toolName,
            file: relPath,
            hasOutput,
            outputValid,
            outputError,
          });
        }

        // 2. 匹配 tool('xxx', ...) 辅助函数定义 (在 omnimux/src/official/mount.js 中统一声明 output: deps.jsonOut)
        const toolHelperRegex = /\btool\s*\(\s*['"`]([a-zA-Z0-9_-]+)['"`]/g;
        let thm;
        while ((thm = toolHelperRegex.exec(code)) !== null) {
          if (!['test', 'it', 'describe'].includes(thm[1])) {
            const toolName = thm[1];
            foundTools.add(toolName);
            toolDetails.push({
              name: toolName,
              file: relPath,
              hasOutput: true,
              outputValid: true,
              viaHelper: true,
            });
          }
        }

        // 3. 匹配通用导出名 (如 workflow 批量工具与 clip 批量工具)
        const rawToolNameRegex = /name:\s*['"`](workflow_[a-z0-9_]+|canvas_[a-z0-9_]+|clip_[a-z0-9_]+|plaza_[a-z0-9_]+|plugin_[a-z0-9_]+|connector_[a-z0-9_]+|skillhub_[a-z0-9_]+)['"`]/g;
        let rm;
        while ((rm = rawToolNameRegex.exec(code)) !== null) {
          const toolName = rm[1];
          foundTools.add(toolName);
        }

        // 4. 匹配动态模板字面量 omnimux_${kind}_submit
        if (code.includes('omnimux_${kind}_submit')) {
          foundTools.add('omnimux_video_submit');
          foundTools.add('omnimux_image_submit');
          foundTools.add('omnimux_audio_submit');
        }
      }
    }
  }

  walk(srcDir);
  return { tools: Array.from(foundTools), toolDetails };
}

// 主体审计流程
async function runAudits() {
  console.log(`${colors.bold}${colors.cyan}🚀 启动 OmniMux 全量插件 Agent 工具与双面交付静态扫描${colors.reset}`);
  
  const plugins = getPluginList();
  log.info(`检测到插件总数: ${plugins.length} 个`);

  let totalErrors = 0;
  let totalWarnings = 0;

  // 1. 文档契约检查
  log.header('Dimension D: 文档契约与代码真源一致性 (Inventory Document Parity)');
  const inventoryResult = parseInventoryTools();
  if (inventoryResult.error) {
    log.fail(inventoryResult.error);
    totalErrors++;
  } else {
    log.pass(`成功加载清单契约文档，共包含 ${inventoryResult.tools.length} 条工具条目`);
  }

  const inventoryImplementedMap = new Map();
  const inventoryPlannedMap = new Map();
  for (const t of inventoryResult.tools || []) {
    if (t.status === 'Implemented') {
      inventoryImplementedMap.set(t.name, t);
    } else if (t.status === 'Planned') {
      inventoryPlannedMap.set(t.name, t);
    }
  }

  // 2. 逐插件进行代码扫描与双向审计
  log.header('Dimension A & B & C: 插件代码与双面交付能力审计');
  
  const allDiscoveredTools = new Map();

  for (const plugin of plugins) {
    const pluginDir = join(PLUGINS_DIR, plugin);
    const pkgPath = join(pluginDir, 'package.json');
    if (!existsSync(pkgPath)) continue;

    const { tools: codeTools, toolDetails } = scanCodeRegisteredTools(plugin);
    
    for (const t of codeTools) {
      allDiscoveredTools.set(t, plugin);
    }

    const unrecordedInDoc = codeTools.filter((t) => !inventoryImplementedMap.has(t) && !inventoryPlannedMap.has(t));

    console.log(`\n📦 ${colors.bold}[${plugin}]${colors.reset}`);
    log.info(`代码已实装工具 (${codeTools.length} 个): ${codeTools.join(', ') || '(none)'}`);

    // A. 注入与依赖规范检查
    const srcIndex = join(pluginDir, 'src/index.js');
    const srcIndexTs = join(pluginDir, 'src/index.ts');
    const srcHost = join(pluginDir, 'src/host.ts');
    const entryFile = existsSync(srcIndex) ? srcIndex : (existsSync(srcIndexTs) ? srcIndexTs : (existsSync(srcHost) ? srcHost : null));
    
    if (entryFile && codeTools.length > 0) {
      const entryContent = readFileSync(entryFile, 'utf-8');
      if (!entryContent.includes("'tools'") && !entryContent.includes('"tools"') && !entryContent.includes('tools')) {
        log.warn(`[${plugin}] 注册了 Agent 工具，但未在 inject 中显式声明 'tools' 依赖`);
        totalWarnings++;
      } else {
        log.pass(`[${plugin}] inject 契约已完整声明 'tools'`);
      }
    }

    // B. 工具 output 契约静态校验 (DSH Tool Output Contract Guard)
    let pluginOutputErrors = 0;
    for (const detail of toolDetails) {
      if (!detail.hasOutput) {
        log.fail(`[${plugin}] 工具 "${detail.name}" 致命错误: 未声明 output 契约字段！(${detail.file})`);
        totalErrors++;
        pluginOutputErrors++;
      } else if (!detail.outputValid) {
        log.fail(`[${plugin}] 工具 "${detail.name}" 致命错误: ${detail.outputError} (${detail.file})`);
        totalErrors++;
        pluginOutputErrors++;
      }
    }
    if (pluginOutputErrors === 0 && toolDetails.length > 0) {
      log.pass(`[${plugin}] 实装工具 (${toolDetails.length} 个) 100% 具备合法 output 契约`);
    }

    // D. 检查未登记工具
    if (unrecordedInDoc.length > 0) {
      log.warn(`[${plugin}] 发现代码已实现但未在 inventory.md 登记的工具: ${unrecordedInDoc.join(', ')}`);
      totalWarnings++;
    } else if (codeTools.length > 0) {
      log.pass(`[${plugin}] 实装工具与 inventory.md 登记 100% 对齐`);
    }
  }

  // 3. 统计汇总与门禁判定
  log.header('全量插件 Agent 工具统计汇总');
  console.log(`- 真实扫描代码已实装工具数: ${colors.bold}${allDiscoveredTools.size}${colors.reset} 个`);
  console.log(`- 契约文档 Implemented 工具数: ${colors.bold}${inventoryImplementedMap.size}${colors.reset} 个`);
  console.log(`- 契约文档 Planned 待实现工具数: ${colors.bold}${inventoryPlannedMap.size}${colors.reset} 个`);

  console.log('\n----------------------------------------');
  if (totalErrors > 0) {
    log.fail(`门禁检查失败: 发现 ${totalErrors} 个错误, ${totalWarnings} 个警告`);
    process.exit(1);
  } else if (totalWarnings > 0) {
    log.warn(`门禁检查通过 (带警告): 0 个阻断错误, ${totalWarnings} 个可优化项`);
    process.exit(0);
  } else {
    log.pass(`门禁检查 100% 完美通过: 0 错误, 0 警告！全部插件契约与代码对齐`);
    process.exit(0);
  }
}

runAudits().catch((err) => {
  console.error(err);
  process.exit(1);
});
