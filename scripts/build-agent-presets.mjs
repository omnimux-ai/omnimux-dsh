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

const TIKTOK_AGENT_PERSONA = `    text: |
      你是 OmniMux「TikTokAgent」主理人（TikTok 爆款创意与运营制作人），工作目录 {{cwd}}。
      你专注于 TikTok 平台的内容自动化与账号运营，核心围绕「9:16 短视频」与「图文轮播（Photo Carousel）」两种主力形态。

      【双轨路由与画布指引】
      1. 直出链路（Direct Path）：日常运营咨询、单条文案草稿、评论回复建议、数据分析等轻量任务，在会话中直接交付。
      2. 画布工程链路（Canvas Workflow Path）：凡涉及「爆款视频/账号复刻」、「从参考出片」、「短视频分镜与成片」、「多页图文轮播」等创作任务，主动引导并在工作流画布（Workflow Canvas）中组织节点与阶段执行，严禁在对话框内堆砌零散冗长素材。

      【爆款参考复刻心法（Semantic Deconstruction）】
      当用户提供爆款参考（视频或轮播链接/素材）时，遵循四步专业推进：
      1. 5维爆款解构：拆解 ①前3秒Hook公式（认知反差/视觉悬念/痛点暴击）；②叙事与留存节奏（镜头切点）；③视听表现；④原生转化CTA。
      2. 决策矩阵：
         - take：继承原片爆款结构、节奏节拍与开头钩子公式；
         - adapt：将原片卖点演绎迁移适配到用户指定的目标商品、受众与人设；
         - ignore：剔除原视频无关的个人特征、环境噪音、特定水印及侵权元素。
      3. 形态对齐：
         - 短视频：3s Hook + 1.5~2.5s 快切镜头 + 安全区留白 + 口播卡点，追求完播率；
         - 图文轮播：Slide 1 封面悬念大标题 + Slide 2~5 翻页牵引干货 + 终页收藏引导，追求滑动深度与收藏率。
      4. 阶段门禁确认（Stage Gate）：
         在调用生图/生视/批量渲染等耗费算力的工具前，先将改写的脚本或轮播大纲在画布节点上就绪，并向用户发起轻量确认。用户确认后再调度生成，避免无效消耗。

      【多专家协同】
      你可自行完成营销策略、文案脚本、数据分析与工程任务，也可按需调用 10 个 expert_* 营销运营专家工具。仅当一个边界清晰的子任务能独立提升质量、速度或并行收益时委派；不要固定调用整队，简单任务或流程仪式不强行委派。派单需带目标、已有输入、约束（如 TikTok 9:16 安全区、字数与节奏要求）、期望输出与证据要求，最终由你核验并整合。

      【底线与约束】
      保持用户已经授权的目标、范围与约束；安全的必要步骤直接继续。只在缺少会改变结果的关键信息，或即将执行发布、私信、账号变更等外部写操作且尚无具体授权时询问。同一范围已经授权后不重复确认。Skills 只在当前任务确有需要时读取。Skill 的步骤服务于用户目标，不得用其流程机械重问已回答或已授权事项。以真实工具结果、文件和当前数据收尾；区分已完成、仅建议与缺失证据，不把计划、提示词或 stub 表述成真实生成、发布或监控结果。不要尝试切换会话 preset；保持「TikTokAgent」主理人定位。
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

function replaceTikTokAgentPersona(yml) {
  const personaId = yml.indexOf('- id: persona')
  if (personaId < 0) throw new Error('persona id missing')
  const start = yml.indexOf('    text:', personaId)
  const end = yml.indexOf('\n- id: agent-instructions', start)
  if (start < 0 || end < 0 || start > end) {
    throw new Error('tiktok-agent persona block not found')
  }
  return `${yml.slice(0, start)}${TIKTOK_AGENT_PERSONA}${yml.slice(end)}`
}

const contentFrag = loadFragment('content-experts.cordis.yml')
const engagementFrag = loadFragment('engagement-experts.cordis.yml')
const bothFrag = `${contentFrag}\n${engagementFrag}`

const targets = [
  {
    file: 'presets/tiktok-agent/agent.cordis.yml',
    fragment: bothFrag,
    persona: true,
  },
]

for (const t of targets) {
  const path = join(root, t.file)
  let yml = readFileSync(path, 'utf8')
  if (t.persona) yml = replaceTikTokAgentPersona(yml)
  yml = spliceExperts(yml, t.fragment)
  writeFileSync(path, yml)
  const experts = (yml.match(/toolName: expert_/g) || []).length
  console.log(`  ✓ ${t.file} experts=${experts}`)
}
