---
title: "OmniMux 插件套件重构前审查证据"
id: "evidence-plugin-suite-refactor-20260905"
type: "evidence"
status: "accepted"
authority: "L3"
date: "2026-09-05"
updated: "2026-09-05"
authors: ["codex"]
subsystem: "global"
related:
  - "docs/specs/2026-09-05-plugin-suite-refactor-plan.md"
---

# 重构前审查证据

本记录是 2026-09-05 的源码与选定测试快照，不是产品全量验收或发布证明。对应 [重构方案](../specs/2026-09-05-plugin-suite-refactor-plan.md)。

## 审查面

- 仓库 `omnimux-ai/omnimux-dsh`；初审 base/target 为 `4be7dd4f1ed31e9dc584873c5e3e5bbe571440c1`。实施启动后先核对 `d27d44d918e2dc1bb8276301eba0cda084d53a1c`，随后经过 `f30ceb95035c61709b7e1b519490e4355f879b64`、`77b4a6a1789d1f7a14353f86e97857b543cc33fc` 与 `29b9dd551a644fa28b380318521b4a2ad51a5403`，当前最新为 `origin/main=0f4d327f92870ae87fc44367bfe5c493602fa5c5`。
- 创建 worktree 时基线为 `c7f42ff1967f4e480115b7c4413c5dc5d17a28c1`，随后更新到 #529 的 `6592f1a`；收尾又发现 #526/#532，已读取增量并 fast-forward 到 `4be7dd4`。终审联合重跑 82 项回归与三个静态检查，以下当前判断以终审版本为准。
- 方案文档以父任务 #539 为业务范围，并由文档 Issue #556 的 `agent/common-architecture-refactor-plan-issue-556` 分支交付；三个审查子任务均使用各自独立干净 worktree。
- 只读审查中枢、workflow、七个领域库页、现有公共 UI kit 和相关构建/测试入口。OpenReel vendor 不作为自研重构对象。

GitHub 检索命令：

```sh
gh pr list --repo omnimux-ai/omnimux-dsh --state merged \
  --search 'merged:>=2026-08-29 base:main' --limit 300 \
  --json number,title,url,mergedAt,mergeCommit,baseRefName,headRefName
```

结果为 246 条（小于 limit，无此分页截断），最早 2026-08-29 01:30:42 UTC，最新 2026-09-05 01:08:09 UTC。逐 PR 的 merge commit 用 `git diff-tree --no-commit-id --name-only -r` 汇总路径；不是用 PR 标题当变更证明。重点链由 `gh pr view`、本地 merge diff 和现代码交叉检查。

| UTC 日期 | 合并数 |
|---|---:|
| 2026-08-29 | 52 |
| 2026-08-30 | 57 |
| 2026-08-31 | 25 |
| 2026-09-01 | 5 |
| 2026-09-02 | 35 |
| 2026-09-03 | 16 |
| 2026-09-04 | 50 |
| 2026-09-05（截止时） | 6 |

## 高频修改位置

以下是窗口内不同合并 PR 触及文件的次数，不是缺陷数。排除 lib/dist/openreel 生成或 vendor 路径。

| 文件 | PR 数 |
|---|---:|
| `plugins/omnimux-workflow/src/canvas/theme/components.css` | 28 |
| `plugins/omnimux/src/client/workbench.js` | 25 |
| `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/index.tsx` | 18 |
| `plugins/omnimux/src/client/conversation-box.js` | 13 |
| `plugins/omnimux-workflow/src/canvas/editor/CanvasEditor.tsx` | 12 |
| `plugins/omnimux-workflow/src/canvas/editor/components/MaterialNode/ConfigPanel/index.tsx` | 11 |
| `plugins/omnimux/src/host/apply.js` | 8 |

执行现有 `node scripts/code-refactor-analyzer.mjs plugins scripts --format json --output <temporary-report>`：source bucket 为 783 文件、107404 SLOC；另列 tests 367 文件、49921 SLOC，generated 12 文件、3461 SLOC；vendor 默认忽略。扫描器采用启发式分类与复杂度计数，仅用来定位阅读顺序，不以其 C 级评分或行数作为删改结论。

