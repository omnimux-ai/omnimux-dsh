import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { evaluateAntiCheat, decideOldStandardDeclaration, collectOldStandardDeclarations, handle } from './guard-anti-cheat.mjs';
import { inspectTestStandardChange } from './test-authoring-inspection.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const SAMPLES_DIR = resolve(ROOT_DIR, 'tests/anti-cheat-samples');

describe('AI Agent 防造假与自适应门禁系统测试 (guard-anti-cheat.test.mjs)', () => {

  describe('1. 白名单样本集回归测试 (Allowlist - 防误杀验证)', () => {
    const allowDir = resolve(SAMPLES_DIR, 'allowlist');
    const allowFiles = readdirSync(allowDir).filter(f => f.endsWith('.json'));

    it('必须至少包含已定义的合规白样本', () => {
      assert.ok(allowFiles.length >= 3, `白样本数量不足，当前仅有 ${allowFiles.length} 个`);
    });

    for (const file of allowFiles) {
      const sample = JSON.parse(readFileSync(resolve(allowDir, file), 'utf8'));
      it(`[白样本 ${sample.id}] ${sample.description} -> 应当判定为 ALLOW`, () => {
        const result = evaluateAntiCheat({
          tool: 'write',
          filePath: sample.filePath,
          content: sample.code,
          intent: sample.intent
        });
        assert.equal(
          result.permissionDecision,
          'allow',
          `样本 ${sample.id} 被错误拦截！拦截原因: ${result.reason}`
        );
      });
    }
  });

  describe('2. 黑名单样本集回归测试 (Blocklist - 防漏逃验证)', () => {
    const blockDir = resolve(SAMPLES_DIR, 'blocklist');
    const blockFiles = readdirSync(blockDir).filter(f => f.endsWith('.json'));

    it('必须至少包含已定义的作弊黑样本', () => {
      assert.ok(blockFiles.length >= 4, `黑样本数量不足，当前仅有 ${blockFiles.length} 个`);
    });

    for (const file of blockFiles) {
      const sample = JSON.parse(readFileSync(resolve(blockDir, file), 'utf8'));
      it(`[黑样本 ${sample.id}] ${sample.description} -> 应当判定为 DENY`, () => {
        const result = evaluateAntiCheat({
          tool: 'write',
          filePath: sample.filePath,
          content: sample.code,
          intent: sample.intent
        });
        assert.equal(
          result.permissionDecision,
          'deny',
          `样本 ${sample.id} 逃逸成功！本应被拦截却返回了 allow`
        );
        if (sample.expectedReasonSnippet) {
          assert.ok(
            result.reason?.includes(sample.expectedReasonSnippet),
            `拦截原因未包含预期关键词: ${result.reason}`
          );
        }
      });
    }
  });

  describe('3. 自述审批不构成授权 (ignored_noauthority)', () => {
    it('原本被拦截的黑样本携带 approved 元数据仍须拒绝', () => {
      const targetPath = 'plugins/omnimux/src/services/legacy-bridge.ts';
      const mockCode = 'const mockBridgeResponse = [{ bridgeId: 101 }];';

      // 1. 无豁免时被死死拦截
      const deniedResult = evaluateAntiCheat({
        tool: 'write',
        filePath: targetPath,
        content: mockCode,
        intent: 'business_code'
      });
      assert.equal(deniedResult.permissionDecision, 'deny');

      // 同一生产输入不得因为调用者自述 approved 改变规则。
      const approvedResult = evaluateAntiCheat({
        tool: 'write',
        filePath: targetPath,
        content: mockCode,
        intent: 'business_code',
        exemptions: [
          {
            id: 'EXEMPT-2026-001',
            filePath: targetPath,
            status: 'approved',
            justification: '经架构师批准用于旧系统兼容过渡桥接'
          }
        ]
      });
      assert.equal(approvedResult.permissionDecision, 'deny');
      assert.equal(approvedResult.ruleId, 'RULE-02-ANTI-MOCK-DATA');
    });
  });

  describe('production intent never grants checking exemptions', () => {
    it('rejects the same production mock regardless of declared intent', () => {
      for (const intent of ['business_code', 'test_authoring', 'frontend_skeleton', 'fallback_infra']) {
        const result = evaluateAntiCheat({ tool: 'write', filePath: 'plugins/omnimux/src/authority-example.js', content: 'const mockData = [{ id: 1 }];', intent });
        assert.equal(result.permissionDecision, 'deny');
        assert.equal(result.ruleId, 'RULE-02-ANTI-MOCK-DATA');
      }
    });
    it('does not treat logging and declared fallback intent as proof of successful recovery', () => {
      const result = evaluateAntiCheat({ tool: 'write', filePath: 'plugins/omnimux/src/authority-example.js', content: "try { remote(); } catch (error) { logger.warn('failed'); return { ok: true }; }", intent: 'fallback_infra' });
      assert.equal(result.permissionDecision, 'deny');
      assert.equal(result.ruleId, 'RULE-03-ANTI-SILENT-CATCH');
      const fixture = evaluateAntiCheat({ tool: 'write', filePath: 'tests/fixtures/authority-example.mock.js', content: 'const mockData = [{ id: 1 }];' });
      assert.equal(fixture.permissionDecision, 'allow');
    });
  });

  describe('4. DSH PreToolUse 运行时装配集成验证 (Hooks Wiring Verification)', () => {
    it('.dsh/hooks.json 必须在 PreToolUse 中显式挂载 guard-anti-cheat.mjs', () => {
      const hooksPath = resolve(ROOT_DIR, '.dsh/hooks.json');
      const hooksConfig = JSON.parse(readFileSync(hooksPath, 'utf8'));
      assert.ok(Array.isArray(hooksConfig.PreToolUse), 'PreToolUse 必须是数组');

      const found = hooksConfig.PreToolUse.some(item => {
        const matchesTool = item.matcher && (item.matcher.includes('write') || item.matcher.includes('edit'));
        const hasHook = Array.isArray(item.hooks) && item.hooks.some(h => h.command?.includes('guard-anti-cheat.mjs'));
        return matchesTool && hasHook;
      });

      assert.ok(
        found,
        'CRITICAL: .dsh/hooks.json 未在 PreToolUse 中注册 guard-anti-cheat.mjs！门禁无法在运行时自动生效。'
      );
    });
  });

  describe('5. CLI 运行时协议与契约测试 (Runtime Protocol & HookSpecificOutput Verification)', () => {
    const SCRIPT_PATH = resolve(__dirname, 'guard-anti-cheat.mjs');

    it('通过 stdin 传入作弊写入时，stdout 必须包含正确 hookSpecificOutput.permissionDecision === "deny"', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: 'plugins/omnimux/src/test.ts',
          content: 'const mockData = [{ id: 1 }];'
        }
      });

      const proc = spawnSync('node', [SCRIPT_PATH], {
        input: payload,
        encoding: 'utf8'
      });

      assert.ok(proc.stdout, 'stdout 不得为空');
      const parsed = JSON.parse(proc.stdout.trim());
      assert.ok(parsed.hookSpecificOutput, '必须包含 hookSpecificOutput 顶层包装');
      assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
      assert.ok(
        parsed.hookSpecificOutput.permissionDecisionReason?.includes('硬门禁拦截'),
        '拦截原因必须清晰明了'
      );
    });

    it('CLI environment intent and claimed approval never exempt production writes', () => {
      for (const intent of ['test_authoring', 'frontend_skeleton', 'fallback_infra']) {
        const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'write', intent, exemptions: [{ filePath: 'plugins/omnimux/src/authority-cli.js', status: 'approved' }], tool_input: { file_path: 'plugins/omnimux/src/authority-cli.js', content: 'const mockData = [{ id: 1 }];' } });
        const proc = spawnSync('node', [SCRIPT_PATH], { input: payload, encoding: 'utf8', env: Object.assign({}, process.env, { DSH_TASK_INTENT: intent }) });
        assert.equal(proc.status, 0);
        const parsed = JSON.parse(proc.stdout.trim());
        assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
      }
    });

    it('通过 stdin 传入合法文件写入时，stdout 必须输出 hookSpecificOutput.permissionDecision === "allow"', () => {
      const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'write',
        tool_input: {
          file_path: 'plugins/omnimux/src/calculator.ts',
          content: 'export function calculateTotal(a: number, b: number) { return a + b; }'
        }
      });

      const proc = spawnSync('node', [SCRIPT_PATH], {
        input: payload,
        encoding: 'utf8'
      });

      assert.ok(proc.stdout, 'stdout 不得为空');
      const parsed = JSON.parse(proc.stdout.trim());
      assert.ok(parsed.hookSpecificOutput, '必须包含 hookSpecificOutput 顶层包装');
      assert.equal(parsed.hookSpecificOutput.permissionDecision, 'allow');
    });

    it('Fail-Closed 契约：当 stdin 传入畸变数据无法解析时，必须拒绝放行 (deny)', () => {
      const proc = spawnSync('node', [SCRIPT_PATH], {
        input: '{ broken invalid json payload',
        encoding: 'utf8'
      });

      assert.ok(proc.stdout, 'stdout 不得为空');
      const parsed = JSON.parse(proc.stdout.trim());
      assert.ok(parsed.hookSpecificOutput, '必须包含 hookSpecificOutput 顶层包装');
      assert.equal(
        parsed.hookSpecificOutput.permissionDecision,
        'deny',
        '畸变输入或异常情况下必须 Fail-Closed 判定为 deny，严禁静默 allow！'
      );
    });
  });

  describe('4. 旧标准变更通道 (spec 点名后放行)', () => {
    const FILE = 'plugins/demo/tests/a.test.mjs';
    const BEFORE = "test('keeps contract', () => { assert.equal(actual(), 1) })";
    const AFTER = "test('keeps contract', () => { assert.equal(actual(), 2) })";

    it('未声明时，削弱既有断言仍然拒绝（通道不是后门）', () => {
      const inspection = inspectTestStandardChange(BEFORE, AFTER);
      assert.equal(inspection.allowed, false);
      const decision = decideOldStandardDeclaration({ filePath: FILE, inspection, declarations: [] });
      assert.equal(decision.permissionDecision, 'deny');
      assert.ok(decision.reason.includes('硬门禁拦截'), '拒绝信息必须保留硬门禁标记');
      assert.ok(decision.reason.includes('keeps contract'), '拒绝信息必须点名缺失的用例');
    });

    it('逐条点名后放行', () => {
      const inspection = inspectTestStandardChange(BEFORE, AFTER);
      const decision = decideOldStandardDeclaration({
        filePath: FILE,
        inspection,
        declarations: [{ path: FILE, caseName: 'keeps contract' }],
      });
      assert.deepEqual(decision, { permissionDecision: 'allow' });
    });

    it('同名但不同文件不算声明', () => {
      const inspection = inspectTestStandardChange(BEFORE, AFTER);
      const decision = decideOldStandardDeclaration({
        filePath: FILE,
        inspection,
        declarations: [{ path: 'plugins/demo/tests/other.test.mjs', caseName: 'keeps contract' }],
      });
      assert.equal(decision.permissionDecision, 'deny');
    });

    it('只声明一部分时，点名缺失的那条', () => {
      const before = "test('keeps contract', () => { assert.equal(actual(), 1) }); test('stays put', () => { assert.equal(other(), 2) })";
      const after = "test('keeps contract', () => { assert.equal(actual(), 2) }); test('stays put', () => { assert.equal(other(), 3) })";
      const inspection = inspectTestStandardChange(before, after);
      assert.deepEqual(inspection.changedCases, ['keeps contract', 'stays put']);
      const decision = decideOldStandardDeclaration({
        filePath: FILE,
        inspection,
        declarations: [{ path: FILE, caseName: 'keeps contract' }],
      });
      assert.equal(decision.permissionDecision, 'deny');
      assert.ok(decision.reason.includes('stays put'));
      assert.ok(!decision.reason.includes('缺声明：`keeps contract`'), '已声明的用例不应出现在缺失列表');
    });

    it('通道只覆盖旧标准类原因，其它拒绝原因不进入', () => {
      // 跳过/聚焦类风险与「旧标准更正」无关，必须保持硬拒绝且不给通道。
      const inspection = { allowed: false, reason: 'test-execution-option-needs-review', changedCases: ['keeps contract'] };
      assert.equal(decideOldStandardDeclaration({ filePath: FILE, inspection, declarations: [{ path: FILE, caseName: 'keeps contract' }] }), null);
      // 无可点名对象时同样不开放通道。
      const unnamed = { allowed: false, reason: 'test-assertion-removed-or-rewritten', changedCases: [] };
      assert.equal(decideOldStandardDeclaration({ filePath: FILE, inspection: unnamed, declarations: [{ path: FILE, caseName: 'keeps contract' }] }), null);
      // 已放行的编辑不需要通道。
      const allowed = { allowed: true, reason: null, changedCases: [] };
      assert.equal(decideOldStandardDeclaration({ filePath: FILE, inspection: allowed, declarations: [] }), null);
    });

    it('声明汇总返回结构化条目（当前任务规格未声明时为空数组）', () => {
      const declarations = collectOldStandardDeclarations();
      assert.ok(Array.isArray(declarations), '声明汇总必须是数组');
      for (const entry of declarations) {
        assert.equal(typeof entry.path, 'string');
        assert.equal(typeof entry.caseName, 'string');
      }
    });

    it('端到端：未声明的断言改写经 evaluateAntiCheat 仍为 deny', () => {
      // 需要一个磁盘上真实存在的测试文件，门禁才会走「前后对比」而不是「新增检查」。
      const dir = resolve(SAMPLES_DIR, 'old-standard-channel');
      const target = resolve(dir, 'e2e-probe.test.mjs');
      mkdirSync(dir, { recursive: true });
      try {
        writeFileSync(target, BEFORE);
        const result = evaluateAntiCheat({ tool: 'write', filePath: target, content: AFTER });
        assert.equal(result.permissionDecision, 'deny');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

});
