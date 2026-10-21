# 真实浏览器验收 · 视频工具栏「先建下游节点 + 隔离执行」

- 任务：`workflow-video-toolbar-isolated` / Issue #3550
- 日期：2026-10-21 16:09（Asia/Taipei）
- 工作树：`.worktrees/workflow-video-toolbar-isolated`
- 分支：`agent/workflow-video-toolbar-isolated-issue-3550`
- **结论：PASS** —— `REAL_EXIT=0`，24/24 断言全绿（12 项应用基础断言 + 12 项 journey 断言），浏览器自清理完成。

## 1. 命令与真实输出

```sh
node scripts/worktree-app-qa.mjs --journey .workbuddy/qa-journeys/video-toolbar-isolated.mjs
```

```
✅ 应用级 smoke 检查通过（mode=ui，24 项断言，端口 59086，CDP 59092）
   截图: …/.workbuddy/evidence/app-qa/1dde5479-990b-4124-9883-80e5ac393aeb/app-home.png (1280x657, 336033 字节)
   证据: docs/evidence/worktree-app-qa-report.json
   范围: smoke；任务绑定: unknown；实时在线: unsupported
💡【测试工程夹具】：已自动预装带媒体素材的标准测试工程（ID: ws_qa_media）
REAL_EXIT=0
```

- 运行器：`scripts/worktree-app-qa.mjs`（worktree 隔离 Web QA runner，动态端口、自清理；本 run 修复了 legacy `journey:` 断言白名单，见 PR #3558）
- 浏览器：headless Chrome + CDP，真实指针事件（`Input.dispatchMouseEvent`）
- mode：`ui`（本机 mock 模型端点，无真实计费）

## 2. Journey 断言（12/12 PASS）

| 断言 | 结果 |
| --- | --- |
| C1-click-creates-downstream-node-immediately | PASS |
| C1-downstream-node-shows-generating | PASS |
| C1-source-video-node-not-marked-running | PASS |
| C1-targetNodeId-forwarded-to-server | PASS |
| C1-settled-single-node-no-duplicate | PASS |
| C1-source-video-unchanged-after-settle | PASS |
| C2-failure-rendered-on-downstream-node | PASS |
| C2-source-video-clean-after-failure | PASS |
| C2-storyboard-request-targets-downstream-node | PASS |
| C3-source-video-allows-second-toolbar-operation | PASS |
| C3-both-operations-target-distinct-nodes | PASS |
| C3-concurrent-settled-three-nodes | PASS |

## 3. 截图证据（本目录）

| 文件 | 内容 |
| --- | --- |
| `app-home.png` | 运行器整页截图 |
| `C1-running-source-untouched.png` | 点击「内容拆解」瞬间：右侧新表格节点「生成中…」，**源视频节点无遮罩** |
| `C1-settled-no-duplicate.png` | 完成态：同一表格节点就地显示「分析维度 / 分析内容」预览，画布仍为 2 个节点（无重复） |
| `C2-failure-on-downstream-node.png` | 分镜表失败：错误卡片 + 「重新生成」落在下游节点，源视频节点干净 |
| `C3-two-tasks-concurrent-source-free.png` | 拆解进行中仍可对源视频发起分镜表：两个下游节点并发生成中 |
| `C3-concurrent-settled-three-nodes.png` | 两个任务完成后画布 3 个节点（源视频 + 2 个独立下游表格） |

人眼复检：C1 两张截图确认源视频节点保持原样（有播放器/替换按钮、无「生成中」遮罩），新节点在右侧独立存在并先骨架后表格预览。

## 4. 验收过程中发现并修复的真实缺陷

整图 `hydrateGraph(serverWorkspace)` 会把下游节点重新写回 `running`：

- 现象：成功后 store 一度是 `ready/completed`，随后被 React Flow 的 `replace` NodeChange（携带其内部旧占位快照）经 `onNodesChange` 覆盖回 `generating/running`，表格节点永久显示「生成中…」。
- 修复：成功路径**不做整图 hydrate**，只对 `targetNodeId` 做 settlement patch（客户端已持有预建节点与连线，服务端按 `targetNodeId` 原地补齐同一节点）。
- 证据：修复前后各跑一次真实浏览器 journey，修复前 C1 卡在「生成中…」超时，修复后 24/24 通过。

## 5. 环境前置（本机，非产品代码）

隔离运行器在本机曾因宿主依赖版本漂移启动失败（`@deepseek-ai/schemastery` 3.18.2 无 `.volatile`、`@deepseek-ai/cosmokit` 1.8.3 无 `createVolatile`）。已把 Dev profile 的这两个依赖 pin 到主仓插件声明版本并在 profile `package.json` + `pnpm-lock.yaml` 固化（schemastery `^3.18.4`、cosmokit `^1.8.5`），修复后运行器可重复启动。该修复属开发环境维护，见 Issue #3552；桌面壳/Dev App 的长期依赖对齐仍待上游处理。

## 6. 边界说明

- 本验收只覆盖 `omnimux-workflow` 本次改动面；未使用 IAB、未触碰 Dev 45120（人工职责）。
- 应用基础 12 项断言也全绿；本报告不声称 Dev 真机验收或生产发布。
