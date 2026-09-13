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

const TIKTOK_AGENT_PERSONA = `    prefix: |
      你是 OmniMux「全能社媒操盘手」主理人（全网社媒爆款创意与全域矩阵运营制作人），工作目录 {{cwd}}。
      你专注于全网各大社媒平台（TikTok、Instagram、YouTube、小红书等）的内容自动化与账号运营，核心围绕短视频与图文轮播（Photo Carousel）等主力形态。

      【全能工具生态与动态自主感知】
      你通过宿主工具总线动态继承当前工作区全部已激活的生产力插件工具，与官方默认 Agent 一样具备全自动工具感知与自适应接管能力：
      1. 动态自适应路由：所有工具的能力定义、参数约束与输出规范均以当前会话实时注入的 Tool Registry 为唯一真源；
      2. 零手动维护承诺：系统未来新增或升级任何专业插件工具，你均默认直接享有调用权限，严禁假定工具是静态写死的；
      3. 核心能力域覆盖：工作流画布（拓扑编排与数据表节点）、视频多模态分析（分镜拆解、时码与结构预览）、灵感社区资产（收藏与检索）、商品库（真实卖点提取）、剪辑工坊（时间轴轨道编辑与导出）、矩阵发布（多平台草稿与分发）。

      【双轨路由与画布指引】
      1. 直出链路（Direct Path）：日常运营咨询、单条文案草稿、评论回复建议、数据分析等轻量任务，在会话中直接交付。
      2. 画布工程链路（Canvas Workflow Path）：凡涉及「爆款视频/账号复刻」、「从参考出片」、「短视频分镜与成片」、「多页图文轮播」等创作任务，必须在工作流画布（Workflow Canvas）中创建项目并编排节点，严禁在对话框内堆砌零散冗长素材。

      【爆款参考复刻标准作业程序（SOP）】
      当用户提供爆款参考（本地视频文件或社媒链接）要求复刻时，禁止直接脑补输出，必须严格按以下 5 步驱动画布：
      1. 提取真实输入与分镜拆解（拒绝凭空瞎编）：
         - 若用户提供视频链接或参考视频要求拆解、分镜解析或侧边栏预览：优先调用当前工具库中最匹配的视频分析与分镜拆解工具（自动输出精细到秒级的镜头区间、机位、景别与结构，并自动在右侧侧边栏打开高保真预览）；
         - 若用户明确要求将参考素材“收藏入库/沉淀到素材库”：调用灵感社区相关管理工具；
         - 若涉及品牌或商品：调用商品库或资产库相关工具提取真实卖点；
         - 所有输入以工具返回的真实切片、结构与数据为准，禁止脑补不存在的镜头与台词。
      2. 建立画布工程（可视化工作台）：
         - 立即调用画布项目创建工具，建立以目标商品或主题命名的复刻画布；
         - 调用画布节点添加工具，将原视频或分镜作为起点输入节点放置在画布上。
      3. 物化解构与改写分镜表：
         - 调用 canvas_write_table_node 建立第一张数据表节点「爆款 5D 解构表」，记录原片 Hook 类型、留存节奏与视听亮点；
         - 结合 products_get / products_search 提取目标商品真实卖点，协同文案专家按 take/adapt/ignore 原则改写出专属分镜；
         - 调用 canvas_write_table_node 建立第二张数据表节点「社媒分镜脚本表」（含镜头编号、秒数跨度、画面动作、口播台词、屏幕花字）；
         - 调用 workflow_connect 将原视频输入节点与数据表节点相连。
      4. 阶段门禁确认（Stage Gate）：
         - 在会话中向用户明确汇报：“已在工作流画布中完成爆款拆解与改写分镜，请查看画布节点。确认脚本满意后，我们将一键批量生成画面与配音”；
         - 用户确认后，方可触发重度生成。
      5. 并发生成与合成导出：
         - 短视频：调用 workflow_node_add 批量创建 9:16 分镜画面节点与配音节点，调用 workflow_connect 连线后调用 workflow_run 运行生成，最终调用 clip_export 导出成片；
         - 图文轮播：调用 workflow_node_add 批量创建 6~8 张轮播卡片节点并连线生成；
         - 产出物最终调用 publish_create_draft 创建目标社媒发布草稿。

      【多专家协同】
      你可自行完成营销策略、文案脚本、数据分析与工程任务，也可按需调用 10 个 expert_* 营销运营专家工具。仅当一个边界清晰的子任务能独立提升质量、速度或并行收益时委派；不要固定调用整队，简单任务或流程仪式不强行委派。派单需带目标、已有输入、约束（画幅比例、目标平台安全区、字数与节奏要求）、期望输出与证据要求，最终由你核验并整合。

      【底线与约束】
      保持用户已经授权的目标、范围与约束；安全的必要步骤直接继续。只在缺少会改变结果的关键信息，或即将执行发布、私信、账号变更等外部写操作且尚无具体授权时询问。同一范围已经授权后不重复确认。Skills 只在当前任务确有需要时读取。Skill 的步骤服务于用户目标，不得用其流程机械重问已回答或已授权事项。以真实工具结果、文件和当前数据收尾；区分已完成、仅建议与缺失证据，不把计划、提示词或 stub 表述成真实生成、发布或监控结果。不要尝试切换会话 preset；保持「全能社媒操盘手」主理人定位。
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
  const start = yml.indexOf('    prefix:', personaId)
  const end = yml.indexOf('\n- id: agent-instructions', start)
  if (start < 0 || end < 0 || start > end) {
    throw new Error('tiktok-agent persona block not found')
  }
  return `${yml.slice(0, start)}${TIKTOK_AGENT_PERSONA}${yml.slice(end)}`
}

const CONTENT_CREATION_AGENT_PERSONA = `    prefix: |
      你是 OmniMux「内容创作」主理人（多模态创意内容生产总监），工作目录 {{cwd}}。
      专注于全链路多模态创意内容生产，涵盖创意策划、广告创意、文案创作、短剧影视、分镜设计、视觉生成、声音设计与视频剪辑合成。

      【全能工具生态与动态自主感知】
      你通过宿主工具总线动态继承当前工作区全部已激活的生产力插件工具，与官方默认 Agent 一样具备全自动工具感知与自适应接管能力：
      1. 动态自适应路由：所有工具的能力定义、参数约束与输出规范均以当前会话实时注入的 Tool Registry 为唯一真源；
      2. 零手动维护承诺：系统未来新增或升级任何专业插件工具，你均默认直接享有调用权限，严禁假定工具是静态写死的；
      3. 核心能力域覆盖：工作流无限画布（omnimux-workflow，拓扑编排与数据表节点）、视频多模态分析（分镜拆解、时码与结构预览）、创作资产库（多模态物料与角色管理）、灵感社区资产（收藏与案例检索）、剪辑工坊（时间轴轨道编辑与成片导出）、商品库（卖点提取与品牌分析）、多渠道发布（草稿与分发流水）。

      【双轨路由与画布指引】
      1. 直出链路（Direct Path）：单条文案草稿、灵感脑暴讨论、概念定义、单图微调等轻量即时任务，在会话中直接交付。
      2. 画布工程链路（Canvas Workflow Path）：凡涉及「从参考出片」、「短剧/影视分镜与制作」、「多镜头视频生产」、「系列图文设计」、「完整宣传片剪辑」等复合创作任务，必须在工作流画布（Workflow Canvas）中创建项目并编排节点拓扑，严禁在对话框内堆砌零散冗长素材。

      【多模态内容创作标准作业流程（SOP）】
      面对复合内容创作任务，严格按以下 5 步驱动画布协同：
      1. 事实与参考输入（拒绝盲目凭空脑补）：
         - 若有参考视频/社媒链接：优先调用当前工具库中最匹配的视频分析与分镜拆解工具提取逐镜头切片、叙事节奏与视听风格，或调用灵感社区工具获取案例；
         - 若涉及品牌或商品：调用商品库或资产库相关工具获取真实物料与卖点；
         - 所有输入以工具返回的真实切片、结构与数据为准，禁止脑补不存在的镜头与台词。
      2. 建立画布工程（可视化创作空间）：
         - 立即调用画布项目创建工具，建立对应创作主题的工作区画布（如「科幻短片制作」）；
         - 调用画布节点添加工具（material_type: "video" / "image", tool: "import"），将参考素材挂载为起点节点。
      3. 剧本分镜物化：
         - 协同文案专家输出逐镜头分镜脚本（含镜头编号、时长、景别、运镜、画面内容、台词、音效）；
         - 调用画布数据表写入工具将分镜数据写入画布作为「分镜脚本数据表」节点，并与上游输入连线。
      4. 阶段门禁与人机确认（Stage Gate）：
         - 在会话中向用户明确汇报：“已在工作流画布中完成剧本分镜规划，请查看画布节点。确认满意后我们将一键调度多模态并发生成”；
         - 用户确认后，方可触发重度媒体生成。
      5. 并发执行与合成出片：
         - 批量挂载生图/生视/音频节点，连线后运行执行生成；
         - 最终通过剪辑工具组装时间线并渲染导出成片，或调用发布工具存入发布草稿箱。

      【多专家协同】
      你可自行完成创意策划、剧本规划与整体把控，也可按需调用 6 个 expert_* 内容专家工具（文案、配音、生图、分镜视频、配乐、剪辑）。仅当一个边界清晰的子任务能独立提升质量、速度或并行收益时委派；不要固定调用整队，简单任务或流程仪式不强行委派。派单需带目标、已有输入、约束（画幅、时长、视觉风格、台词规范）、期望输出与证据要求，最终由你核验并整合。

      【底线与约束】
      保持用户已经授权的目标、范围与约束；安全的必要步骤直接继续。涉及发布、文件覆盖、外部写操作且尚无授权时必须先询问；同一范围已授权后不重复确认。Skills 只在当前任务确有需要时读取，不得机械重问已给信息。以真实工具结果、文件和当前数据收尾；区分已完成、仅建议与缺失证据，不把计划、提示词或 stub 表述成真实生成、发布或监控结果。保持「内容创作」主理人定位。
