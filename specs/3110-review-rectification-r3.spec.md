# #3110 第三轮整改规格（PR #3140 · 复审遗留 5 项）

## 背景与范围

第二轮整改（`d51b62000`）修好瀑布流与状态文案后，复审仍留 5 项硬条件：1 项上轮未修的高危安全项、2 项第二轮新接线带入的 bug、1 项 i18n 泄漏、1 项测试边界声明。本规格固定这 5 项的可测验收口径，不做范围扩张。

不做：胶囊对比度（规格与票面 AC 冲突，待用户裁定）、`ratio` 生产链路（后端切片）、`.clamp-*`/`.t-*` 类名与嵌套三元（纯风格项）。

## 用户旅程与期望反馈

### R3-1 弹层「立即复刻」走灵感库复刻链路（bug）

AI 拆解完成后就地展开 `InspirationPreviewModal`，用户点弹层底部「立即复刻」。弹层传入的是灵感库条目（`safeItem`，有 `id`、`title`、`source_url`、`local_paths` 等，没有 `account_id`/`post_id`）。

- **期望**：走灵感库一键复刻链路 `oneClickReplicate(row, { onStatus })`——官方新会话手势 + 会话栏展开 + `kind: 'inspiration'` 附件 + 预填提示词；状态经 `onStatus` 进面板 notice（进行中 `card.cta.replicating`，失败给对应 `card.cta.*` 文案）。
- **禁止**：把灵感库条目交给 `addRivalPostToSession`（它期望竞品卡，会对 `account_id=undefined` 发起媒体下载请求并失败）；禁止判空吞掉（按钮静默失效）。

### R3-2 `handleDeconstruct` 补 catch（bug）

`convertRivalPost` / `getLocalInspiration` 底层是 fetch，网络层抛错（reject）时：

- **期望**：无未捕获 promise rejection；用户看到 `rivalAccounts.post.attachFailed` 字典文案的失败提示；`deconstructBusyId` 被清掉，按钮可再次点击。
- **禁止**：只吞错不提示。

### R3-3 `openOriginal` / 账号筛选跳转 / 详情弹窗原帖按钮的 URL scheme 白名单（安全）

三处 `window.open`（`RivalPostCard.jsx`、`RivalAccountFilter.jsx`、`RivalPostPreviewModal.jsx`）共用一个 helper：仅放行 `http:`/`https:`。

- `RivalPostCard` 卡片：`source_url` 非 http(s)（如 `javascript:`）时不渲染 `原帖直达` 按钮。
- `RivalAccountFilter` 账号行：`profile_url` 非 http(s) 时跳转按钮 disabled，点击不产生 `window.open`。
- `RivalPostPreviewModal` 详情弹窗：`originalUrl` 非 http(s) 时不渲染 `查看原帖` 按钮。
- `account-monitor-feed-render.test.js` 里 `mounted.opened`（window.open stub）既有断言不得变红。

### R3-4 格式化函数走 locale（QA N1）

`formatCount` / `formatEngagementCount` / `formatRelativeTime` 三个纯函数接受 `locale` 参数（`'zh'` 缺省）；`en` 下：计数走 `K/M/B`（`formatCount` 已有实现但生产不可达）、互动量走 K/M 缩写、相对时间走 `just now`/`Nm ago`/`Nh ago`/`Nd ago`/`Nmo ago`/`Ny ago`。

- locale 来源：调用方不新增 prop，由 `rivalLocaleOf(t)` 经探针键 `rivalFeed.card.replicate` 与 zh 字典比对得出（本插件只注册 zh/en 两典）。
- 消费方：`RivalPostCard`（作者行相对时间 + 指标行计数）、`RivalPostPreviewModal`（发布时间 + 指标值）、`RivalAccountFilter`（作品数）。
- 验收：`?locale=en` 真机悬停层全文无中文字符；zh 行为逐字不变。

### R3-5 e2e 文件头声明 oracle 几何边界（测试卫生）

`rival-cards.e2e.test.js` 文件头补充一条显式声明：该层 oracle（`specHeightPx`/`expectedColumns`）与实现 `rivalCardHeightPx` 逐项同式，断言的是「放置决策与给定几何一致」；几何正确性本身由真机实测承担（入口 `docs/evidence/account-monitor-v2-cards-3110/rectify-placement-measure.json`）。

## 验收

- 每条 bug（R3-1/2/3）先有跑红的复现测试，再修到绿。
- 插件全量测试（A 段 + explore 段）0 fail；资产层共享核心（masonry-layout）测试不回归。
- 真机：`?locale=en` 悬停层截图无中文；R3-1 弹层复刻有可观测证据。
