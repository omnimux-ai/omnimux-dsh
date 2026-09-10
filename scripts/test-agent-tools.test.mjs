/**
 * @file test-agent-tools.test.mjs
 * @description DSH 全局 Agent 插件工具测试套件自动化自测用例 (Node.js test runner)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadAllPluginTools } from './agent-tools-suite/loader.mjs';
import { validateToolContract } from './agent-tools-suite/schema-lint.mjs';
import { testToolExecution } from './agent-tools-suite/execution-guard.mjs';
import { testToolSecurity } from './agent-tools-suite/security-guard.mjs';
import { runAgentToolEval } from './agent-tools-suite/eval-runner.mjs';

describe('DSH Agent Tools Unified Test Suite', async () => {
  const allToolsMap = await loadAllPluginTools(process.cwd());

  test('Tool Discovery: 成功动态加载所有插件工具', () => {
    assert.ok(allToolsMap.size > 0, '应该能够发现并装载插件工具');
  });

  test('Layer 1: 全部工具符合 JSON Schema 与 DSH 输出契约', () => {
    for (const [name, tool] of allToolsMap.entries()) {
      const res = validateToolContract(tool);
      assert.equal(res.valid, true, `工具 [${name}] 未通过契约校验: ${res.errors?.join(', ')}`);
    }
  });

  test('Layer 2: 全部工具通过隔离沙箱与空参容错调用', async () => {
    for (const [name, tool] of allToolsMap.entries()) {
      const res = await testToolExecution(tool);
      assert.equal(res.ok, true, `工具 [${name}] 隔离调用发生崩溃: ${res.error}`);
    }
  });

  test('Layer 3: Agent 意图调用评测 100% 达标', async () => {
    const report = await runAgentToolEval(allToolsMap);
    assert.equal(report.failed, 0, `存在未通过的意图评测用例: ${JSON.stringify(report.results.filter((r) => !r.pass))}`);
    assert.ok(report.passed >= 7, '通过用例数应不少于基准集');
  });

  test('Layer 4: 权限边界与破坏性操作安全防御正常', async () => {
    let audited = 0;
    for (const tool of allToolsMap.values()) {
      const res = await testToolSecurity(tool);
      if (res.isDestructive) audited++;
    }
    assert.ok(audited > 0, '应成功审计出破坏性操作工具');
  });
});
