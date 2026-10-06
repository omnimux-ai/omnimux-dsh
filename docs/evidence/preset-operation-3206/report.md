# Issue #3206 实测证据报告 — 内置应用视频节点显式声明 `operation`

- 仓库：`omnimux-dsh`
- 工作树：`.worktrees/omnimux-apps-preset-operation-issue-3206`
- 分支：`agent/omnimux-apps-preset-operation-issue-3206`（基底 `origin/main 801af2c03`）
- 关联 Issue：#3206
- 证据生成时间：2026-10-06 20:49–20:56（本机时间）

## 1. 改动内容

模板把「首帧」写在视频节点的 `data.params.mode`，而生产代码只读 `data.params.operation`
（`plugins/omnimux-workflow/src/shared/validation/operationUi.ts` 的 `readPreferredOperationId`）。
`operation` 缺失时，`recomputeCanvasSlots` 按上游素材指纹回落 catalog 默认操作
（视频为 `video_multi_ref`），而连线仍带 `data.targetSlot: "first_frame"` —— 该槽位在
`video_multi_ref` 布局中不存在，于是产出 `slot_removed` 冲突、`readyToSubmit: false`，
界面渲染为 `data-testid="wf-input-conflict"` 的「素材不可用，请替换或重试」。

本次改动（三处人工镜像 + 生成器统一改为显式 `operation`）：

| 文件 | 改动 |
| --- | --- |
| `scripts/transpile-creatify-workflows.mjs` | 生成器 `mode` → `operation` |
| `plugins/omnimux-apps/catalog/presets/*.workflow.json`（8 个） | 视频节点 `params.mode:"first_frame"` → `params.operation:"first_frame"` |
| `plugins/omnimux-apps/catalog/presets/app-builtin-viral-replication.workflow.json` | 原本无 operation，补 `params.operation:"video_multi_ref"` |
| `plugins/omnimux-workflow/src/client/projects/presetWorkflows.js` | 前端预设镜像同步 |
| `plugins/omnimux-apps/src/shared/builtinCatalogData.ts` | 静态内联镜像同步 |
| `scripts/qa-verify-preset-workflow-standards.mjs` | 新增 Phase 5（11 条回归断言） |

## 2. 复现路径

1. 内置应用 `app-creatify-app-demo`（界面名「手机与网页交互实机演示」，模板
   `plugins/omnimux-apps/catalog/presets/app-creatify-app-demo.workflow.json`）的视频生成节点为
   `node-video-generation-core`，入边 `edge-img-to-video` 带 `data.targetSlot: "first_frame"`。
2. 副本画布导入该图后，槽位与冲突由唯一入口
   `recomputeCanvasSlots`（`plugins/omnimux-workflow/src/shared/graph/canvasSlotRecompute.ts:12`）计算。
3. 修复前形状（`params.mode` 存在、`params.operation` 缺失）→ `operation` 回落 `video_multi_ref`
   → `slot_removed` → `readyToSubmit:false` → 界面出现 `wf-input-conflict`。

## 3. 实测结论

### 3.1 生产行为（真实模块 + 随包模板数据）—— 已验证 PASS

命令（工作树内）：

```sh
node --test plugins/omnimux-workflow/tests/e2e/preset-operation-3206.e2e.test.mjs
```

结果：`ℹ tests 3 / ℹ pass 3 / ℹ fail 0`（`REAL_EXIT=0`，日志见 `e2e-run.log`）。

用真实 `recomputeCanvasSlots` + 中枢真实模型目录（`buildModelCatalog({env:{}})`）在随包模板上计算：

| 形状 | `params.operation` | `slotConflicts` | `readyToSubmit` |
| --- | --- | --- | --- |
| 修复后（随包数据） | `first_frame` | `[]` | `true` |
| 反向对照（还原修复前 `params.mode`） | `video_multi_ref`（回落） | `["slot_removed"]` | `false` |

反向对照证明该判据确实能抓住这个回归，而不是恒真。机读原始证据：`canvas-node-evidence.json`
（含连线 `targetSlot`、槽位绑定、冲突原因码、`compat.reasonCodes`）。

### 3.2 真实浏览器功能旅程 —— 部分覆盖（见 §4）

