# 3961 发布资产卡片布局改进 — 验收证据

- Issue: #3961
- 分支基线：merge-base `7b0c61863`（origin/main tip 随时间前进，以 PR base 为准）
- 取证时 HEAD：`7b9c514f4`（本报告渲染的内容树与之相同；交付为同一内容树的压平提交）
- 变更范围:
  - `plugins/omnimux-publish/src/client/views/AssetCard.jsx`、`RecordsTable.jsx`、`styles.js`
  - 新增 `src/client/icons/cards.js`（矢量图标）、`src/client/card-thumbnail.js`（选图纯函数）
  - 新增 `src/client/card-thumbnail.test.js`、`tests/e2e/publish-asset-card-layout.e2e.test.mjs`
  - 新增官方工作树 Web QA 场景：`scripts/worktree-web-qa.mjs`（`publish-cards` 分支）+ `scripts/publish-card-qa-entry.mjs`

## 变更摘要

- P0：删除 `// exempt-ui04` 豁免标记（此前落在 JSX 正文，被 React 当文本渲染成卡片乱码）；Emoji（🎬/🖼/🎵）换为矢量 SVG 图标。
- P1：封面渲染真实缩略图 —— `pickThumbnailId()` 优先 `cover_media_id`，图文用 `media_ids[0]` 兜底，视频/无图回退矢量类型图标，`<img onError>` 加载失败也回退；去掉封面居中重复的「图文/视频」字样，仅保留右上角类型角标；统一卡片高度（封面 112px、标题两行 `min-height: 2.8em`、卡片 `height:100%`）。

## 真实浏览器证据（官方隔离工作树 Web QA 运行器）

命令：`node scripts/worktree-web-qa.mjs publish-cards`

该场景使用真实无头 Chrome 内核、动态端口临时 HTTP 服务、真实 `AssetCard` 组件与真实 `injectPublishStyles()` 渲染 4 条代表性记录（有封面 / 图文首图兜底 / 视频 / 坏封面），由页面内 `window.__publishCardQa` 自证并由 Node 侧 CDP 断言，截图留证。

- 结果：**PASS**（serverPort `53627` / cdpPort `53634`）
- 报告：`docs/evidence/publish-card-qa-report.json`（含 `head` / 端口 / 逐条断言）
- 截图：`docs/evidence/publish-card-qa.png`（1280×813）
- 断言（全部 pass）：
  - `card-count-4`：渲染 4 张卡片；
  - `cards-equal-height`：`heights = [231,231,231,231]`（跨行等高，第 4 卡独占第二行仍等高）；
  - `cover-media-src`：封面记录 `src = /omnimux/publish/media/content?id=cover-1`；
  - `image-first-media-fallback`：图文无封面记录 `src = ...?id=first-img`（media_ids[0] 兜底）；
  - `onerror-fallback-to-icon`：坏封面 `404` 触发 `onError` 后回退类型图标（`typeIconCount=2`：视频 + 坏图）；
  - `no-exempt-text`：无 `exempt-ui04` 乱码；`no-emoji`：无 Emoji（TikTok 角标为矢量音符 SVG，截图底栏可见）。
- 说明：fixture 的 tiktok 子任务状态取 `submitted`（IN_FLIGHT），聚合为「发布中」，因此底栏真实渲染出 TikTok 矢量音符角标（非 `D` 草稿）。

## 自动化验证结果

- publish 单测 + 端到端：`node --test src/*.test.js src/shared/*.test.js src/client/*.test.js tests/e2e/*.e2e.test.mjs` → **283 passed / 0 failed**：
  - `card-thumbnail.test.js`（新增 5 条真实断言）：封面优先、图文首图兜底、视频不回退、视频有封面用封面、空/异常输入安全；
  - `publish-asset-card-layout.e2e.test.mjs`（新增 4 条）：无 exempt / 无 Emoji 与符号字符（与 UI04 同口径）、`pickThumbnailId`/`onError` 接线、TikTok 矢量音符、等高样式。
- 工作树 QA 运行器自测：`node --test scripts/worktree-web-qa.test.mjs` → 13 passed / 0 failed。
- Stage 契约：`node scripts/verify-stage-contracts.mjs` → PASS（13 Stage components）。
- UI 静态门禁：`node scripts/scan-ui-gates.mjs` 中 `plugins/omnimux-publish` 命中违规 **0**（UI04=0）。仓库另有 10 处违规分布在 omnimux / inspiration / video-preview / workflow，均为 origin/main 既有、与本改动无关。
- Diff-aware L0：`node scripts/auto-qa-gate.mjs . --diff --base origin/main` → PASS。

## 说明

- Dev 真机（45120）运行验收按合同归人工，不作为 Agent 交付卡点。
- `publish-cards` 场景已并入官方运行器 `worktree-web-qa.mjs`，后续 UI 改动可复用同一路径取证（非私有 harness）。
