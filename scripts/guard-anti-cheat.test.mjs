import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { evaluateAntiCheat } from './guard-anti-cheat.mjs';

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

  describe('3. 人工申诉与豁免机制测试 (Exemption Mechanism)', () => {
    it('对于原本会被拦截的黑样本，当携带有效审批豁免令牌时，应当成功放行', () => {
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

      // 2. 携带已批准豁免令牌时放行
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
      assert.equal(approvedResult.permissionDecision, 'allow');
      assert.ok(approvedResult.reason.includes('命中已批准的人工豁免'));
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

});
