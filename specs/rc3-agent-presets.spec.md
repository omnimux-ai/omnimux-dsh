# rc.3 预设迁移：专家人设、失效引用与 sync 脚本

## 问题

内核 pin 已是 `dsh@0.2.1-rc.3`（[harness-pin](../docs/harness-pin.md)，2026-10-25），但 `presets/` 仍是 0.1.x「目录发现」时代的写法。升级后的直接后果（2026-11-01 在真机 Dev 包复现）：

- 新建会话失败：`agent-preset/not-found: Unknown agent preset: omni-agent` —— rc.3 取消了 `agent-presets` 行的 `roots` 目录发现，`@deepseek-ai/dsh-agent-presets` 也不再随包发布，产品预设没有任何装载声明。
- 设置 → 插件页整片报错：`tool-subagent: persona is no longer supported; configure persona and tool plugins in an Agent Preset and select it with agentPreset` —— rc.3 的 `tool-subagent` 对 `persona`/`toolFilter` 直接抛错，一个抛错行会带崩整份预设。
- `scripts/sync-agent-presets.sh` 每次 sync 仍把已不存在的 `agent-presets` 行（含 `roots`/`includeUserRoot`）写回 profile patch，并物化到 `~/.omnimux-dev/agent-presets-shipped`（rc.3 无人读取）。

壳侧已在 omnimux-desktop-fork PR #136 做了兼容层兜底（运行期把 `preset/agent-presets` 声明成 Loader 行，并剔除不可解析包 / 摘除 `persona`），保证 Dev 可用；但真源必须回到产品树，否则专家人设永久失效、兜底会掩盖后续漂移。

## 事实基线（2026-11-01 采样）

| 项 | 数据 |
|---|---|
| 待迁 `persona` 块 | 62 处，集中在 7 个预设：`ad-creative-agent 6 / drama-agent 6 / marketing-agent 10 / marketing-growth-team 4 / media-creator 13 / omni-agent 10 / tiktok-agent 13` |
| `tool-subagent` 行 | 87 处（7 个预设），`toolName` 去重后每预设 4~17 个 |
| 引用内核包 | 24 个 `@deepseek-ai/*`，rc.3 缺失 1 个：`@deepseek-ai/dsh-workflow-worker-thread`（10 个预设各 1 行） |
| 专家预设可行性 | `@deepseek-ai/dsh-subagent-spawn-in-process` 声明 `capabilities.agentPreset: true`，spawn 路径支持独立预设 |
| 预设文件是生成物 | `presets/*/agent.cordis.yml` 的专家段由 `scripts/build-agent-presets.mjs` 从 `presets/fragments/*.cordis.yml` 拼接；W1 必须改 fragments，改 agent.cordis.yml 会被重建覆盖 |
| 预设白名单 | `presets/manifest.json` 的 `shippedPresets` 是打包白名单（门禁用 `deepEqual` 校验 id 顺序），新增专家预设必须登记，否则不进包 |
| 门禁断言 | `scripts/verify-agent-presets.test.mjs` 对每个 alias 要求：存在 `preset.yml`/`agent.cordis.yml`、含 `prefix: |`、不含 `text: |`、含 `sampleOverCapGlobResults: false`、含 `provider: spawn`；另有 legacy alias 列表与 `sync-agent-presets.sh` 的 `KEEP=(...)` 数组断言 |
| 预设自带技能 | 3 个预设共 6 个技能目录（`cordis 2 / omni-agent 2 / tiktok-agent 2`）；rc.3 壳侧 `seedPresetSkills` 只读 `preset/skills`（插件技能），不读 `preset/agent-presets/<id>/skills` |

## 方案

四个工作项，建议按 PR 顺序落地。

