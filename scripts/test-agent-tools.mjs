#!/usr/bin/env node
/**
 * @file test-agent-tools.mjs
 * @description DSH 全局 Agent 插件工具测试套件主入口 (Test Suite for DSH Agent Plugin Tools)
 *
 * 测试分层：
 * - Layer 1: 静态契约与 JSON Schema 严格校验 (Contract & Schema Lint)
 * - Layer 2: 隔离沙箱与容错执行测试 (Isolated Execution & Error-handling)
 * - Layer 3: 离线路由冒烟（正则模拟，非真实模型评测）(Offline Routing Smoke)
 * - Layer 4: 权限边界与破坏性保护门禁 (Security & Sandbox Gates)
 * - Layer 5: 上下文预算与缓存站位（只拦相对基线新增）(Context Budget Ratchet)
 */

import { fileURLToPath } from 'node:url';
import { loadAllPluginSurfaces, loadBudgetSurfaces } from './agent-tools-suite/loader.mjs';
import { validateToolContract } from './agent-tools-suite/schema-lint.mjs';
import { testToolExecution } from './agent-tools-suite/execution-guard.mjs';
import { testToolSecurity } from './agent-tools-suite/security-guard.mjs';
import { runAgentToolEval } from './agent-tools-suite/eval-runner.mjs';
import {
  BUDGET_LIMITS,
  baselineFromReport,
  buildBudgetReport,
  evaluateAgainstBaseline,
  readBaseline,
  writeBaseline,
} from './agent-tools-suite/budget.mjs';

const BUDGET_BASELINE_PATH = fileURLToPath(new URL('./agent-tools-suite/budget-baseline.json', import.meta.url));

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
const writeBudgetBaseline = args.includes('--write-baseline');
// 第 5 层需要全部插件构建产物，只在显式 --budget 时运行（CI 在构建后单独调用），默认入口行为不变
const runBudget = args.includes('--budget') || writeBudgetBaseline;

function argValue(flag) {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : undefined;
  // 下一个参数本身是开关（如 --budget）时视为未提供，避免被误当成理由
  return typeof value === 'string' && !value.startsWith('--') ? value : undefined;
}

async function main() {
  console.log(`\n${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}   🛡️  DSH Agent 插件工具全量自动化测试套件 (Test Suite)       ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}══════════════════════════════════════════════════════════════${colors.reset}\n`);

  const rootDir = process.cwd();
  console.log(`${colors.cyan}ℹ${colors.reset} 正在自动装载工作区插件并发现可用工具...`);
  const surfaces = await loadAllPluginSurfaces(rootDir);
  const allToolsMap = surfaces.tools;
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
      console.log(`  ${colors.green}✔ 全部 ${allToolsMap.size} 个工具通过隔离调用、无损 JSON 与签名契约校验${colors.reset}\n`);
    } else {
      console.log(`  ${colors.red}✖ 隔离调用发现 ${execErrors} 个工具执行违背契约或产生脏数据${colors.reset}\n`);
      totalFailures += execErrors;
    }
  }

  // ───────────────────────────────────────────
  // Layer 3: 离线路由冒烟（正则模拟器，不调用模型，不代表真实模型路由准确率）
  // ───────────────────────────────────────────
  if (runEval) {
    console.log(`${colors.bold}${colors.magenta}=== Layer 3: 离线路由冒烟（正则模拟，非模型评测）===${colors.reset}`);
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

    console.log(`  ${colors.bold}离线冒烟通过: ${evalReport.passed} / ${evalReport.total}（正则模拟，不代表模型调用准确率）${colors.reset}\n`);
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
  // Layer 5: 上下文预算与缓存站位（棘轮：只拦相对基线新增）
  // ───────────────────────────────────────────
  if (runBudget) {
    console.log(`${colors.bold}${colors.magenta}=== Layer 5: 上下文预算与缓存站位（单位：字符，非 token）===${colors.reset}`);
    const budgetSurfaces = await loadBudgetSurfaces(rootDir, surfaces);
    const report = buildBudgetReport(budgetSurfaces);

    for (const [plugin, row] of Object.entries(report.perPlugin).sort(([a], [b]) => a.localeCompare(b))) {
      if (row.tools === 0 && row.sections === 0) continue;
      const staticNote = row.staticTools > 0 ? ` ${colors.yellow}（${row.staticTools} 个静态提取工具参数未计入）${colors.reset}` : '';
      console.log(`  ${plugin}: 工具 ${row.tools} 个 / 定义 ${row.toolChars} 字符；提示词段 ${row.sections} 个 / ${row.promptChars} 字符${staticNote}`);
    }
    for (const p of budgetSurfaces.plugins.filter((item) => item.loadError)) {
      console.log(`  ${colors.yellow}⚠ ${p.name} 未纳入度量：${p.loadError}${colors.reset}`);
    }
    console.log(`  合计：工具定义 ${report.totals.toolChars} 字符，提示词段 ${report.totals.promptChars} 字符`);
    for (const pair of report.duplicates) {
      console.log(`  ${colors.yellow}⚠ 疑似重复工具（建议按用户意图合并）: ${pair.key} (${pair.similarity})${colors.reset}`);
    }
    for (const key of report.volatile) {
      console.log(`  ${colors.yellow}⚠ 易变提示词段（每轮变化会使系统消息原地替换，应改用 systemPrompt.context）: ${key}${colors.reset}`);
    }
    for (const item of report.renderErrors) {
      console.log(`  ${colors.yellow}⚠ 提示词段求值失败（无法判定易变）: ${item.key}: ${item.error}${colors.reset}`);
    }
    const dynamicSections = report.prompts.filter((p) => p.dynamic).length;
    console.log(`  提示词段 ${report.prompts.length} 个，其中函数型 ${dynamicSections} 个参与易变检测`);

    if (writeBudgetBaseline) {
      // 构建产物缺失时写基线会漏掉整个插件，下次构建后被误判为「新增」；必须先构建
      const unbuilt = budgetSurfaces.plugins.filter((p) => p.loadError?.startsWith('入口产物不存在'));
      if (unbuilt.length > 0) {
        throw new Error(`拒绝写入基线：${unbuilt.map((p) => p.name).join(', ')} 缺少构建产物，请先运行 node scripts/build-all.mjs 与 omnimux-workflow 的 build-host`);
      }
      const baseline = baselineFromReport(report, argValue('--reason'));
      writeBaseline(BUDGET_BASELINE_PATH, baseline);
      console.log(`  ${colors.green}✔ 已写入基线 ${BUDGET_BASELINE_PATH}（理由：${baseline.reason}）${colors.reset}\n`);
    } else {
      const failures = evaluateAgainstBaseline(report, readBaseline(BUDGET_BASELINE_PATH), BUDGET_LIMITS);
      for (const f of failures) {
        console.log(`  ${colors.red}✖ [${f.kind}] ${f.subject}: ${f.detail}${colors.reset}`);
      }
      if (failures.length === 0) {
        console.log(`  ${colors.green}✔ 相对基线无新增超标、重复或易变段${colors.reset}\n`);
      } else {
        console.log(`  ${colors.red}✖ 上下文预算新增 ${failures.length} 项问题；确需放行时运行 --write-baseline --reason "<≥8 字理由>" 并在 PR 中说明${colors.reset}\n`);
        totalFailures += failures.length;
      }
    }
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
