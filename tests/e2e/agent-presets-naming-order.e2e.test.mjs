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

test('E2E: 出厂严格去重，移除冗余 tiktok-agent 预设并自动清理历史残留', () => {
  const presetsDir = path.join(root, 'presets');
  assert.equal(fs.existsSync(path.join(presetsDir, 'tiktok-agent')), false, 'presets 源码目录严禁残留 tiktok-agent 冗余预设');

  const syncScript = fs.readFileSync(path.join(root, 'scripts/sync-agent-presets.sh'), 'utf8');
  assert.match(syncScript, /retired legacy \.agent-presets\/tiktok-agent/, '同步脚本必须自动清理并归档历史残留 tiktok-agent');
  assert.doesNotMatch(syncScript, /cp.*tiktok-agent/, '同步脚本严禁再向用户预设或应用目录拷贝 tiktok-agent');

  const patchScript = fs.readFileSync(path.join(root, 'scripts/patch-asar-agent-presets.mjs'), 'utf8');
  assert.match(patchScript, /presetAgentPresets/, 'Asar patch 脚本必须支持 preset/agent-presets 节点挂载');
});

test('E2E: 前端预设装饰器强制去重并隐藏重复预设项保证单选唯一性', () => {
  const enhancerSource = fs.readFileSync(path.join(root, 'plugins/omnimux/src/client/agent-preset-enhancer.js'), 'utf8');
  assert.match(enhancerSource, /export const PRESET_DUPLICATE_ATTR = ['"]data-omnimux-preset-duplicate['"]/, '必须导出 PRESET_DUPLICATE_ATTR 标记');
  assert.match(enhancerSource, /item\.setAttribute\(PRESET_DUPLICATE_ATTR,\s*['"]true['"]\)/, '重复项必须设置 duplicate 属性');
  assert.match(enhancerSource, /\[data-omnimux-preset-duplicate\][\s\S]*?display:\s*none\s*!important/, 'CSS 规则中 duplicate 属性必须具备 !important 隐藏规则');
});
