---
title: "GPT-6 Astra Agent 指令与工作流审计"
id: "evidence-astra-agent-guidance-audit"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-09-05"
authors: ["agent"]
subsystem: "global"
---

# GPT-6 Astra Agent 指令与工作流审计

任务：[#602](https://github.com/omnimux-ai/omnimux-dsh/issues/602)。审计基线：`a7c75eda255a00d8b5817b2095b2caa3d9a786e4`。本文记录这次核验，不是新的常驻指令或运行状态真源。

## 官方依据与适用范围

核对日期：2026-09-05。以下是官方建议与本项目应用的区分，不复制整段模型提示词，也不把更短的文件当作性能实测。

| 官方来源 | 本项目应用 |
| --- | --- |
| [GPT-6 Astra 模型指导](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra) | 清除冲突规则，延续目标和已取得的授权，先完成可审查工作；独立任务才委派，测试与改动相称 |
| [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | 根入口只留长期边界与发现路径；兼容文件不复制正文；作用域按目录，当前会话不会因文件保存自动重载全部指令 |
| [Codex Skills](https://learn.chatgpt.com/docs/build-skills) | 用精确的 name/description 触发；详细材料按需加载；识别软链接真源；产品分发技能与 Codex 原生技能分开 |
| [Codex Prompting](https://learn.chatgpt.com/docs/prompting) | 指定目标、上下文、约束和完成证据，不用固定人数、格式、重复确认来替代任务判断 |

项目保留的独立要求：人类真实支付、生产发布授权、Merge Queue、凭据边界、OpenReel 整包、模型合同离线核验、UI 的 L2/Dev/Electron 分层证据。它们不是 Astra 官方新增要求。

## 覆盖清单

- 根 `AGENTS.md`、三行 `CLAUDE.md` 兼容入口、两份 Agent Notes 嵌套 `AGENTS.md`；后两者的封存规则不改。
- 26 份受 Git 管理的仓库自有 `SKILL.md`，清单见下表；新增一个仓库交付工作流技能。
- 工程合同：Git/PR、Issue lifecycle、plugin QA、dev pipeline、ops entry、docs governance；三个 Issue 模板、文档索引、harness pin 的操作文字。
- 产品工作流：三个出厂 preset、两个专家片段及其生成器、两个本地专家团的角色/合同。保留工具标识和非 persona 配置。
- 核对 `package.json`、Quality Gate CI、worktree、auto-pipeline、CI verdict、静态 QA、browser/live QA、preset 生成与校验、文档 lint 和包白名单等实际入口；没有修改 CI 权限或自动合并判据。
- 市场索引含 300 条记录，其中 11 条 bundled。外部 Git 包仅确认来源/边界，不把未下载的外部内容算作已审计。
- 跟踪的 `.agents/skills/dsh-plugin-dev` 是外部共享源软链接；主工作区另有未跟踪/忽略的 `short-drama-router` 入口。它们及全局 `AGENTS.md` 不在本次写集。发现共享技能漂移时应回其真源确认维护，不在本仓库复制一份。
  - **后续更正（2026-10-27）**：上文记录的「跟踪外部共享源软链接」已被判定为缺陷。软链内容为仓外绝对路径（`/Users/x/Desktop/Project/OPC/资产库/skills/opc-skills-dsh-plugin-dev`），他人 clone 后必然断链。该条目已 `git rm --cached` 取消跟踪并写入 `.gitignore`，本地软链保留可用。新增 `scripts/verify-agents-skills-symlinks.mjs` 门禁阻止再次入库。原文保留以存证当时状态。
- 收尾时主工作区出现 `.agents/skills/tiktok-drama-center/` 七个文件的并发未提交删除。为保留其他工作，本 PR 排除该技能的文字优化，保持远端基线；未恢复、暂存或提交主工作区的删除。该技能仍计入已审计入口。

### 自有技能基线

`M/` = `plugins/omnimux-market/catalog/skills/`；每项路径末尾均为 `SKILL.md`。入口字节数不含尚未加载的 references。

| 路径 | 基线行数 | 基线 bytes |
| --- | ---: | ---: |
| `.agents/skills/omnimux-rc-upgrade/SKILL.md` | 105 | 5409 |
| `.agents/skills/tiktok-drama-center/SKILL.md` | 74 | 5070 |
| `plugins/omnimux-clip/skills/clip-craft/SKILL.md` | 57 | 3524 |
| `plugins/omnimux-market/catalog/experts/social-engagement-team/skills/social-engagement-ops/SKILL.md` | 43 | 1861 |
| `M/ad-creative/SKILL.md` | 173 | 8487 |
| `M/character-scene-storyboard/SKILL.md` | 348 | 21878 |
| `M/cinematic-motion-language/SKILL.md` | 224 | 11347 |
| `M/clip-export/SKILL.md` | 370 | 13785 |
| `M/content-creation-team/SKILL.md` | 15 | 603 |
| `M/content-creator/SKILL.md` | 8 | 296 |
| `M/content-strategy/SKILL.md` | 424 | 15626 |
| `M/dynamic-poster/SKILL.md` | 565 | 23114 |
| `M/ecommerce-image/SKILL.md` | 192 | 20701 |
| `M/esc-demo-note/SKILL.md` | 8 | 312 |
| `M/growth-hacker/SKILL.md` | 8 | 327 |
| `M/invest-analysis-team/SKILL.md` | 8 | 394 |
| `M/legal-consult-team/SKILL.md` | 8 | 413 |
| `M/mp-cover-design/SKILL.md` | 8 | 370 |
| `M/product-manager/SKILL.md` | 8 | 293 |
| `M/social-caption/SKILL.md` | 154 | 9350 |
| `M/software-dev-team/SKILL.md` | 8 | 298 |
| `M/stock-research/SKILL.md` | 8 | 334 |
| `M/tencent-wj/SKILL.md` | 8 | 291 |
| `M/web-access/SKILL.md` | 8 | 344 |
| `M/wecom-drive/SKILL.md` | 8 | 419 |
| `M/xiaohongshu-ops/SKILL.md` | 8 | 317 |

## 处置与规则归属

| 发现 | 处置 / 真源 |
| --- | --- |
| 根入口混合约束、全量目录、UI 手册和交付 SOP | 根保留硬边界与路径表；交付步骤在 [repo workflow](../../.agents/skills/omnimux-repo-workflow/SKILL.md)，领域细节仍在原合同 |
| 已授权交付仍要求用户建 Issue、补 PR 或再次审批同一动作 | 指令延续当前目标和明确授权；Agent 完成常规准备，只有尚缺授权的具体动作才询问；不扩大自动合并权限 |
| 全量测试、固定专家团、强制问卷和反复格式输出 | 按风险/改动选检查，成功证据不无条件重跑；简单任务直接完成，委派提供明确输入输出与责任 |
| 产品技能一次加载长食谱，另含过时工具/路径、忽略图像验收、内容拦截绕行建议 | 保留短入口、适用边界和路由；将有用食谱拆为本技能 references，去掉冲突/绕行指令，校验安装后的路径 |
| pre-merge L2、共享 Dev 和 Electron 验收混用 | [plugin QA](../contracts/plugin-qa.md) 与 [dev pipeline](../contracts/dev-pipeline.md) 区分环境、授权和真实证据；文档改动不要求 App 物化 |
| Issue 模板 fenced YAML 不符合实际解析器 | 模板元数据对齐 `parseFrontmatter` 实际支持的格式；明确普通文档流程与无人值守自动流程不同 |
| RC helper 对缺失安装树输出成功 | 删除无其他调用方的旧 helper；RC skill 明确记录 Host/profile 物理证据，任何 unavailable/missing 都不能验收；保留品牌测试与四表面验收 |
| 技能/全局文件所有权混淆 | 只改仓库自有源；保留 CLAUDE 指针与外部软链接，产品 catalog 不冒充 Codex 全局配置 |

RC helper 的离线复现：读取基线脚本，仅将 ROOT 指向当前任务树并将 Host/source/profile/desktop 路径全部设为不存在的隔离路径，仍得到 `host=None`、`copies=['none']`、`PASS mechanical RC contracts`，退出码 0。这个结果证明旧检查器漏检，不是 RC 或 App 验收。被删文件可从 Git 历史恢复。

## AGENTS 结构评分

方法：`agents-md` 的 C1–C10；P = 清晰可执行，W = 弱或有证据缺口，M = 已触发却缺失，N/A = 不适用。评分只评价指令结构，不是模型性能分数。

| 项 | 基线 | 修改后 |
| --- | --- | --- |
| C1 路径/职责图 | P | P |
| C2 常驻内容只留难推断边界 | W | P |
| C3 窄验证阶梯与真实命令 | W | P |
| C4 单一规则归属 | W | P |
| C5 绑定具体路径/符号 | P | P |
| C6 非显然误操作边界 | P | P |
| C7 核心/一般改动的风险分层 | P | P |
| C8 不把空检查或替代物当成功 | W | W（运行时后续项见下） |
| C9 秘密与信任边界 | P | P |
| C10 入口与按需资料分离 | W | P |

启用 F1/F2/F3/F4/F5/F6/F9/F12/F13/F14：地图、验证、陷阱、真源、包/状态/鉴权边界、变更矩阵、多树和交付流程。F7/F8/F10/F16 的具体接口、失败语义、风险矩阵和日志约束路由到现有合同；F11 本仓库没有数据库迁移任务，不新增数据库规则；F15 保留本项目独有的完整 OpenReel 和模型合同边界。未创建新的规则预算硬门禁。

## 运行时后续项

以下是本次离线核实而未改变其运行逻辑的问题，不能用文档更新宣称修复：

| 跟踪 | 已核对的触发与证据 | 修复边界 |
| --- | --- | --- |
| [#606 授权与执行状态分离](https://github.com/omnimux-ai/omnimux-dsh/issues/606) | `auto-pipeline.mjs:485` 的正常迁移移除 ready 标签；`:895` 重检仍调用要求 ready 的 `assessAuthorization`。直接导入当前函数：合法初始状态 eligible=true，改为 auto-merge-pending 后 eligible=false、revoked=false | 回归覆盖真实状态迁移、再读取、撤销和风险升级；不扩大自动合并权限 |
| [#605 CI 证据聚合](https://github.com/omnimux-ai/omnimux-dsh/issues/605) | `quality-gate.yml:126` 只接入 L0；直接导入 `ci-verdict.mjs` 的 `evaluateVerdict({pass:true},null)` 返回 pass=true，加 requireBrowser:true 才失败。隔离 main 的外部 I/O 也捕获默认授标请求 | 按变更面聚合适用报告，绑定 SHA/环境，不把非 UI 任务强制变成 UI 任务 |

直接导入所需的 esbuild/pngjs 来自主工作区的已安装依赖，通过任务树的临时 node_modules 链接读取。以上没有真实 GitHub 授标/自动合入，也没有运行 App 或模型；完整远程链路未复现。CI 仍有测试、模型合同和构建步骤，不能概括为“CI 没测试”。

较低优先级的现有工具差距包括 doctor 的旧默认 profile、流水线超时/续作与日志表述、重复测试入口及动态依赖安装。它们未在本次改动；合同明确其证据能力边界。

## 验证与性能边界

### 入口体积

| 入口 | 基线 | 修改后 | 变化 |
| --- | ---: | ---: | --- |
| 根 `AGENTS.md` | 146 行 / 20574 bytes | 58 行 / 7095 bytes | bytes 减少 65.5% |
| 全部自有 `SKILL.md` | 26 份，2848 行 / 145163 bytes | 27 份，928 行 / 60336 bytes | 含新增 workflow，bytes 减少 58.4%；每份不超过 100 行 |
| content preset 的 persona 文本 | 12841 bytes | 5194 bytes | 保留角色、工具与非 persona 配置 |
| engagement preset 的 persona 文本 | 10597 bytes | 3744 bytes | 保留角色、工具与非 persona 配置 |
| standard preset 的 persona 文本 | 22894 bytes | 7644 bytes | 保留角色、工具与非 persona 配置 |

根文件的基线来自上述 Git SHA；用户在主工作区已有的 78 行草稿也已保留并整合，不当成 146 行 Git 基线。技能指标只统计入口，不含按需 references；preset 指标按 YAML 解析后的 persona 字符串统计，包含可选专家，不等于每轮实际注入量。

### 实际验证

所有命令均在本次集成 worktree 执行。测试只读取主工作区已有的声明依赖；没有安装到真实 App/profile。

| 检查 | 命令 / 方法 | 结果 |
| --- | --- | --- |
| preset 生成与一致性 | `node scripts/build-agent-presets.mjs`；`node --test scripts/verify-agent-presets.test.mjs` | 7/7 通过；三个生成文件已同步 |
| catalog / 安装 / 召集 | `node --test plugins/omnimux-market/src/expert/catalog.test.js plugins/omnimux-market/src/expert/install.test.js plugins/omnimux-market/src/expert/summon.test.js` | 28/28 通过 |
| pipeline / 跟踪产物 | `node --test scripts/auto-pipeline.test.mjs scripts/check-tracked-artifacts.test.mjs` | 16/16 通过；不意味着下述已复现缺陷已修复 |
| CI / browser / live 门禁单测 | `node --test scripts/verify-ci-gates.test.mjs scripts/ego-browser-qa.test.mjs scripts/live-qa.test.mjs scripts/codex-browser-qa.test.mjs scripts/live-runtime-proof.test.mjs` | 58/58 通过；没有以探针拒绝 fixture 冒充 App 验收 |
| 静态 L0 | `node scripts/auto-qa-gate.mjs . --diff --base origin/main --json` | pass；77 个改动路径，其中 1 个 JS 文件被此检查扫描；不等于浏览器/运行时证明 |
| 指令结构与配置保护 | YAML 解析、实际本地链接检查、`node --check scripts/build-agent-presets.mjs` | 27 个技能 name/description 合法且不重复；118 个本地链接可解析；5 份 preset/fragment 非 persona 配置、12 个角色除 description 外的 frontmatter 不变 |
| Issue 模板 | 将三个模板实际提交的 Issue body 交给当前 `parseFrontmatter` | 3/3 可解析；风险与插件字段保留，默认不授予无人值守合并权限 |
| 海报简报样例 | 从实际模板构造输入，执行 `validate_poster_brief.py` | 完整样例 exit 0；缺少 Brand Colors 的负例 exit 1；不代表生成质量验证 |
| 打包后真实技能安装 | `npm pack --ignore-scripts`；解包后调用包内 `installItem` 到隔离目录 | 11 个 bundled 包可安装；91 个文件字节一致；24 个引用有效，含全部 5 份新增 references；重复安装正确返回 already |
| 全仓文档 lint | `node scripts/doc-lint.mjs`，与同一 Git 基线比较 | exit 1：226 errors / 23 warnings；新增错误 0，属于既有债务，不宣称全仓 lint 通过 |
| 补丁格式与语义验收 | `git diff --check`；独立最终审查与修正后点验 | 通过；未发现本次修改遗留的已知阻断缺陷 |

上述 Node 测试共 109 项通过。包安装 smoke 使用包内代码与白名单产物，但刻意跳过生命周期脚本：它验证本次指令/引用分发，不是产品重建或 App 激活。门禁测试产生的拒绝报告已删除；测试用依赖链接、临时包与简报将在合并收尾时清理。

### 语义回归场景

| 用户意图 / 状态 | 修改后保留的行为 |
| --- | --- |
| 已授权 push/PR，尚未授权 merge | 可以完成 push/PR，停在具体的 merge 授权边界 |
| 当前任务已明确授权合并 | 复用该授权，仍须满足实际检查与 Merge Queue，不伪造无人值守授权 |
| 只要文案、方案或提示词 | 可直接交付所需文本，不强迫生成、物化 App 或组织专家团 |
| 已要求生成且工具可用 | 执行对应生成并验证产物，不因“先有工具结果”形成循环等待；真实充值/付款仍由人类完成 |
| 日常开发或缺少指定生产目标的授权 | 不加 `--prod` / `--all`，不写入生产 profile |
| RC 安装树、品牌或冷启动证据缺失 | 报告真实缺口，不把 missing/空检查判为通过 |

这些是文本、配置和代码路径的离线复核，未执行 Astra 真实任务 A/B 评测。没有模型配置变更、真实模型请求、耗时或任务成功率数据；不宣称“性能已最大化”。产品 preset/技能未安装进现有 App；Codex 指令变更应在新会话核验是否被正确加载。

## 本次文件清单

共 77 个仓库路径。下面是审计写集，不是新的导航/规则源；`check-rc-contracts.py` 为删除，其余为新增或更新。

```text
.agents/skills/omnimux-rc-upgrade/SKILL.md
.agents/skills/omnimux-rc-upgrade/scripts/check-rc-contracts.py
.agents/skills/omnimux-repo-workflow/SKILL.md
.github/ISSUE_TEMPLATE/01_feature.md
.github/ISSUE_TEMPLATE/02_bug_or_hotfix.md
.github/ISSUE_TEMPLATE/03_dynamic_plugin.md
AGENTS.md
docs/README.md
docs/contracts/agent-issue-lifecycle.md
docs/contracts/dev-pipeline.md
docs/contracts/docs-governance-standard.md
docs/contracts/ops-entry.md
docs/contracts/plugin-git-pr.md
docs/contracts/plugin-qa.md
docs/evidence/2026-09-05-astra-agent-guidance-audit.md
docs/evidence/README.md
docs/harness-pin.md
plugins/omnimux-clip/skills/clip-craft/SKILL.md
plugins/omnimux-market/catalog/experts/social-content-team/README.md
plugins/omnimux-market/catalog/experts/social-content-team/agents/content-copywriter.md
plugins/omnimux-market/catalog/experts/social-content-team/agents/editing-agent.md
plugins/omnimux-market/catalog/experts/social-content-team/agents/image-agent.md
plugins/omnimux-market/catalog/experts/social-content-team/agents/music-agent.md
plugins/omnimux-market/catalog/experts/social-content-team/agents/social-content-team-lead.md
plugins/omnimux-market/catalog/experts/social-content-team/agents/speech-agent.md
plugins/omnimux-market/catalog/experts/social-content-team/agents/video-agent.md
plugins/omnimux-market/catalog/experts/social-content-team/contracts/anti-loop.md
plugins/omnimux-market/catalog/experts/social-content-team/contracts/canvas-discipline.md
plugins/omnimux-market/catalog/experts/social-content-team/contracts/character-ref-guard.md
plugins/omnimux-market/catalog/experts/social-content-team/contracts/output-format.md
plugins/omnimux-market/catalog/experts/social-engagement-team/README.md
plugins/omnimux-market/catalog/experts/social-engagement-team/agents/ai-comment-specialist.md
plugins/omnimux-market/catalog/experts/social-engagement-team/agents/brand-monitor.md
plugins/omnimux-market/catalog/experts/social-engagement-team/agents/interaction-automator.md
plugins/omnimux-market/catalog/experts/social-engagement-team/agents/signal-miner.md
plugins/omnimux-market/catalog/experts/social-engagement-team/agents/social-engagement-team-lead.md
plugins/omnimux-market/catalog/experts/social-engagement-team/skills/social-engagement-ops/SKILL.md
plugins/omnimux-market/catalog/experts/social-engagement-team/skills/social-engagement-ops/references/ai-comment-strategy.md
plugins/omnimux-market/catalog/experts/social-engagement-team/skills/social-engagement-ops/references/brand-monitoring-framework.md
plugins/omnimux-market/catalog/experts/social-engagement-team/skills/social-engagement-ops/references/interaction-automation-guide.md
plugins/omnimux-market/catalog/experts/social-engagement-team/skills/social-engagement-ops/references/social-data-crawling.md
plugins/omnimux-market/catalog/skills/ad-creative/SKILL.md
plugins/omnimux-market/catalog/skills/character-scene-storyboard/SKILL.md
plugins/omnimux-market/catalog/skills/character-scene-storyboard/references/brief-template.md
plugins/omnimux-market/catalog/skills/character-scene-storyboard/references/prompt-template.md
plugins/omnimux-market/catalog/skills/cinematic-motion-language/SKILL.md
plugins/omnimux-market/catalog/skills/cinematic-motion-language/references/vocabulary.md
plugins/omnimux-market/catalog/skills/clip-export/SKILL.md
plugins/omnimux-market/catalog/skills/clip-export/references/api-recipes.md
plugins/omnimux-market/catalog/skills/clip-export/references/full_feature_showcase.py
plugins/omnimux-market/catalog/skills/content-creation-team/SKILL.md
plugins/omnimux-market/catalog/skills/content-creator/SKILL.md
plugins/omnimux-market/catalog/skills/content-strategy/SKILL.md
plugins/omnimux-market/catalog/skills/content-strategy/references/framework.md
plugins/omnimux-market/catalog/skills/dynamic-poster/SKILL.md
plugins/omnimux-market/catalog/skills/dynamic-poster/references/anti-patterns.md
plugins/omnimux-market/catalog/skills/dynamic-poster/references/creative-dimensions.md
plugins/omnimux-market/catalog/skills/dynamic-poster/references/storyboard-rules.md
plugins/omnimux-market/catalog/skills/dynamic-poster/references/video-motion-prompt-guide.md
plugins/omnimux-market/catalog/skills/dynamic-poster/references/workflow-recipes.md
plugins/omnimux-market/catalog/skills/ecommerce-image/SKILL.md
plugins/omnimux-market/catalog/skills/ecommerce-image/references/categories/12-footwear.md
plugins/omnimux-market/catalog/skills/ecommerce-image/references/categories/13-bags.md
plugins/omnimux-market/catalog/skills/ecommerce-image/references/workflow.md
plugins/omnimux-market/catalog/skills/product-manager/SKILL.md
plugins/omnimux-market/catalog/skills/social-caption/SKILL.md
plugins/omnimux-market/catalog/skills/software-dev-team/SKILL.md
plugins/omnimux-market/catalog/skills/tencent-wj/SKILL.md
plugins/omnimux-market/catalog/skills/wecom-drive/SKILL.md
presets/README.md
presets/fragments/README.md
presets/fragments/content-experts.cordis.yml
presets/fragments/engagement-experts.cordis.yml
presets/social-content-team/agent.cordis.yml
presets/social-engagement-team/agent.cordis.yml
presets/standard/agent.cordis.yml
scripts/build-agent-presets.mjs
```