## 当前验证结果

| 本次实际执行 | 结果 | 证明边界 |
|---|---|---|
| `node scripts/verify-plugin-boundaries.mjs` | PASS，1860 source files | 现有静态依赖/边界规则 |
| `node scripts/verify-package-files.mjs` | PASS，12 插件 | package files 声明规则；不证明安装产物可运行 |
| `node scripts/verify-stage-contracts.mjs` | PASS，10 Stage / 8 Store | 现有文件扫描；不证明实际侧栏路径或真机可用 |
| `node --test plugins/omnimux/src/client/workbench.test.js plugins/omnimux-inspiration/src/client/replicate-to-chat.test.js` | 71 pass / 0 fail / 0 skip | 初审工作台与 #529 对应选定回归；终审已以 #532 重跑 |
| `node --test plugins/omnimux/src/client/workbench-context.test.js plugins/omnimux/src/client/events-client.test.js plugins/omnimux/src/client/composer-envelope.test.js` | 11 pass / 0 fail / 0 skip | 三份文件当前未被 hub package test 命令列出，手工执行有效 |
| 以上五个测试文件在 `4be7dd4` 上联合重跑 | 82 pass / 0 fail / 0 skip | 最新 #532 保留画布的行为基线；不是另加 82 项 |
| `node scripts/doc-lint.mjs`（文档改动前） | FAIL，152 errors / 19 warnings | 既有 Frontmatter、命名、链接等问题，不归因于本次方案 |

本轮未执行全插件 test/typecheck/build、安装 smoke、L2/45120 浏览器验收、provider 生成、账号发布或付款。工作区入口调用 `pnpm wt:start` 时 pnpm 自动进行了本地 install/prepare；随后核对主仓 tracked diff 为空。这次自动构建不是重构验收证据，未触及 App/profile；其后直接使用已核实的脚本避免重复触发。

## 复核的关键发现

1. `scripts/agent-live-qa.mjs` 仅 30 行：第 4 行默认 44120，第 17 行只判断 HTTP 200，第 29 行连接异常退出 0；无浏览器动作、stage 内容断言或报告。未执行该脚本来冒充 UI 验收。
2. `omnimux-market` 的 `skill-picker-logic.js` 未进入真实构建消费链，picker/plaza 各维护副本；现有 esbuild 已支持 bundle，无需新构建框架。
3. publish 的 Host 聚合与当前 UI 聚合重复，另有旧 RecordsList 的第三份；submit 的五个 import typedef 在被引用文件中未定义。
4. workbench 的快照、几何、Tab、context 职责混在同一模块，workbench HTTP disposer 不在统一 effect 链。这里只证明所有权分裂，未声称已复现泄漏。
5. workflow 的 11-event 列表与 Payload 多处维护；SSE 与 snapshot 有不同投影；表格 Agent 与 HTTP 路径、当前工作区解析分裂。这些是调用链证据，不是本轮真机缺陷复现。

两项低成本纯 Node 探针由独立审查者与主审重复确认：

- 使用一个符合现有 chat/profile 的 model fixture，把 prompt input 的 `role` 改为数字 123，`validateModel(model)` 返回 `[]`；`model-capability.schema.json` 的 `inputSlot.role` 却要求 nonEmptyString。首次主审试验额外用了非法 execution status，得到 status 诊断；替换为当前 fixture 的 `live/textComplete` 后，数字 role 仍无诊断。探针没有读取用户模型配置。
- 给 `mountMedia` 注入 fake executor，工具收到 voice=nova、style=jazz、instrumental=true、speed=1.2；fake executor 中四项均为 undefined。没有网络、生成或落盘，示例 dest 从未写入。

inspiration 删除候选按 client 真入口检查：当前 Stage/Section 使用 Preview、InlineImport、useInspirationFeed 和 oneClickReplicate；旧 Detail/ImportDialog/use-inspiration/workflow-global 不在该可达图中，但测试与历史规格仍有引用，必须随删除更新。#499 当时“不删 workflow-global”的范围限制在新方案中显式提出替代，不能悄悄抹掉。

