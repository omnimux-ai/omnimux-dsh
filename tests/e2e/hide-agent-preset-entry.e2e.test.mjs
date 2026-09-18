import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E: 验证输入框上方 Agent 切换入口彻底移除且保留社媒专家默认值守', () => {
  const stylesPath = path.join(root, 'plugins/omnimux/src/client/styles.js');
  const stylesContent = fs.readFileSync(stylesPath, 'utf8');

  // 1. 验证 styles.js 包含对 AgentPresetSeat 及插槽的防御性隐藏规则
  assert.ok(
    stylesContent.includes('[data-slot="conversation.hero.agentPreset"]'),
    '必须包含对 [data-slot="conversation.hero.agentPreset"] 的隐藏规则'
  );
  assert.ok(
    stylesContent.includes('[data-omnimux-preset-seat]'),
    '必须包含对 [data-omnimux-preset-seat] 的隐藏规则'
  );
  assert.ok(
    stylesContent.includes('button[class*="AgentPresetSeat_seat"]') ||
    stylesContent.includes('button[class*="PnBhwW_seat"]'),
    '必须包含对 AgentPresetSeat 按钮类名的隐藏规则'
  );

  // 2. 绝对安全红线：严禁包含全局大容器 [data-composer-seat] 的隐藏规则（防范历史 PR #2294 事故）
  assert.doesNotMatch(
    stylesContent,
    /\[data-composer-seat\][\s,]*\{[^}]*display:\s*none\s*!important/i,
    '严禁对大容器 [data-composer-seat] 设置 display: none 导致输入框被吞'
  );

  // 3. 验证默认预设配置仍为 omni-agent (社媒专家)
  const syncScript = fs.readFileSync(path.join(root, 'scripts/sync-agent-presets.sh'), 'utf8');
  assert.match(syncScript, /default:\s*omni-agent/, '系统默认预设必须始终保持为 omni-agent (社媒专家)');
});
