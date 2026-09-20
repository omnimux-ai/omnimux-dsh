---
title: "执行层优先路线：用官方 workflow 编排 + 自研画布生产"
id: "omnimux-recipes-execution-first"
type: "spec"
status: "draft"
authority: "L2"
date: "2026-09-20"
subsystem: "recipe-production"
related:
  - "2026-09-20-omnimux-recipes-prd.md"
---

# 执行层优先路线

> 上游文档：[配方库 PRD](2026-09-20-omnimux-recipes-prd.md)。本文只回答一个问题：**先做 workflow 执行层、页面后置，以及"每次运行全新上下文 + 独立 Agent 执行"如何落地。**

## 一、结论

| 老板的问题 | 结论 |
| :--- | :--- |
| 是否先做 workflow，页面后置？ | ✅ **成立**，页面推到 S6 |
| 出片怎么验收？ | ✅ **三关递进**：分镜脚本 → 角色分镜图 → 成片，见 §六、§七。**分镜脚本是最核心的交付物** |
| workflow 是不是最轻？ | ✅ 更轻——**不需要新建插件**，编排能力官方已内置且在 OmniMux 已启用 |
| 如何让每次运行在全新上下文？ | ✅ 官方三档现成机制，见 §四 |
| 我只管 workflow 设计/运行，执行交独立 Agent？ | ✅ 官方 `workflow` 工具就是这个语义，见 §三 |
| 是否要自研 agent 编排？ | ❌ **绝对不要**，那是在重造官方已交付的轮子 |

**一句话**：这一轮不是"要不要自研编排层"的问题，而是"**识别出编排层已经白送，把力气全部投到生产层和变量池**"。

---

## 二、官方能力实证盘点（实读，非记忆）

来源：本地 clone 的 `deepseek-harness` @ `dd6322d604`（即 harness pin 记录的版本）。

| 能力 | 包 | 注册点 | 装配位置 |
| :--- | :--- | :--- | :--- |
| 脚本编排服务 | `@deepseek-ai/dsh-workflow` | `ctx.workflowEngine` | 服务定义 |
| worker thread 引擎 | `@deepseek-ai/dsh-workflow-worker-thread` | 实现上述服务 | `base/cordis.patch.yml:379` |
| `workflow` 工具 | `@deepseek-ai/dsh-tool-workflow` | `ctx.tools` | `base/cordis.patch.yml:384` |
| `ralph` 工具 | `@deepseek-ai/dsh-tool-ralph` | `ctx.tools` | `base/cordis.patch.yml:422`（`maxRounds: 64`） |
| 委托服务 | `@deepseek-ai/dsh-subagent` | `ctx.subagents` | `base/cordis.patch.yml:334` |
| 全新子代理 provider | `@deepseek-ai/dsh-subagent-spawn-in-process` | `providerName: spawn` | `base/cordis.patch.yml:337` |
| fork 子代理 provider | `@deepseek-ai/dsh-subagent-fork-in-process` | `providerName: fork` | `base/cordis.patch.yml:342` |
| 委托工具 | `@deepseek-ai/dsh-tool-subagent` | `toolName: subagent`，`backgroundMode: continuable` | `base/cordis.patch.yml:355` |
| fork 工具 | `@deepseek-ai/dsh-tool-subagent` | `toolName: subagent_fork`，`one-shot` | `base/cordis.patch.yml:368` |
| 子代理控制 | `@deepseek-ai/dsh-tool-subagent-control` | `send_message` / `interrupt_agent` / `list_agents` | `base/cordis.patch.yml:349` |

**关键事实**：OmniMux profile（`~/.dsh/profiles/omnimux/package.json`）的 `dsh.profile.bundles` 第一层就是 `@deepseek-ai/dsh-base`。**上表全部能力在当前 OmniMux 里已经启用**，无需任何新增装配。

### 与 x.ai Workflows 的机制对照

| x.ai 机制 | DSH 对等物 |
| :--- | :--- |
| 自然语言 → 规划成编排脚本 | `workflow` 工具：模型提交 `{ meta, script, args }` |
| 扇出数百并行 agent | 脚本钩子 `agent()` + `parallel()` + `pipeline()` |
| 每个 agent 干净上下文 | `subagent` 的 `spawn` provider（fresh child） |
| 主会话保持空闲 | 脚本跑在独立 **worker thread**，父回合阻塞但只拿终局 |
| 阶段（phases） | `phase()` / `log()` + `meta.phases` |
| 128 / 1024 agent 预算 | `maxTotalAgents`（per-run 上限） |
| 独立验证者对抗核实 | 脚本自行编排（多轮 agent + 校验环节） |
| 只回汇总，不回中间过程 | 「the model sees one final outcome, never intermediate child messages」 |
| 存盘复用成 slash command | `meta.name` 作为持久化键，可固化为可复用工作流 |

---

## 三、必须先讲清的坑：两个 "workflow" 是两个层

产品里存在两个同名的东西，混为一谈会导致「要不要自研 agent 编排」的伪命题。

