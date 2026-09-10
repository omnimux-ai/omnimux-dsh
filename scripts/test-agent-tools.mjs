#!/usr/bin/env node
/**
 * @file test-agent-tools.mjs
 * @description DSH 全局 Agent 插件工具测试套件主入口 (Test Suite for DSH Agent Plugin Tools)
 *
 * 测试分层：
 * - Layer 1: 静态契约与 JSON Schema 严格校验 (Contract & Schema Lint)
 * - Layer 2: 隔离沙箱与容错执行测试 (Isolated Execution & Error-handling)
 * - Layer 3: Agent 意图诱发与调用准确率评测 (Agent Tool Calling E2E Eval)
 * - Layer 4: 权限边界与破坏性保护门禁 (Security & Sandbox Gates)
 */

import { resolve } from 'node:path';
import { loadAllPluginTools } from './agent-tools-suite/loader.mjs';
import { validateToolContract } from './agent-tools-suite/schema-lint.mjs';
import { testToolExecution } from './agent-tools-suite/execution-guard.mjs';
import { testToolSecurity } from './agent-tools-suite/security-guard.mjs';
import { runAgentToolEval } from './agent-tools-suite/eval-runner.mjs';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

const args = process.argv.slice(2);
const runAll = args.length === 0 || args.includes('--all');
const runContract = runAll || args.includes('--contract');
const runExec = runAll || args.includes('--exec');
const runEval = runAll || args.includes('--eval');
const runSecurity = runAll || args.includes('--security');

async function main() {
  console.log(`\n${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}   🛡️  DSH Agent 插件工具全量自动化测试套件 (Test Suite)       ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════${colors.reset}\n`);

  const rootDir = process.cwd();
  console.log(`${colors.cyan}ℹ${colors.reset} 正在自动装载工作区插件并发现可用工具...`);
  const allToolsMap = await loadAllPluginTools(rootDir);
  console.log(`${colors.green}✔${colors.reset} 成功扫描装配 ${colors.bold}${allToolsMap.size}${colors.reset} 个插件工具\n`);

  let totalFailures = 0;

  // ───────────────────────────────────────────
  // Layer 1: 静态契约与 Schema 校验
  // ───────────────────────────────────────────
  if (runContract) {
    console.log(`${colors.bold}${colors.magenta}=== Layer 1: 静态契约与 Schema 规范校验 ===${colors.reset}`);
    let contractErrors = 0;

    for (const [name, tool] of allToolsMap.entries()) {
      const res = validateToolContract(tool);
      if (!res.valid) {
        contractErrors++;
        console.log(`  ${colors.red}✖ [${name}]${colors.reset}`);
        for (const err of res.errors) {
          console.log(`    ${colors.red}↳ ${err}${colors.reset}`);
        }
      }
    }

    if (contractErrors === 0) {
      console.log(`  ${colors.green}✔ 全部 ${allToolsMap.size} 个工具通过 JSON Schema 与契约校验${colors.reset}\n`);
    } else {
      console.log(`  ${colors.red}✖ 契约校验失败: 共发现 ${contractErrors} 个不规范工具${colors.reset}\n`);
      totalFailures += contractErrors;
    }
  }

  // ───────────────────────────────────────────
  // Layer 2: 隔离沙箱与容错执行测试
  // ───────────────────────────────────────────
  if (runExec) {
    console.log(`${colors.bold}${colors.magenta}=== Layer 2: 内存隔离调用与边界容错测试 ===${colors.reset}`);
    let execErrors = 0;

    for (const [name, tool] of allToolsMap.entries()) {
      const res = await testToolExecution(tool);
      if (!res.ok) {
        execErrors++;
        console.log(`  ${colors.red}✖ [${name}] 执行异常: ${res.error}${colors.reset}`);
      }
    }

    if (execErrors === 0) {
      console.log(`  ${colors.green}✔ 全部 ${allToolsMap.size} 个工具通过隔离调用与空参容错测试${colors.reset}\n`);
    } else {
      console.log(`  ${colors.red}✖ 隔离调用发现 ${execErrors} 个工具执行崩溃${colors.reset}\n`);
      totalFailures += execErrors;
    }
  }

  // ───────────────────────────────────────────
  // Layer 3: Agent 意图诱导与工具调度评测
  // ───────────────────────────────────────────
  if (runEval) {
    console.log(`${colors.bold}${colors.magenta}=== Layer 3: Agent 意图诱导评测 (Tool Calling Eval) ===${colors.reset}`);
    const evalReport = await runAgentToolEval(allToolsMap);

    for (const r of evalReport.results) {
      if (r.pass) {
        console.log(`  ${colors.green}✔${colors.reset} [${r.id}] ${colors.dim}${r.description}${colors.reset} -> ${colors.cyan}${r.actualTool || '(无调用)'}${colors.reset}`);
      } else {
        console.log(`  ${colors.red}✖${colors.reset} [${r.id}] ${r.description}`);
        console.log(`    ${colors.red}↳ 期望工具: ${r.expectedTool || 'none'}, 实际命中: ${r.actualTool || 'none'}${colors.reset}`);
        if (r.schemaErrors && r.schemaErrors.length > 0) {
          console.log(`    ${colors.red}↳ 参数校验错误: ${r.schemaErrors.join('; ')}${colors.reset}`);
        }
      }
    }

    console.log(`  ${colors.bold}评测通过率: ${evalReport.passed} / ${evalReport.total} (${Math.round((evalReport.passed / evalReport.total) * 100)}%)${colors.reset}\n`);
    if (evalReport.failed > 0) {
      totalFailures += evalReport.failed;
    }
  }

  // ───────────────────────────────────────────
  // Layer 4: 权限边界与破坏性保护门禁
  // ───────────────────────────────────────────
  if (runSecurity) {
    console.log(`${colors.bold}${colors.magenta}=== Layer 4: 权限边界与安全防护门禁 ===${colors.reset}`);
    let secNoted = 0;

    for (const [name, tool] of allToolsMap.entries()) {
      const res = await testToolSecurity(tool);
      if (res.isDestructive) {
        secNoted++;
        console.log(`  ${colors.yellow}🛡️  [${name}]${colors.reset} (破坏性操作): ${res.note}`);
      }
    }

    console.log(`  ${colors.green}✔ 安全审计完成: 共检测 ${secNoted} 个敏感变更工具，防护策略就绪${colors.reset}\n`);
  }

  // ───────────────────────────────────────────
  // 最终验收总结
  // ───────────────────────────────────────────
  console.log(`${colors.bold}──────────────────────────────────────────────────────────────${colors.reset}`);
  if (totalFailures === 0) {
    console.log(`${colors.bold}${colors.green}🎉 测试套件全部通过！DSH Agent 可正常可靠地调用所有插件工具。${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`${colors.bold}${colors.red}🚨 测试套件存在 ${totalFailures} 个未通过用例，请修复对应工具。${colors.reset}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`${colors.red}测试套件运行异常:${colors.reset}`, err);
  process.exit(1);
});
