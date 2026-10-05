# PR #3140（Issue #3110）审查整改说明

整改提交针对三方审查收敛的六项必修（代码审查 F1 / QA D1–D5, D9 / PM B1–B2, O2 / OCR #1–#9）。

## 1. 瀑布流两套高度度量（F1 / D1 / D2 / D6，阻塞）

- `plugins/omnimux/src/client/components/library-flow/masonry-layout.js`：`distributeColumns` 增加可选 `heightOf` 参数，不传时行为与旧版逐字一致（灵感库、资产层原路径零变化）。
- `plugins/omnimux-inspiration/src/client/rival-masonry.js`：`rivalPlacements` 把 `(card) => rivalCardHeightPx(card, w) + RIVAL_GAP` 传入核心——放置决策与 `top` 累加从此共用同一高度函数；`rivalCardHeightPx` 重写为 border-box 几何（内宽 = 列宽 − 2px 描边、媒体卡标题区 10/12 + 行数×18、行数按文字近似宽换行并按 §9.1 每类上限截、text 胶囊行存在性、text-media 10px 间距）。
- 真实浏览器复核（`rectify-placement-measure.json` / `rectify-dark-5col.png`）：12 卡 @5 列逐卡 `actual==shortest`（0 mismatch），纵向间距恒 16px，`--rival-feed-height` 与最高列底边一致（846.68px）。

## 2. 状态文案绕过 i18n（B1 / D9 / OCR #9，阻塞）

- `rival-filter.js`：删除 `interactedLabel` 及 `'已处理'/'已复刻'` 字面量，新增 `rivalStateOf` 只产 `state: 'done'|'replicated'|'interacted'`；`state_label` 保留 Host 透传语义。
- `RivalPostCard.jsx`：`stateText(card, t)` 经 `t('rivalFeed.card.*')` 渲染，`interacted` 用 `.replace('{time}', HH:mm)`（不可解析时裁掉 ` · {time}` 后缀）。
- `RivalFeedGrid.jsx`：本地 `state: 'done'` 替代字面量 `'已处理'`。
- `locales.js`：补 `rivalFeed.toast.deconstruct`（zh+en，规格 `toast.deconstruct` 逐字）。
- 英文层实测：`Interacted · 17:12` / `Replicated` / `Original / AI breakdown / Mark done / Replicate`，零中文残留（`rectify-en-hover-p2.png`）。

## 3. 追加分页骨架（OCR #5，阻塞）

- `RivalFeedGrid.jsx`：`loadingMore` 在瀑布流下方追加同规格 10 块 shimmer（`data-rival-loadmore-skeleton`）；`rival-styles.js` 补 `margin-top: 16px` 间距。e2e 断言骨架与既有卡片共存。

## 4. `AI 拆解` 生产不渲染（B2，阻塞）

- `RivalAccountsPanel.jsx`：`handleDeconstruct` 接既有 `to-inspiration` 链路（`convertRivalPost(account_id, post_id, { auto_analyze: true })`，对已入库作品幂等），成功后取 `inspiration_id` 的本地条目交给 `InspirationPreviewModal`（其解构页签即「就地展开」），并给规格 toast `拆解完成，已就地展开`。`RivalFeedGrid` 收到 `onDeconstruct` 并透传。
- `account-monitor-feed-render.test.js`：断言经真实面板 wiring 后卡片悬停层出现 `[data-act="deconstruct"]`；`rival-cards.e2e.test.js` 同断言。

## 5. e2e 断言无鉴别力（D4，阻塞）

- `rival-cards.e2e.test.js`：载荷换成 §9.4 十二卡 @5 列（能区分贪心与 round-robin）；`expectedColumns` 按规格同款像素几何独立复算（border-box、真实换行估算），不再用 `1/ratio + 0.25`；文件头注明 jsdom 无布局、几何/间距/对比度/滤镜不在此层验证。
- 红证据（暂存实现复跑）：`AssertionError … expected 0,1,2,3,4,1,3,4,2,4,0,3`，`actual [0,1,2,3,4,1,4,3,2,4,0,3]`——正是 QA 抓到的 3 张错列；修复后 15/15 全绿。

## 6. 验收装置不可重建（D5 / O2，阻塞）

- `harness/build-demo.mjs`：入口指向库内 `demo-entry.jsx`（相对 import 修成 `../../../../plugins/…`），esbuild 走 node 解析（工作树根向上可达 `node_modules`）；`dsh-ui-kit` 别名为 `test-fixtures/ui-kit-shim.mjs`（与 e2e 同替换，README 声明替身影响）；产物落在 `harness/`。`demo-entry.jsx` 接 `?theme`/`?locale`/`?width`。
- `harness/README.md`：前置（`pnpm install` 于仓库根）与一条重建命令。跨目录（/tmp）实测重建通过。

## 证据

- `rectify-placement-measure.json`：12 卡列序 0,1,2,3,4,1,3,4,2,4,0,3，逐卡 shortest 匹配，间隙 [16,16,16,16,16]。
- `rectify-dark-5col.png` / `rectify-light-5col.png` / `rectify-en-hover-p2.png` / `rectify-zh-hover-p2.png`。
- 测试：`omnimux-inspiration` 全插件 1231 pass / 0 fail；`omnimux-assets` masonry 16 pass / 0 fail；共享核心 masonry-layout 6 pass / 0 fail。

## 未做

- 胶囊配色（PM O1 / QA D3）：规格 §9.1 锁定「爆款/飙升 配色不变」与票面 AC ≥4.5:1 冲突，按裁定本轮不动。
- `ratio` 生产不可达（解析层不产出）：已披露，后续切片（后端）。
