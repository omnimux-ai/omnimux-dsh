import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../');

test('E2E: 出厂 Agent 预设名称精简与字典序 1~5 order 约束', () => {
  const presetsDir = path.join(root, 'presets');

  // 1. 创建Agent (order: 1)
  const cordisPreset = fs.readFileSync(path.join(presetsDir, 'cordis/preset.yml'), 'utf8');
  assert.match(cordisPreset, /name:\s*创建Agent/, 'cordis 预设名称必须为创建Agent');
  assert.match(cordisPreset, /order:\s*1/, 'cordis 预设 order 必须为 1 (首字母 C)');

  // 2. 短剧专家 (order: 2)
  const dramaPreset = fs.readFileSync(path.join(presetsDir, 'drama-agent/preset.yml'), 'utf8');
  assert.match(dramaPreset, /name:\s*短剧专家/, 'drama-agent 预设名称必须为短剧专家');
  assert.match(dramaPreset, /order:\s*2/, 'drama-agent 预设 order 必须为 2 (首字母 D)');

  // 3. 日常工作 (order: 3)
  const dailyWorkPreset = fs.readFileSync(path.join(presetsDir, 'daily-work/preset.yml'), 'utf8');
  assert.match(dailyWorkPreset, /name:\s*日常工作/, 'daily-work 预设名称必须为日常工作');
  assert.match(dailyWorkPreset, /order:\s*3/, 'daily-work 预设 order 必须为 3 (首字母 R)');

  // 4. 社媒专家 (order: 4)
  const omniPreset = fs.readFileSync(path.join(presetsDir, 'omni-agent/preset.yml'), 'utf8');
  assert.match(omniPreset, /name:\s*社媒专家/, 'omni-agent 预设名称必须为社媒专家');
  assert.match(omniPreset, /order:\s*4/, 'omni-agent 预设 order 必须为 4 (首字母 S)');

  // 5. 营销专家 (order: 5)
  const marketingPreset = fs.readFileSync(path.join(presetsDir, 'marketing-agent/preset.yml'), 'utf8');
  assert.match(marketingPreset, /name:\s*营销专家/, 'marketing-agent 预设名称必须为营销专家');
  assert.match(marketingPreset, /order:\s*5/, 'marketing-agent 预设 order 必须为 5 (首字母 Y)');
});

test('E2E: 确保社媒专家锁定为默认值守 Agent', () => {
  const syncScript = fs.readFileSync(path.join(root, 'scripts/sync-agent-presets.sh'), 'utf8');
  assert.match(syncScript, /default:\s*omni-agent/, '同步脚本必须配置默认预设为 omni-agent (社媒专家)');
});

test('E2E: 出厂保留 tiktok-agent 向后兼容别名，且名称对齐社媒专家', () => {
  const presetsDir = path.join(root, 'presets');
  const tiktokPreset = fs.readFileSync(path.join(presetsDir, 'tiktok-agent/preset.yml'), 'utf8');
  assert.match(tiktokPreset, /name:\s*社媒专家/, 'tiktok-agent 兼容别名名称必须对齐社媒专家');

  const syncScript = fs.readFileSync(path.join(root, 'scripts/sync-agent-presets.sh'), 'utf8');
  assert.doesNotMatch(syncScript, /mv.*tiktok-agent.*\.retired/, '同步脚本严禁将 tiktok-agent 兼容预设移入 .retired');
  assert.match(syncScript, /\.agent-presets\/tiktok-agent/, '同步脚本必须保障用户根目录同步 tiktok-agent 兼容别名');

  const patchScript = fs.readFileSync(path.join(root, 'scripts/patch-asar-agent-presets.mjs'), 'utf8');
  assert.match(patchScript, /presetAgentPresets/, 'Asar patch 脚本必须支持 preset/agent-presets 节点挂载');
});