命令（工作树内，由 e2e 用例第三个 test 调用）：

```sh
node scripts/worktree-app-qa.mjs --journey plugins/omnimux-workflow/tests/e2e/preset-operation-3206.journey.mjs
```

结果：隔离工作树完整应用（`mode=ui`、动态端口、自清理）在真实 Chrome（CDP）中启动，
基线 12 项断言 + 旅程 5 项断言全部通过；耗时约 19.4s。旅程断言：

| 断言 | 结果 |
| --- | --- |
| `builtin-app-entry-present-in-real-ui` | PASS —— 真实界面里恰好一处「手机与网页交互实机演示」入口卡片 |
| `explore-entry-clicked` / `ai-apps-panel-clicked` | PASS |
| `ai-apps-panel-renders-first-level-apps` | PASS —— `.omnimux-explore-menu` 渲染 11 个一级应用 |
| `builtin-app-not-in-first-level-app-menu` | PASS（边界记录，见 §4） |

截图：`copy-canvas-builtin-app-entry.png`（真实界面里的内置应用入口卡片）、
`explore-ai-apps-panel.png`（探索页「AI应用」面板真实渲染）。

## 4. 未覆盖项（如实声明，不伪造）

1. **「应用卡片 → 创建副本 → 副本画布」这条应用页点击旅程未覆盖**。当前构建把
   `app-creatify-app-demo` 以**创作模板卡片**（素材工作台 → 精选 → 软件应用）形式发布；
   探索页「AI应用」面板的一级应用清单实测为
   `视频剪辑 / Google Vids / 产品库 / 发布 / 账号 / 手机管理 / 数据分析 / 自动化 / 任务表单 / 社交采收 / 快讯中枢`
   —— **不含**该应用，`AppTab.jsx` 的「编辑应用 → 创建副本」入口对该 appId 在界面上不可达。
   因此本报告**不声称**已在真实浏览器里断言副本画布的 `wf-input-conflict` 不出现；
   该冲突回归由 §3.1 在同一份随包数据 + 同一生产计算入口上覆盖。
2. 未做 `live` 模式真实视频生成（需任务级特批）。
3. 未验证已落盘的存量坏副本迁移（本任务非目标，见 spec §4）。

## 5. 证据文件清单

| 文件 | 说明 |
| --- | --- |
| `report.md` | 本报告 |
| `canvas-node-evidence.json` | 机读原始证据：真实 `recomputeCanvasSlots` 输出（修复后 vs 反向对照） |
| `canvas-node-evidence.log` | 生成该 JSON 的 stdout（两行关键结论） |
| `e2e-run.log` | e2e 用例真实运行日志（`tests 3 / pass 3 / fail 0`） |
| `app-qa-run-report.json` | 应用级验收运行器本次运行的完整结构化报告（含 12 项基线与旅程断言） |
| `copy-canvas-builtin-app-entry.png` | 真实浏览器截图：内置应用入口卡片 |
| `explore-ai-apps-panel.png` | 真实浏览器截图：探索页「AI应用」面板一级应用清单 |
| `contract-truth-check.mjs` / `contract-truth-check.log` | 中枢契约真源独立核验（operation ↔ 槽位集合） |

## 6. 变更面与最小命令（对照 plugin-qa）

| 变更面 | 命令 | 结果 |
| --- | --- | --- |
| 预设模板数据 + 生成器 + 门禁脚本 | `node scripts/qa-verify-preset-workflow-standards.mjs` | 49/49 |
| 单插件业务逻辑 | `corepack pnpm --filter omnimux-workflow test` | 2428 pass / 0 fail |
| 单插件业务逻辑 | `corepack pnpm --filter omnimux-apps test` | 88 pass / 0 fail |
| 门禁 / 脚本 | `corepack pnpm test:gates` | 291 pass / 0 fail |
| 产品基线 | `corepack pnpm verify:product-baseline` | 通过 |
| Client/Stage（`presetWorkflows.js` 属 `src/client/`） | 隔离工作树真实浏览器证据 | 见 §3.2 |
| 端到端契约 | `node --test plugins/omnimux-workflow/tests/e2e/preset-operation-3206.e2e.test.mjs` | 3/3 |