| # | 工作项 | 优先级 | 必要性 | 影响面 | 风险/代价 | 难度 |
|---|---|---|---|---|---|---|
| W1 | 专家 `persona` → 独立 Agent Preset，`tool-subagent` 改用 `agentPreset` | P0 | 不做则专家子代理无角色 | 7 预设 / 62 人设 / 87 行 | 行数多，需逐个人设校验 | 中 |
| W2 | 删除 rc.3 不存在的插件引用（`dsh-workflow-worker-thread`） | P0 | 不删则该行抛错，整份预设加载失败 | 10 预设各 1 行 | 低（需确认能力去向） | 低 |
| W3 | 退役/改造 `scripts/sync-agent-presets.sh` | P1 | 不改造则每次 sync 复活死配置 | 1 脚本 + 2 处 home 目录 | 中（影响 sync 流程） | 中 |
| W4 | 预设 `skills/` 归属 | P2 | 不做则 6 个技能在 rc.3 静默丢失 | 3 预设 / 6 技能 | 低 | 低 |

### W1 专家人设迁成 Agent Preset

目标形态（rc.3 语义：一个专家 = 一个预设 + 一个挂载行）：

```yaml
# presets/<preset>/agent.cordis.yml —— 改造前
- id: tool-subagent-expert-content-copywriter
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: expert_content_copywriter
    persona: |
      你是全网社媒文案专员可可（Copy）……

# 改造后：人设搬进独立预设，挂载行只留引用
- id: tool-subagent-expert-content-copywriter
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: expert_content_copywriter
    agentPreset: expert-content-copywriter
    allowedAgentPresets: [expert-content-copywriter]
```

```yaml
# 新增 presets/expert-content-copywriter/agent.cordis.yml
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    prefix: |
      你是全网社媒文案专员可可（Copy）……
- id: agent-instructions
  name: '@deepseek-ai/dsh-agent-instructions'
  config: { maxBytes: 65536 }
- id: tool-fs
  name: '@deepseek-ai/dsh-tool-fs'
# …按 persona 描述补齐该专家实际需要的工具行
```

步骤：

1. 抽取全部 `persona:` 块（源文件是 `presets/fragments/*.cordis.yml`，不是 agent.cordis.yml），建立 `toolName → persona 文本 → 目标预设 id` 映射（62 条）。
2. 每个专家生成一个预设目录，`plugins:` = `persona` + `agent-instructions` + 该专家实际需要的工具行（从同预设的通用 subagent 行复制后裁剪）。
3. 原预设的专家行删 `persona`，加 `agentPreset`；`agentPreset` 必须同时出现在 `allowedAgentPresets` 里，否则报 `agentPreset must be included in allowedAgentPresets`。
4. 分批落地：先 `omni-agent`（源在 fragments：content 6 + engagement 4），再 `tiktok-agent`(13)/`ad-creative-agent`(6)（同源 fragments），最后 3 个内联预设 `drama-agent`(6)/`marketing-growth-team`(4)/`media-creator`(13)（这些不在 fragments 生成链上，直接改文件）。
5. 新增的专家预设目录要登记进 `presets/manifest.json` 的 `shippedPresets`；同时 `scripts/sync-agent-presets.sh` 的 `KEEP`/legacy alias 逻辑与门禁测试需要同步评估（注意：测试文件改动受 `.dsh` anti-cheat 守卫约束，按 spec 声明的旧标准变更通道走，不能静默削弱）。

### W2 失效引用

删除 `@deepseek-ai/dsh-workflow-worker-thread` 行（10 处，位于 agent.cordis.yml 的非生成段，`node scripts/build-agent-presets.mjs` 重建后仍是 0 处）。能力去向需产品确认：rc.3 相邻包为 `@deepseek-ai/dsh-workflow`、`dsh-workflow-ptc`、`dsh-client-ui-workflow-run`；若原行提供「工作流后台线程执行」，评估挂 `dsh-workflow` 的对应服务，否则删除。

### W3 `sync-agent-presets.sh`

- 推荐 A：退役该脚本，预设由打包期 `preset/agent-presets` + 壳侧声明承担；脚本改为一致性校验（不写盘）。
- 备选 B：保留写盘，但改为写 rc.3 合法的声明行，不再写 `agent-presets.roots`。