| 维度 | 官方 `dsh-workflow`（脚本编排） | `omnimux-workflow`（自研画布） |
| :--- | :--- | :--- |
| 形态 | 模型写的纯 JS 脚本 | 可视化 DAG 画布 |
| 节点语义 | **子代理** | **媒体生成 / 素材** |
| 产物 | 结构化 JSON / 文本 | 视频、图片、音频 |
| 执行体 | worker thread | `ExecutionScheduler`（无头可跑） |
| 隔离边界 | 每 run 一个 worker | 进程内调度 + 超时/恢复 |
| **定位** | **脑力编排层** | **生产执行层** |
| Agent 工具 | `workflow` / `ralph` | `workflow_run` / `workflow_snapshot` / `workflow_create` / `workflow_node_add` 等 |

**两层拼起来才是老板要的链路**：

```
对话入口
  → 官方 workflow 脚本（出配方、编排分工）
    → 每个子代理调 omnimux-workflow 的 workflow_run 工具
      → 画布执行媒体生成
        → 产物 + 配方指纹落盘
```

`omnimux-workflow` 的 Agent 工具已齐备（`workflow_run` 支持 `wait` / 立即返回 executionId、`mode` 三档、按节点返回状态与媒体路径）——「Agent 基于 workflow 调工具完成生产」**已可用，不是待建能力**。

---

## 四、全新上下文的四档机制

| 机制 | 上下文起点 | 适用 |
| :--- | :--- | :--- |
| `workflow` 脚本内 `agent()` | **全新，无对话种子** | 批量并行、一次性任务 ← **本方案主力** |
| `subagent` 工具（`spawn` + `continuable`） | **全新**，且可后续续聊多轮 | 需要跟进追问的任务 |
| `subagent_fork` 工具（`fork`，one-shot） | **继承父已完成历史** | 子任务需要父已读到的上下文 |
| `ralph` 工具 | **每轮全新**，只带上一轮有界结构化报告 | 迭代逼近一个不变目标 |

### 重要设计推论

「全新上下文」不是限制，而是**强制显式传参**的纪律：

- 子代理**看不到**父会话里读过的商品资料、PRD、历史讨论。
- 所以商品信息、角色定义、Hook 约束**必须作为脚本 `args` 显式传下去**，不能指望继承。
- 这正好满足"可追溯"要求——每条素材的输入是完整、封闭、可复现的。

### 随机性从哪来（这是老板最关心的"千篇一律"问题）

| 原则 | 做法 |
| :--- | :--- |
| 脚本必须**确定性** | 固化脚本不含随机源，保证可归因、可复现 |
| 随机性来自 **seed** | `args` 传入 seed；脚本内用确定性 PRNG 从池子抽样 |
| 同脚本 + 同 seed | 完全相同的配方集（可复现、可回放） |
| 同脚本 + 异 seed | 不同组合（避免千篇一律） |
| 记录 | seed + 配方指纹随产物落盘 |

> ⚠️ **需核实**：DSH 的 workflow 引擎对 `Math.random` / `Date.now` 是否有限制（WorkBuddy 侧的 Dynamic Workflow 沙箱已知禁用，DSH 的 `workflow-worker-thread` 未验证）。**无论如何本方案都要求确定性 PRNG**，不使用平台随机源——这条不依赖核实结果。

---

## 五、实读发现的缺口

| # | 缺口 | 证据 | 严重度 | 应对 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | 画布节点只有媒体类 | `nodeExecutors.ts` 的 `resolveExecutorKey` 仅返回 `material:import` / `material:generate` | 🔴 | **配方与脚本生成放编排层（脚本 + agent），不进画布**。画布只做媒体生产 |
| 2 | 配方池（人设 / Hook 枚举）尚未物理化 | PRD 附录 A 仍是设计态挂载关系 | 🔴 | ✅ **S0 已解决**：`scripts/workflows/pools/` 四个池子文件 |
| 3 | agent 预算未测算 | `ralph` 默认 `maxRounds: 64`；`workflow` 有 `maxTotalAgents` | 🟡 | 仍需测算「角色数 × 条数 × 环节数」是否会触顶 |
| 4 | 生产图模板存量 | `TemplateStore` 已可存取（`templateSchema.ts`） | 🟢 | 已有能力，S3 直接用 |
| 5 | 画布直连剪辑 | D6 已定首期不含剪辑 | 🔵 | 暂不阻塞 |

缺口 1 是本方案的关键设计约束：**编排层产配方、生产层产画面，两层职责不越界**。若把"写脚本"塞进画布，就得给画布新增 LLM 节点执行器——那是没必要的新增能力。

---

## 六、修订后的分期交付

替代 PRD §九 的排期，主线为「执行层先行、页面后置」，并按 **PRD §八 递进式验收** 把出片拆为三个带验收门的阶段：

