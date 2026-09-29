#!/usr/bin/env node
/**
 * scripts/guard-anti-cheat.mjs
 * AI Agent 防兜底、假数据与虚假交差自适应硬门禁 (PreToolUse Guard)
 *
 * 特性：
 *  1. 意图作用域感知 (Task Intent Scoping)：支持测试用例与骨架屏合法场景自适应放行；
 *  2. 行为级防造假拦截 (Anti-Mock & Anti-Silent-Catch)：拦截伪造数据与吞错假交差；
 *  3. 结构化豁免支持 (Policy Exemption Token)：支持人工一键审批后携带 token 放行；
 *  4. 既可作为 DSH PreToolUse 独立运行，也可作为 ESM 模块由单元测试复用。
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

/**
 * 核心判定函数
 * @param {object} params
 * @param {string} params.tool - 工具名称 (write|edit)
 * @param {string} params.filePath - 目标文件路径
 * @param {string} params.content - 拟写入/替换的内容
 * @param {string} [params.intent] - 任务意图 (business_code|test_authoring|frontend_skeleton|fallback_infra)
 * @param {Array<object>} [params.exemptions] - 已获批准的豁免列表
 * @returns {{ permissionDecision: 'allow'|'deny', reason?: string, ruleId?: string }}
 */
export function evaluateAntiCheat({ tool, filePath, content, intent = 'business_code', exemptions = [] }) {
  if (tool !== 'write' && tool !== 'edit') {
    return { permissionDecision: 'allow' };
  }

  const normalizedPath = (filePath || '').replace(/\\/g, '/');
  const code = content || '';

  // 0. 检查是否命中已批准的豁免令牌 (Exemption Token)
  for (const ex of exemptions) {
    if (ex.filePath === normalizedPath && ex.status === 'approved') {
      return {
        permissionDecision: 'allow',
        reason: `[EXEMPTION] 命中已批准的人工豁免 (ID: ${ex.id}): ${ex.justification || '允许放行'}`
      };
    }
  }

  const isTestFile = /(\btest\b|\bspec\b|__tests__|\.test\.|\.spec\.)/i.test(normalizedPath);
  const isFixtureFile = /(\bfixture\b|\bmock\b|\btest-data\b)/i.test(normalizedPath);

  // 1. 门禁 1：测试套件与评估资产只读守卫
  if (isTestFile && !isFixtureFile) {
    if (intent !== 'test_authoring') {
      return {
        permissionDecision: 'deny',
        ruleId: 'RULE-01-TEST-IMMUTABLE',
        reason: '【硬门禁拦截】测试用例与断言属于只读评估契约，严禁在业务开发中修改！请调整业务实现以匹配测试。'
      };
    }
  }

  // 2. 门禁 2：生产代码硬编码 Mock/Fake 数据注入拦截
  if (!isTestFile && !isFixtureFile) {
    // 豁免特定合法意图：骨架屏、纯 UI 占位
    if (intent !== 'test_authoring' && intent !== 'frontend_skeleton') {
      const mockPattern = /(const|let|var)\s+(mock|fake|dummy|fallback)[A-Za-z0-9_]*\s*=\s*(\[|\{)/i;
      if (mockPattern.test(code)) {
        return {
          permissionDecision: 'deny',
          ruleId: 'RULE-02-ANTI-MOCK-DATA',
          reason: '【硬门禁拦截】生产代码中检测到硬编码 Mock/Fake 数据注入。请对接真实链路或使用阻断上报协议！'
        };
      }
    }
  }

  // 3. 门禁 3：静默吞错与返回虚假成功状态拦截 (Silent Catch Guard)
  if (!isTestFile && !isFixtureFile) {
    // 检测 catch 块中直接返回伪造状态对象（如 { ok: true }, { status: 'mock_healthy' } 等）
    const silentFakeReturnPattern = /catch\s*\([^)]*\)\s*\{[^}]*return\s*\{[^}]*(ok|status|success)[^}]*\}/i;
    if (silentFakeReturnPattern.test(code)) {
      // 检查是否有合法的日志报告或告警逻辑
      const hasLogging = /(logger\.(warn|error|info)|console\.(warn|error)|telemetry\.report)/i.test(code);
      if (!hasLogging || intent !== 'fallback_infra') {
        return {
          permissionDecision: 'deny',
          ruleId: 'RULE-03-ANTI-SILENT-CATCH',
          reason: '【硬门禁拦截】检测到静默吞错并返回虚假成功状态。请向上抛出异常或记录标准化结构化日志！'
        };
      }
    }
  }

  return { permissionDecision: 'allow' };
}

/* ------------------------------------------------------------------ CLI / Hook 运行时入口 */
if (process.argv[1] && process.argv[1].endsWith('guard-anti-cheat.mjs')) {
  try {
    const rawInput = process.env.DSH_TOOL_INPUT || '{}';
    const input = JSON.parse(rawInput);
    const toolName = process.env.DSH_TOOL_NAME || 'write';
    const intent = process.env.DSH_TASK_INTENT || 'business_code';

    let exemptions = [];
    const exemptionPath = resolve(process.cwd(), '.tmp/anti-cheat-exemptions.json');
    if (existsSync(exemptionPath)) {
      try {
        exemptions = JSON.parse(readFileSync(exemptionPath, 'utf8'));
      } catch {}
    }

    const decision = evaluateAntiCheat({
      tool: toolName,
      filePath: input.file_path,
      content: input.content || input.new_string || '',
      intent,
      exemptions
    });

    console.log(JSON.stringify(decision));
    if (decision.permissionDecision === 'deny') {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    // 门禁自身出现解析异常时，Fail-Safe 策略：打印警报但不无故中断正常流水线
    console.error('[guard-anti-cheat] 门禁执行异常:', err);
    console.log(JSON.stringify({ permissionDecision: 'allow' }));
    process.exit(0);
  }
}