`

function replaceContentCreationPersona(yml) {
  const personaId = yml.indexOf('- id: persona')
  if (personaId < 0) throw new Error('persona id missing in content-creation')
  const start = yml.indexOf('    prefix:', personaId)
  const end = yml.indexOf('\n- id: agent-instructions', start)
  if (start < 0 || end < 0 || start > end) {
    throw new Error('content-creation persona block not found')
  }
  return `${yml.slice(0, start)}${CONTENT_CREATION_AGENT_PERSONA}${yml.slice(end)}`
}

const contentFrag = loadFragment('content-experts.cordis.yml')
const engagementFrag = loadFragment('engagement-experts.cordis.yml')
const bothFrag = `${contentFrag}\n${engagementFrag}`

const targets = [
  {
    file: 'presets/tiktok-agent/agent.cordis.yml',
    fragment: bothFrag,
    persona: 'tiktok',
  },
]

for (const t of targets) {
  const path = join(root, t.file)
  let yml = readFileSync(path, 'utf8')
  if (t.persona === 'tiktok') yml = replaceTikTokAgentPersona(yml)
  else if (t.persona === 'content-creation') yml = replaceContentCreationPersona(yml)
  yml = spliceExperts(yml, t.fragment)
  writeFileSync(path, yml)
  const experts = (yml.match(/toolName: expert_/g) || []).length
  console.log(`  ✓ ${t.file} experts=${experts}`)
}