| 阶段 | 目标 | 交付物 | 算力 | 验收门 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **S0 · 池子与脚本骨架** | 变量池物理化 + 固化脚本 + 本地校验 | 四个池子 + `batch-shoot.v0/v1` + `prepare-args.mjs` + 38 项校验 | 零 | — | ✅ **已完成** |
| **S1 · 分镜脚本闭环** | 商品 → 单/双角色 → 12 条分镜脚本 | 配方 + 分镜脚本 + 脚本评分表落盘 | 极低 | **第一关 · 脚本 8 项均分 ≥ 3.5** | 待启动 |
| **S2 · 角色分镜图** | 脚本 `shots[]` → 关键帧图 | 分镜图 + 图评分表 | 中 | **第二关 · P1/P2/P3 均分 ≥ 3.5** | 待启动 |
| **S3 · 成片合成** | 分镜图 → 可发布成片 | 成片 + 音画合成 + 导出 | 高 | **第三关 · 成片 5 项验收** | 待启动 |
| **S4 · 多角色扩量** | 多角色批量 + 质检门禁 | 四层池子 + Sample Gate + 质检 5 项 | 中高 | — | 待启动 |
| **S5 · 归因与固化** | 数据回流 → 归因 → 析出模板 | 接 `omnimux-analytics` + 固化写回 `TemplateStore` | 低 | — | 本版不做 |
| **S6 · 工作台页面** | 表单化入口（选商品/选角色/填条数）+ 批次看板 | UI 页面 | — | — | **后置** |

**为什么把出片拆成三段**：不是增加工作量，而是让每一段有独立的通过标准。原 S1「12 条差异化成片」把创意、画面、合成三层的判断压在同一次交付里——一旦结果不达预期，无法判断是创意错了、画面错了，还是合成错了，返工面最大。**分镜脚本是全链路唯一能低成本大规模试错的位置，因此它必须单独成一关。**

**路线调整的理由**：S1/S2 在无页面状态下即可用对话入口驱动并验证产出质量。产品是否"能出预期的片"取决于脚本与池子，不取决于页面。页面只是把三个输入做成表单——**在产出质量被验证之前做页面，等于给一个可能还要改的流程做外壳**。

**边界说明**：本调整不扩大 MVP 边界，只是实现路径变化；PRD §十二 的边界扩展披露继续有效。

---

## 七、三关的验收对象与成本递增

| 关卡 | 交付物 | 能判断什么 | 判断不了什么 | 单条成本 |
| :--- | :--- | :--- | :--- | :--- |
| 第一关 | 分镜脚本 | 创意方向、表达准确性、手法贴合、合规 | 画面好看与否 | 极低（纯文本） |
| 第二关 | 角色分镜图 | 角色形象、商品还原、构图氛围 | 动态、运镜、节奏、口播语气 | 中（图像生成） |
| 第三关 | 成片 | 音画同步、节奏、可投用性 | — | 高（视频 + 配音 + 合成） |

**关键提醒**：过了第二关**不等于**成片可用——分镜图验证不了动态与节奏。但前两关通过后第三关的失败率会明显下降，因为创意与画面这两个变量已经被锁定了。

**纪律**：S1 与 S2 阶段**不产出视频**。这不是保守，而是防止验收焦点从"创意对不对"滑向"视频好不好看"——后者更贵、更晚、更难归因。

---

## 八、运行入口（三档，从轻到重）

| 档 | 形态 | 说明 |
| :--- | :--- | :--- |
| A | 对话直驱 | 老板说「用 XX 商品出 12 条美妆测评」，主 Agent 调 `workflow` 工具启动固化脚本 |
| B | 固化为可复用命令 | 官方 workflow 以 `meta.name` 为持久化键，可复现为带参数的调用（x.ai 亦为 slash command 模式） |
| C | 生产图模板 | 生产图存进 `TemplateStore`，跨批次复用 |

建议 S1/S2 先用 A 验证，S4 起把稳定脚本固化为 B。

---

## 九、待拍板

**E1～E4 已拍板**（全部按建议）：E1 先对话直驱 → 稳定后固化；E2 脚本存项目仓纳入版本管理；E3 接受页面后置（现为 S6）；E4 seed 默认自动随机、支持显式指定。

新增待拍板项（与 PRD §十一 D7/D8 同一批）：

| # | 决策项 | 备选 | 建议 |
| :--- | :--- | :--- | :--- |
| D7 | 首批垂类 | 美妆个护 / 家居日用 / 保健营养 | **美妆个护** 首推 |
| D8 | 画面形态是否参与首期抽样 | A 冻结（上限→15 条）/ B 保持现状（6 条） | **A**：符合 D2「只测人设 × Hook」，且解除容量瓶颈 |

---

## 十、自检

- [x] 官方能力均为实读结论，标注了文件与行号
- [x] 未编造平台 API；存疑项集中标注（§四 随机源限制）
- [x] 明确"不自研 agent 编排"，避免重复建设
- [x] 编排层与生产层职责边界写清（§三、§五）
- [x] 路线调整未扩大 MVP 授权边界
- [x] E1～E4 已拍板
- [ ] 待老板拍板 D7（首批垂类）与 D8（画面形态抽样）
