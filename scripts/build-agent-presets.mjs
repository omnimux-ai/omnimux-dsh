#!/usr/bin/env node
/**
 * Splice OmniMux expert fragments into agent.cordis.yml files.
 *
 * Anchor is the complete `tool-subagent-fork` block (line-boundary), never a
 * mid-line `    # ──` search. Running twice is a no-op besides rewriting
 * the expert section from fragments/.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fragments = join(root, 'presets/fragments')

const FORK_END = [
  '    - id: tool-subagent-fork',
  "      name: '@deepseek-ai/dsh-tool-subagent'",
  '      config:',
  '        provider: fork',
  '        toolName: subagent_fork',
  '        backgroundMode: continuable',
].join('\n')

const TAIL_MARKERS = [
  '    # Production dsh does not install these optional providers.',
  '    # Product providers are host-plane singletons.',
]

const STANDARD_PERSONA = `    text: |
      你是 OmniMux「OmniAgent」主理人，工作目录 {{cwd}}。
      保持用户已经授权的目标、范围与约束；安全的必要步骤直接继续。只在缺少会改变结果的关键信息，或即将执行发布、私信、账号变更等外部写操作且尚无具体授权时询问。同一范围已经授权后不重复确认。

      你可自行完成营销策略、文案脚本、数据分析与工程任务，也可按需调用 10 个 expert_* 营销运营专家工具。仅当一个边界清晰的子任务能独立提升质量、速度或并行收益时委派；不要固定调用整队，简单任务或流程仪式不强行委派。派单需带目标、已有输入、约束、期望输出与证据要求，最终由你核验并整合。

      Skills 只在当前任务确有需要时读取。Skill 的步骤服务于用户目标，不得用其流程机械重问已回答或已授权事项。

      以真实工具结果、文件和当前数据收尾；区分已完成、仅建议与缺失证据，不把计划、提示词或 stub 表述成真实生成、发布或监控结果。不要尝试切换会话 preset；保持「OmniAgent」主理人定位。
`

function loadFragment(name) {
  const text = readFileSync(join(fragments, name), 'utf8').replace(/\s+$/, '')
  if (!text.includes('    - id: tool-subagent-expert-')) {
    throw new Error(`fragment ${name} has no expert spawn rows`)
  }
  return `${text}\n`
}

function spliceExperts(yml, fragment) {
  const forkAt = yml.indexOf(FORK_END)
  if (forkAt < 0) {
    throw new Error('tool-subagent-fork block not found as a complete 6-line unit')
  }
  const afterFork = forkAt + FORK_END.length
  let tailAt = -1
  let marker = ''
  for (const m of TAIL_MARKERS) {
    const i = yml.indexOf(m, afterFork)
    if (i >= 0 && (tailAt < 0 || i < tailAt)) {
      tailAt = i
      marker = m
    }
  }
  if (tailAt < 0) {
    throw new Error('no Production/Product providers tail marker after fork')
  }
  const between = yml.slice(afterFork, tailAt)
  if (between.includes("name: '@deepseek-ai/dsh-tool-subagent    #")
    || between.includes("name: '@deepseek-ai/dsh-tool-s    #")) {
    throw new Error('refusing to splice over a mangled tool-subagent line')
  }
  return `${yml.slice(0, afterFork)}\n\n${fragment}${yml.slice(tailAt)}`
}

function replaceStandardPersona(yml) {
  const personaId = yml.indexOf('- id: persona')
  if (personaId < 0) throw new Error('persona id missing')
  const start = yml.indexOf('    text:', personaId)
  const end = yml.indexOf('\n- id: agent-instructions', start)
  if (start < 0 || end < 0 || start > end) {
    throw new Error('standard persona block not found')
  }
  return `${yml.slice(0, start)}${STANDARD_PERSONA}${yml.slice(end)}`
}

const contentFrag = loadFragment('content-experts.cordis.yml')
const engagementFrag = loadFragment('engagement-experts.cordis.yml')
const bothFrag = `${contentFrag}\n${engagementFrag}`

const targets = [
  {
    file: 'presets/standard/agent.cordis.yml',
    fragment: bothFrag,
    persona: true,
  },
]

for (const t of targets) {
  const path = join(root, t.file)
  let yml = readFileSync(path, 'utf8')
  if (t.persona) yml = replaceStandardPersona(yml)
  yml = spliceExperts(yml, t.fragment)
  writeFileSync(path, yml)
  const experts = (yml.match(/toolName: expert_/g) || []).length
  console.log(`  ✓ ${t.file} experts=${experts}`)
}
