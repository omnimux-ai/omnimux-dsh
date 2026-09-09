import { test } from 'node:test'
import { ok, equal, deepEqual } from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const CONTENT = [
  'expert_content_copywriter',
  'expert_speech',
  'expert_image',
  'expert_video',
  'expert_music',
  'expert_editing',
]
const ENGAGEMENT = [
  'expert_interaction_automator',
  'expert_ai_comment',
  'expert_signal_miner',
  'expert_brand_monitor',
]
const ALL = [...CONTENT, ...ENGAGEMENT]

const FORK_END = [
  '    - id: tool-subagent-fork',
  "      name: '@deepseek-ai/dsh-tool-subagent'",
  '      config:',
  '        provider: fork',
  '        toolName: subagent_fork',
  '        backgroundMode: continuable',
].join('\n')

function read(rel) {
  return readFileSync(join(root, rel), 'utf8')
}

function toolNames(text) {
  return [...text.matchAll(/toolName: (expert_\w+)/g)].map((m) => m[1])
}

function parseWithPython(rel) {
  const script = `
import sys, yaml
from pathlib import Path
p = Path(sys.argv[1])
text = p.read_text()
def js_ctor(loader, node):
    return False
yaml.SafeLoader.add_constructor('tag:yaml.org,2002:js', js_ctor)
docs = list(yaml.load_all(text, Loader=yaml.SafeLoader))
# agent.cordis.yml is a single sequence of mappings
data = docs[0]
assert isinstance(data, list), type(data)
print(len(data))
`
  const res = spawnSync('python3', ['-c', script, join(root, rel)], { encoding: 'utf8' })
  if (res.status !== 0) {
    throw new Error(`${rel} yaml parse failed:\n${res.stderr || res.stdout}`)
  }
  return Number(res.stdout.trim())
}

test('preset fragments exist and list the expected experts', () => {
  const content = read('presets/fragments/content-experts.cordis.yml')
  const engagement = read('presets/fragments/engagement-experts.cordis.yml')
  deepEqual(toolNames(content), CONTENT)
  deepEqual(toolNames(engagement), ENGAGEMENT)
})

test('tiktok-agent agent.cordis.yml is structurally valid and mounts all 10 experts', () => {
  const rel = 'presets/tiktok-agent/agent.cordis.yml'
  ok(existsSync(join(root, rel)), rel)
  const text = read(rel)
  ok(!text.includes("name: '@deepseek-ai/dsh-tool-subagent    #"), 'mangled subagent line')
  ok(!text.includes("name: '@deepseek-ai/dsh-tool-s    #"), 'mangled fork line')
  ok(text.includes(FORK_END), 'complete tool-subagent-fork block')
  deepEqual(toolNames(text), ALL)
  const rows = parseWithPython(rel)
  ok(rows >= 8, `tiktok-agent parsed ${rows} top-level rows`)
})

test('standard agent.cordis.yml is structurally valid code development agent', () => {
  const rel = 'presets/standard/agent.cordis.yml'
  ok(existsSync(join(root, rel)), rel)
  const text = read(rel)
  deepEqual(toolNames(text), [])
  ok(text.includes('tool-bash'))
  ok(text.includes('tool-fs'))
  ok(text.includes('tool-skill'))
  ok(text.includes('tool-goal'))
  ok(text.includes('tool-workflow'))
  ok(text.includes('代码开发') || text.includes('CodeDev'))
  const rows = parseWithPython(rel)
  ok(rows >= 8, `standard parsed ${rows} top-level rows`)
})

test('daily-work agent.cordis.yml is structurally valid daily work collaboration agent', () => {
  const rel = 'presets/daily-work/agent.cordis.yml'
  ok(existsSync(join(root, rel)), rel)
  const text = read(rel)
  deepEqual(toolNames(text), [])
  ok(text.includes('tool-bash'))
  ok(text.includes('tool-fs'))
  ok(text.includes('tool-skill'))
  ok(text.includes('tool-goal'))
  ok(text.includes('tool-todo'))
  ok(text.includes('tool-web'))
  ok(text.includes('日常工作') && text.includes('WorkAssistant'))
  ok(text.includes('工作规划与任务推进'))
  ok(text.includes('日常文书与方案拟定'))
  ok(text.includes('信息检索与知识整理'))
  ok(text.includes('综合事务与沟通辅助'))
  const rows = parseWithPython(rel)
  ok(rows >= 8, `daily-work parsed ${rows} top-level rows`)
})

test('cordis preset exists and includes native cordis capabilities and skills', () => {
  const rel = 'presets/cordis/agent.cordis.yml'
  ok(existsSync(join(root, rel)), rel)
  const rows = parseWithPython(rel)
  ok(rows >= 8, `cordis parsed ${rows} top-level rows`)
  ok(existsSync(join(root, 'presets/cordis/skills/cordis-plugin-development/SKILL.md')))
  ok(existsSync(join(root, 'presets/cordis/skills/editing-cordis-compositions/SKILL.md')))
})

test('preset.yml metadata matches requirements for all four shipped presets', () => {
  const tiktokPreset = read('presets/tiktok-agent/preset.yml')
  ok(tiktokPreset.includes('name: TikTokAgent'))
  ok(tiktokPreset.includes('order: 1'))

  const standardPreset = read('presets/standard/preset.yml')
  ok(standardPreset.includes('name: 代码开发'))
  ok(standardPreset.includes('order: 2'))

  const dailyWorkPreset = read('presets/daily-work/preset.yml')
  ok(dailyWorkPreset.includes('name: 日常工作'))
  ok(dailyWorkPreset.includes('order: 3'))

  const cordisPreset = read('presets/cordis/preset.yml')
  ok(cordisPreset.includes('name: 创造模式') || cordisPreset.includes('name: 组建团队'))
  ok(cordisPreset.includes('order: 4'))

  const contentCreationPreset = read('presets/content-creation-team/preset.yml')
  ok(contentCreationPreset.includes('name: 内容创作'))
})

test('sync-agent-presets.sh maintains all four presets in KEEP array', () => {
  const syncScript = read('scripts/sync-agent-presets.sh')
  ok(syncScript.includes('KEEP=(tiktok-agent standard daily-work cordis') && syncScript.includes('content-creation-team)'))
})

test('tiktok-agent persona positions as TikTokAgent lead and forbids forced spawn', () => {
  const text = read('presets/tiktok-agent/agent.cordis.yml')
  ok(text.includes('TikTokAgent'))
  ok(text.includes('不强行委派') || text.includes('禁止为了「显得专业」而 spawn'))
  ok(text.includes('不要尝试切换会话 preset'))
})

test('build-agent-presets is idempotent', () => {
  const before = read('presets/tiktok-agent/agent.cordis.yml')
  const res = spawnSync('node', [join(root, 'scripts/build-agent-presets.mjs')], {
    cwd: root,
    encoding: 'utf8',
  })
  equal(res.status, 0, res.stderr || res.stdout)
  const after = read('presets/tiktok-agent/agent.cordis.yml')
  equal(after, before)
})
