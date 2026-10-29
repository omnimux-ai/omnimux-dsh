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
import {
  baselineFromReport,
  buildBudgetReport,
  descriptionSimilarity,
  evaluateAgainstBaseline,
  readBaseline,
} from './agent-tools-suite/budget.mjs';

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

  test('Negative Gates: 门禁必须精准拦截非无损 JSON、非法 execute 签名与假参数缺失', async () => {
    // 1. 签名门禁：必须拦截首参为 callId 的旧式签名
    const badSigTool = {
      name: 'bad_signature_tool',
      description: '这是一个用于测试旧式参数签名的工具描述',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      output: { schema: { type: 'object' }, render: () => ({ kind: 'text', content: 'ok' }) },
      execute: async (_toolCallId, args = {}) => ({ ok: true, id: args.id }),
    };
    const badSigRes = validateToolContract(badSigTool);
    assert.equal(badSigRes.valid, false);
    assert.ok(badSigRes.errors.some((e) => e.includes('execute 签名非法') && e.includes('_toolCallId')));

    // 2. 无损 JSON 门禁：必须拦截任何输出中包含 undefined 的工具
    const undefTool = {
      name: 'mock_undef_tool',
      parameters: { type: 'object', properties: {} },
      execute: async () => ({ ok: true, ghostKey: undefined }),
    };
    const undefRes = await testToolExecution(undefTool);
    assert.equal(undefRes.ok, false);
    assert.equal(undefRes.phase, 'lossless_json_empty_args');
    assert.ok(undefRes.error.includes('ghostKey'));

    // 3. 必填参数消费门禁：已在 args 提供必填参数却仍报缺失的，判定为签名错位
    const falseMissingTool = {
      name: 'mock_false_missing_tool',
      parameters: { type: 'object', properties: { targetId: { type: 'string' } }, required: ['targetId'] },
      execute: async (_toolCallId, args = {}) => {
        const { targetId } = args || {};
        if (!targetId) return { ok: false, error: 'Missing required parameter: targetId' };
        return { ok: true, targetId };
      },
    };
    const falseMissingRes = await testToolExecution(falseMissingTool);
    assert.equal(falseMissingRes.ok, false);
    assert.equal(falseMissingRes.phase, 'argument_consumption');
    assert.ok(falseMissingRes.error.includes('targetId'));
  });
});

describe('Layer 5: 上下文预算棘轮', () => {
  const tool = (plugin, name, description, extra = {}) => ({
    _plugin: plugin,
    _source: 'dynamic',
    name,
    description,
    parameters: { type: 'object', properties: {} },
    ...extra,
  });
  const surfaces = (tools, prompts = []) => ({
    tools: new Map(tools.map((t) => [t.name, t])),
    prompts,
    plugins: [],
  });
  const fixture = () =>
    surfaces([
      tool('demo', 'demo_image_submit', 'Submit an image generation task to the gateway and return the task id.'),
      tool('demo', 'demo_video_submit', 'Submit a video generation task to the gateway and return the task id.'),
      tool('demo', 'demo_list', '列出当前项目下全部演示素材，按更新时间倒序。'),
      tool('other', 'other_huge', 'x'.repeat(2100)),
      tool('other', 'other_static', 'static only', { _source: 'static' }),
    ], [
      { plugin: 'demo', kind: 'section', name: 'demo:clock', text: () => `now ${Date.now()}` },
      { plugin: 'demo', kind: 'section', name: 'demo:fixed', text: () => 'fixed rules' },
      { plugin: 'demo', kind: 'context', name: 'demo:ctx', text: () => `now ${Date.now()}` },
    ]);

  test('超标、近似重复与易变段各命中一次，无关项不误报', () => {
    const report = buildBudgetReport(fixture());
    assert.deepEqual(report.duplicates.map((d) => d.key), ['demo_image_submit~demo_video_submit']);
    assert.deepEqual(report.volatile, ['demo:demo:clock']);
    const failures = evaluateAgainstBaseline(report, { tools: [], pluginToolChars: {}, duplicates: [], volatile: [] });
    assert.deepEqual(failures.map((f) => `${f.kind}:${f.subject}`).sort(), [
      'new-duplicate-tools:demo_image_submit~demo_video_submit',
      'new-tool-over-budget:other_huge',
      'new-volatile-section:demo:demo:clock',
    ]);
  });

  test('静态提取工具参数未计入，不参与体积与超标判定', () => {
    const report = buildBudgetReport(fixture());
    assert.equal(report.perPlugin.other.staticTools, 1);
    assert.equal(report.toolSizes.some((t) => t.name === 'other_static'), false);
  });

  test('基线存量不失败；插件总量超过基线 ×1.10 失败', () => {
    const report = buildBudgetReport(fixture());
    const baseline = baselineFromReport(report, '冻结夹具存量用于测试');
    assert.deepEqual(evaluateAgainstBaseline(report, baseline), []);
    const shrunk = { ...baseline, pluginToolChars: { ...baseline.pluginToolChars, demo: 10 } };
    assert.deepEqual(evaluateAgainstBaseline(report, shrunk).map((f) => f.kind), ['plugin-tool-growth']);
  });

  test('写基线必须给出 ≥8 字理由；基线缺失或格式无效时报错退出', () => {
    const report = buildBudgetReport(fixture());
    assert.throws(() => baselineFromReport(report, undefined), /--reason/);
    assert.throws(() => baselineFromReport(report, '太短'), /--reason/);
    assert.throws(() => readBaseline('/nonexistent/budget-baseline.json'), /不存在/);
  });

  test('仓库基线可读，且描述相似度对无关文本接近 0', () => {
    readBaseline(new URL('./agent-tools-suite/budget-baseline.json', import.meta.url).pathname);
    assert.ok(descriptionSimilarity('上传素材到资产库', 'Fetch YouTube channel stats') < 0.1);
  });
});
