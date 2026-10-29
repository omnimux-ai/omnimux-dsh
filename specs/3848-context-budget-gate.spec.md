# Spec: Agent 工具与系统提示词上下文预算门禁

- Issue: #3848
- 风险级别: R1（`scripts/` 门禁与合同变更；不改任何插件运行行为）
- 来源实践: MiniMax mcode-stack `tool-budget-audit` / `context-tax-audit`（MIT）

## 1. 目标

每次对话都会把全部工具定义和系统提示词段塞进请求。当前 `pnpm test:agent-tools` 只校验格式，不度量体积，也不检查提示词段是否每轮变化（变化会让系统消息原地替换、缓存前缀失效）。本任务新增第 5 层「上下文预算」：

- 按插件报告工具数、工具定义字符数、系统提示词段字符数。
- 报出同插件内疑似重复的工具（描述高度相似）。
- 报出函数型提示词段在不同时钟/随机序列下渲染结果不同的「易变段」，建议改走缓存安全的 `systemPrompt.context`（[官方系统提示词文档](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/system-prompt.md)）。
- 棘轮：提交基线；只有相对基线**新增**的超标、重复、易变才失败，存量只报告。

同时把第 3 层输出从「评测通过率」如实改为「离线路由冒烟（正则模拟，非模型评测）」，避免把降级结果当真实结果。

## 2. 范围

- 改：`scripts/agent-tools-suite/mock-context.mjs`（记录 section/context）、`loader.mjs`（返回提示词段）、新增 `budget.mjs` 与 `budget-baseline.json`、`scripts/test-agent-tools.mjs`（`--budget` 层与第 3 层标注）、`scripts/test-agent-tools.test.mjs`、`docs/contracts/dsh-plugin-engineering-practices.md`（新增第九节）。
- 不改：任何插件源码、工具注册行为、官方 DSH。

## 3. 度量口径

- 工具定义 = `JSON.stringify({ name, description, parameters })` 的字符数；提示词段 = 渲染文本字符数。报告标明「字符数，非 token」。
- 动态装载失败、只靠静态正则提取的工具参数被置空，标「参数未计入」，不参与超标判定。
- 易变判定：函数型 section 在两组不同的 `Date.now` / `Math.random` 下各求值一次，结果不同即易变；静态字符串视为稳定。读外部状态的段落测不出来（已知局限）。

## 4. 失败条件（只拦新增）

1. 新工具（基线里没有的名字）定义超过单工具上限。
2. 某插件工具定义总字符超过基线 ×1.10。
3. 出现基线里没有的疑似重复工具对。
4. 出现基线里没有的易变提示词段。

改基线只能 `--write-baseline --reason "<≥8 字>"`，理由写入 JSON，在 PR diff 中可审。

## 5. 新用户基线

只依赖仓内脚本与 Node 内置模块，不读开发机私有状态、不联网、不调用模型。基线文件缺失或格式错误时报错退出，不静默当作空基线。

## 6. 文档影响

`docs/contracts/dsh-plugin-engineering-practices.md` 新增「九、上下文预算与缓存站位」（原第九节顺延为第十节），是该门禁的唯一规则来源；Issue 正文不重复规则。

## 7. 实施记录（阶段 0 实测）

- 现有 loader 只尝试 `src/index.js`，hub `omnimux`、`omnimux-workflow`、`omnimux-market`、`omnimux-video`、`omnimux-viewer` 动态装载失败，最大的体积来源未被度量。第 5 层改用独立装配 `loadBudgetSurfaces`：按 package 入口、以最小宿主桩补装一次，只用于体积度量，不扩大第 1–4 层覆盖面（hub 补装后有 14 个工具在第 2 层空参调用下报错，混入会引入与本任务无关的失败）。
- 补装后实测：155 个工具定义共 140,127 字符，9 个提示词段共 16,222 字符；单工具 p50 443 / p90 1,614 / p95 2,200；最大 `workflow_director` 33,065 字符。`omnimux-browser`（需宿主网关流）、`omnimux-forms`（需 `webServer`）仍无法装载，如实列为未纳入。
- 相似度阈值 0.6 时命中 30 对，多为同族 CRUD 模板化描述（噪声）；提高到 0.8 后剩 5 对，均为真正可合并的候选（图片/视频/音频提交三连、TikTok/YouTube 搜索、灵感 get/delete）。
- 当前没有易变 section。写基线要求先构建全部插件，避免缺产物插件下次构建后被误判为新增。

## 假设

插件的上下文体积主要来自工具定义（名称、描述、参数 Schema）与 `systemPrompt.section` 文本，二者都能在现有 mock 上下文的动态装载中被完整捕获；函数型 section 若依赖时间或随机数，换一组假时钟与随机序列再求值即可暴露差异；存量问题通过基线冻结后，只拦新增不会误伤现有插件。

## 证伪方式

- 运行 `node scripts/test-agent-tools.mjs --budget`：若报告的插件数或 section 数明显少于源码中 `systemPrompt.section(` 注册点（13 个文件），说明捕获口径不成立。
- 单测用夹具验证：返回 `Date.now()` 的段必须判为易变、返回常量的段必须稳定；超标/近似重复各命中一次，无关工具零误报；基线存量项不失败、新增项失败、缺 `--reason` 写基线报错退出。任一断言失败即证伪。
- 在当前 `main` 上首次生成基线后立即重跑，必须零失败；否则说明棘轮会误伤存量。