### W4 预设技能

6 个技能目录二选一：迁到对应产品插件的 `skills/`（推荐，随插件版本走），或挂 `@deepseek-ai/dsh-skill-filesystem` 的 `customSkillDirs` 指向预设目录。

## 验收

- **仓内预设门禁**：`node scripts/build-agent-presets.mjs`（幂等，专家段重建后只剩预期 diff）+ `node --test scripts/verify-agent-presets.test.mjs`（当前 18/18 通过）。
- **静态**：`node scripts/verify-agent-preset-rows.mjs`（fork 侧同构脚本）在迁移后输出 `0 package row(s) dropped`；产品树侧等价校验需覆盖「无 `persona` 配置块残留」「无 rc.3 缺失包引用」。
- **组合**：用真实 home 副本跑壳侧 `prepareDesktopProfile`，断言 12 个 `omnimux-preset-*` 行、无重复 id、无 `persona`；迁移完成后应改为**构建期失败**而非运行期裁剪（去掉兜底分支）。
- **真机**：Dev 包 → 设置 → 插件页每个预设「加载成功」；逐预设新建会话发「你是谁」，回答体现对应人设；`agent-preset/not-found` 与 `persona is no longer supported` 两类报错归零。
- **sync**：`bash scripts/omnimux.mjs sync` 后 `~/.omnimux-dev/profiles/omnimux/cordis.patch.yml` 内 `agent-presets` 行为 0。
- **技能**：`~/.omnimux-dev/skills` 下出现迁移的 6 个技能且带 origin 标记。

## 未决问题

1. `dsh-workflow-worker-thread` 的能力在 rc.3 由谁承接（删之前需产品确认）？
2. 62 个专家独立成预设后 `allowedAgentPresets` 会很长，是否按业务预设分组控制可见面？
3. 专家预设 id 命名（建议 `expert-<toolName 去下划线>`）需与前端 `omni-agent-presets` 展示名/i18n 对齐。

## W1 实施记录（第一批：fragments 生成链）

**范围**：`omni-agent`(content 6 + engagement 4)、`tiktok-agent`(13)、`ad-creative-agent`(6) —— 共 29 个专家，源文件是 `presets/fragments/*.cordis.yml`。`drama-agent`/`marketing-growth-team`/`media-creator` 的专家行是内联的，留第二批。

**做法**：扩展 `scripts/build-agent-presets.mjs`，在拼接专家段时同步做两件事：
1. 把每个专家行的内联 `persona:` 换成 `agentPreset: expert-<toolName>` + `allowedAgentPresets: [同一个 id]`；
2. 为每个专家生成 `presets/expert-<toolName>/`（`preset.yml` + `agent.cordis.yml`），插件行复用 `plugins/omnimux-market/src/expert-presets.ts` 里 `agentPresetCordis()` 的同一套模板（persona + agent-instructions + bash/pwsh + fs + fs-search + subagent + subagent-fork）。

**有意的取舍**：
- 专家预设**不登记** `presets/manifest.json` 的 `shippedPresets`：那是 8 个可被用户直接选择的发布预设白名单，门禁用 `deepEqual` 锁顺序；专家预设只作为 `agentPreset` 目标的内部预设存在。
- `agentPresetCordis()` 的模板在 `.mjs` 里复制了一份（构建脚本无法 import TS）。去重（抽公共模块）列为后续项。
- 生成物 = `presets/expert-*/`，与 `presets/*/agent.cordis.yml` 的专家段一样由构建脚本产出，**必须提交**，否则打包缺失。

**已知影响（待产品拍板）**：壳侧会把 `preset/agent-presets` 下所有目录声明成预设行，所以 29 个专家预设会出现在预设选择器里。是否需要在 UI 侧隐藏「仅内部使用」的预设，属未决问题 2。

**验收**：见下方「验收」章节；另外新增 `node scripts/build-agent-presets.mjs` 两次运行产物一致（幂等）。
