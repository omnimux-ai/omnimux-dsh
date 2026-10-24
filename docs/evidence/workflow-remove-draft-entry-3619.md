# #3619 移除创作页顶栏「检查生成输入」临时预检入口

## 变更
- `plugins/omnimux-workflow/src/canvas/editor/components/HeaderControls.tsx`：删除入口按钮、`draftOpen` 状态、弹窗挂载与 import（画布其余控件不变）。
- 删除 `GenerationProductDraft.tsx`、`generationProductPreview.ts`、`generationProductDraft.test.mjs`、`tests/e2e/generation-consumer-preview.*`（仅被该弹窗消费）。
- 双语字典移除 53 个 `generationDraft.*` 键（zh/en 同步）。
- `src/canvas/theme/components.css`：删除该弹窗独占的 48 行死规则（含永不成立的 `:has()` 选择器）。
- `HeaderControls.test.mjs`：补入口/主题样式回归断言（7 pass）。
- 新增 `tests/e2e/header-draft-entry-removed.e2e.test.mjs`：画布 harness + 真实 Chrome 的端到端验收。
- 退役被打断的旧验收：`plugins/omnimux-viewer/tests/e2e/media-mime-selection.e2e.test.js` 与 `test-support/media-mime-selection-3278/`（该 journey 完全由草稿弹窗驱动；素材 MIME 覆盖由 `src/media-viewer/picker-mime.e2e.test.js` + `media-mime-selection.test.js` 承担，实测 11 pass）。

## 验证（本任务工作树内实际执行）
| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 插件单测 | `node --test "src/**/*.test.mjs" "src/**/*.test.js" "tests/*.test.mjs"`（plugins/omnimux-workflow） | 2846 pass / 0 fail |
| 画布类型 | `tsc -p tsconfig.canvas.json --noEmit` | 通过 |
| 构建 | `node scripts/build-host.mjs && build-client.mjs && build-canvas.mjs` | 通过 |
| Stage 合同 | `node scripts/verify-stage-contracts.mjs` | PASS（14 Stage / 8 sidebar） |
| 反 slop | `node --test scripts/verify-anti-slop.test.mjs` | 3 pass |
| 插件边界 | `node scripts/verify-plugin-boundaries.mjs` | 4403 文件通过 |
| 端到端（真实浏览器） | `node --test plugins/omnimux-workflow/tests/e2e/header-draft-entry-removed.e2e.test.mjs` | pass 1 / fail 0 |

端到端实测 DOM（harness 渲染生产 `src/canvas` 产物）：

```json
{ "header": true, "headerButtons": 5, "entry": 0, "entryText": false, "draftModal": 0, "flow": 1, "nodes": 5,
  "titles": ["自适应视图", "缩小", "放大", "整理对齐", "小地图"] }
```

截图：[canvas-header-after-removal.png](workflow-remove-draft-entry-3619/canvas-header-after-removal.png) —— 顶栏只剩视图/缩放/对齐/小地图/布局控件，不再有「检查生成输入」。

## 候选构建的真实安装与加载
契约运行器（`node scripts/worktree-app-qa.mjs --request …`）在任务私有运行时里确认候选插件已安装并加载：`task-source-installed-loaded = true`，`loadedModules = ["omnimux", "omnimux-workflow"]`。该次运行的原始证据位于 `.workbuddy/evidence/contract/workflow-remove-draft-entry-3619/`（本机生成物，不入库）。

## 第二消费方（独立评审发现，已处理）
`plugins/omnimux-viewer/test-support/media-mime-selection-3278/legacy-journey.mjs` 曾通过草稿弹窗驱动 #3278 的素材 MIME 验收（`:95` 等「检查生成输入」、`:255` 草稿内选择器），入口移除后该 journey 必然超时/空指针，且它不在 CI 的 `scripts.test` 覆盖内会静默腐烂。处理：随本片退役该 journey 与 `media-mime-selection.e2e.test.js`；素材 MIME 的行为覆盖保留在 `plugins/omnimux-viewer/src/media-viewer/picker-mime.e2e.test.js` 与 `media-mime-selection.test.js`（本次实跑 11 pass / 0 fail）。

## 已知限制与残留
- 画布在正式应用里挂载于 `dsh-better-sidebar` 面板宿主；契约运行器的 fresh 运行时未安装该侧栏，因此端到端验收改用插件自带的画布 harness（`scripts/canvas-harness.mjs`，W1 视觉验收事实源）渲染同一份 `src/canvas` 产物：覆盖画布与顶栏本身，不覆盖应用壳层。
- 契约运行器的固定 `app-browser` 断言（`blank-session-guide-visible` / `explore-section-visible` / `explore-cards-present` / `asset-hub-reachable-via-library`）在本机安装的 OmniMux Dev 包上不成立（空白会话未渲染探索区），与本次改动无关，故该路径无法在本机取得全绿。
- 本机 `python3` 3.15 会让 `scripts/managed-tarball-archive.py inspect` 报 `read() on write-only GzipFile object`；用 python3.12 可正常完成打包核对。该缺陷属既有工具链问题，未在本任务范围内修改。