## 既有在途工作

初审时 [#526](https://github.com/omnimux-ai/omnimux-dsh/pull/526) 尚 open，终审已合入；其后 [#532](https://github.com/omnimux-ai/omnimux-dsh/pull/532) 明确复刻后保留右侧画布、展开 split 会话。两者增量已读，终审查询 open PR 为空。这两次修复本身不计入本轮交付。已有清理单 [#504](https://github.com/omnimux-ai/omnimux-dsh/issues/504)、验收脚本单 [#508](https://github.com/omnimux-ai/omnimux-dsh/issues/508) 应复用。

模型 epic [#463](https://github.com/omnimux-ai/omnimux-dsh/issues/463) 的 [#466](https://github.com/omnimux-ai/omnimux-dsh/issues/466)、[#467](https://github.com/omnimux-ai/omnimux-dsh/issues/467)、[#468](https://github.com/omnimux-ai/omnimux-dsh/issues/468)、[#469](https://github.com/omnimux-ai/omnimux-dsh/issues/469) 均 open/planning；H1/H2 已合入不能推导这些后续能力已经完成。

实施启动后的增量审查确认：#533/#536 仅增加文档；#534 收窄 Composer CSS 选择器并验证 360px 无横向滚动，未改变 Workbench 状态接口；#535 扩展当前 Inspiration Preview 的分段脚本、翻译与引用能力，四个删除候选仍不在 client 入口可达图中；#537 扩展 Publish 账号侧栏，没有替换 `store.js` 与 `status-display.js` 的重复聚合算法；#541/#553 继续修改现行 Preview 的播放器、分析渲染、标题栏、三联布局和 footer，也没有恢复四个删除候选的消费者；#551 在 Hub `apply` 新增 `speechToText` 挂载并增加 `stt.test.js`，与 C2/A3 存在直接回归关系。新增行为已进入 #542/#543/#544/#545/#546 的回归范围。

## 重点 PR 追溯

下表为主审详细读取的 25 个 PR。领域审查另读 #478/#483/#488/#494/#498/#515/#524 的相关实现。

| PR | Merge SHA | UTC mergedAt | 标题 |
|---|---|---|---|
| [#446](https://github.com/omnimux-ai/omnimux-dsh/pull/446) | 7bc290d | 2026-09-04T03:47:45Z | feat(omnimux): Agent 页面感知与工作台双向协同系统 |
| [#447](https://github.com/omnimux-ai/omnimux-dsh/pull/447) | d3273ae | 2026-09-04T03:52:51Z | fix(omnimux): ship src/events and src/workbench in package files |
| [#448](https://github.com/omnimux-ai/omnimux-dsh/pull/448) | 852f09d | 2026-09-04T03:57:51Z | fix(omnimux): declare dsh-tools output on workbench Agent tools |
| [#450](https://github.com/omnimux-ai/omnimux-dsh/pull/450) | 163bbd8 | 2026-09-04T04:16:39Z | fix(omnimux): read snap.state in getUiContext and use webServer.register for workbench routes |
| [#451](https://github.com/omnimux-ai/omnimux-dsh/pull/451) | 3c30ab0 | 2026-09-04T04:21:47Z | fix(omnimux): support contenteditable and Lexical editor in composer envelope capture |
| [#452](https://github.com/omnimux-ai/omnimux-dsh/pull/452) | 2b2fd7d | 2026-09-04T04:37:31Z | feat(infra): package-files integrity gate + hub tool test harness |
| [#453](https://github.com/omnimux-ai/omnimux-dsh/pull/453) | 773accc | 2026-09-04T04:39:57Z | fix(omnimux): register workbench routes via webServer.register and include tab title in uiContext |
| [#455](https://github.com/omnimux-ai/omnimux-dsh/pull/455) | 6b47739 | 2026-09-04T04:54:48Z | feat(omnimux): fix-http-routes-workbench |
| [#456](https://github.com/omnimux-ai/omnimux-dsh/pull/456) | 0011a24 | 2026-09-04T04:57:04Z | fix(omnimux): describe native Files tabs and isolate viewport by session |
| [#428](https://github.com/omnimux-ai/omnimux-dsh/pull/428) | 3b81e4d | 2026-09-03T23:58:17Z | refactor(omnimux): converge three-pane layout: explicit collapse lock, 260px min-width, symmetric centering (#372) |
| [#500](https://github.com/omnimux-ai/omnimux-dsh/pull/500) | 48f3cab | 2026-09-04T13:42:23Z | fix(omnimux): 限制 split 会话栏最小宽度 360px |
| [#509](https://github.com/omnimux-ai/omnimux-dsh/pull/509) | d5037d4 | 2026-09-04T16:46:34Z | fix(omnimux): clamp the rendered workbench panel (#505) |
| [#449](https://github.com/omnimux-ai/omnimux-dsh/pull/449) | 2a645cc | 2026-09-04T03:58:25Z | feat(core): 全模态模型能力契约治理与生成方式动态自适应 (#445) |
| [#485](https://github.com/omnimux-ai/omnimux-dsh/pull/485) | b5652a1 | 2026-09-04T13:09:05Z | feat(omnimux): model-contract-foundation |
| [#507](https://github.com/omnimux-ai/omnimux-dsh/pull/507) | 9fa44a0 | 2026-09-04T17:20:17Z | feat(omnimux): model-contract-catalog |
| [#474](https://github.com/omnimux-ai/omnimux-dsh/pull/474) | c5625d7 | 2026-09-04T11:39:48Z | feat(omnimux): unified quota-exceeded recharge gate (#472) |
| [#489](https://github.com/omnimux-ai/omnimux-dsh/pull/489) | a0903ac | 2026-09-04T12:41:17Z | feat(omnimux): precheck quota before billable client calls (#484) |
| [#499](https://github.com/omnimux-ai/omnimux-dsh/pull/499) | 6d7296d | 2026-09-04T13:43:57Z | feat(omnimux-inspiration): 一键复刻走官方新会话语义 (#477) |
| [#513](https://github.com/omnimux-ai/omnimux-dsh/pull/513) | ba66c8a | 2026-09-04T17:35:07Z | refactor(omnimux): composer「+」新选项并入官方原生命令列表（#493 follow-up） |
| [#516](https://github.com/omnimux-ai/omnimux-dsh/pull/516) | f872b1a | 2026-09-04T17:35:58Z | fix(omnimux-inspiration): 一键复刻后展开中间会话栏 (#506) |
| [#519](https://github.com/omnimux-ai/omnimux-dsh/pull/519) | ba0665d | 2026-09-04T17:37:07Z | feat(omnimux-inspiration): 一键复刻预填收敛为 skill+约束 (#518) |
| [#529](https://github.com/omnimux-ai/omnimux-dsh/pull/529) | 6592f1a | 2026-09-05T00:56:22Z | fix(omnimux-inspiration): 一键复刻在画布共存时关闭面板展开会话栏 (#528) |
| [#461](https://github.com/omnimux-ai/omnimux-dsh/pull/461) | 39bcf1a | 2026-09-04T08:42:49Z | fix(workflow): bind session canvas workspace into agent context |
| [#526](https://github.com/omnimux-ai/omnimux-dsh/pull/526) | 02d8b59 | 2026-09-05T01:02:50Z | fix(omnimux): 附件卡片悬停关闭按钮不再被裁剪/遮挡 (#525) |
| [#532](https://github.com/omnimux-ai/omnimux-dsh/pull/532) | 4be7dd4 | 2026-09-05T01:08:09Z | fix(omnimux-inspiration): 一键复刻保留右侧画布，split 展开会话栏 (#531) |

文档完成后再次执行 DocLint：仍为 152 errors / 19 warnings，与基线逐条比较新增诊断 0；`git diff --check` 通过。本次方案与索引未引入新的文档诊断，全库门禁仍未通过，未据此提交或发布。
