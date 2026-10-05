# PR #3140（Issue #3110）三方审查整改规格

## 背景

三方独立审查（双轴代码审查 / 本机 OCR 行级审查 / PM 终验 / QA 真机验收）结论一致：PR #3140 不可合入。本规格覆盖六项硬性整改，权威真源为 `docs/prd/2026-10-05-account-monitor-v2-prototype-spec.md`（§9 卡片层、§3 文案字典）与原型 `docs/prototypes/account-monitor-v2-prototype.html`。

## 整改项

### 1. 瀑布流放置的两套高度度量（F1 / D1 / D2 / D6）

- **现状缺陷**：`rival-masonry.js` 的 `rivalPlacements` 用共享核心 `distributeColumns` 做放置决策，核心内部按 `1/ratio + 0.15`（灵感库归一化口径）度量高度，而 `top` 累加用 `rivalCardHeightPx` 的真实像素——两套度量不一致。同时 `rivalCardHeightPx` 本身不准：`long-video` 恒按 2 行标题估（220px 列宽下实际只渲 1 行，高估 19.12px）；媒体卡缺标题区几何与 2px 描边；`text`/`text-media` 缺胶囊行存在性、10px 媒体间距与描边。后果：12 卡 @5 列实测 3 张落错列；纵向间距 14–35.12px 而非恒 16px。
- **整改**：
  - 共享核心 `distributeColumns(items, columns, ratioOf?, heightOf?)` 增加可选 `heightOf` 参数；**不传时行为完全不变**（向后兼容加法，资产层 `omnimux-assets` 测试必须保持全绿）。
  - 适配层传入 `(card) => rivalCardHeightPx(card, w) + RIVAL_GAP`，使放置决策与 `top` 累加用同一高度函数。
  - 修正 `rivalCardHeightPx` 为 border-box 几何：内宽 = 列宽 − 2px 描边；媒体卡 = 内宽÷媒体比 + 标题区(上 10 + 下 12 + 行数×18) + 2；标题行数按估算文字宽换行（CJK≈13px、ASCII≈0.55×）且 ≤2；`text` = 24 + (胶囊?36) + 行数(≤8)×20 + 2；`text-media` = 24 + (胶囊?36) + 行数(≤3)×20 + 10 + (内宽−24)÷媒体比 + 2。
- **验收**：§9.4 十二卡 @5 列逐张落最短列（放置前底边最小、等高取最左），逐卡列序为 0,1,2,3,4,1,3,4,2,4,0,3；相邻卡纵向间距恒 16px；容器高覆盖最高列。

### 2. 状态文案绕过 i18n（PM B1 / QA D9）

- **现状缺陷**：`rival-filter.js` 把 `已互动`、`已互动 · HH:mm`、`已处理`、`已复刻` 写成字面量，`RivalFeedGrid.jsx` 写死 `state_label: '已处理'`；本 PR 新增的 `rivalFeed.card.done/.replicated/.interacted`（zh+en）成死键。英文界面渲染 `… | Original | 已复刻 | Replicate`。
- **整改**：映射层只产「状态种类 + 原始数据」（`state: 'done'|'replicated'|'interacted'` + `interacted_at` + 下行未变的 host `state_label`）；渲染层经 `t('rivalFeed.card.*')` 输出，`interacted` 用 `.replace('{time}', …)` 填 `interacted_at` 的本地 `HH:mm`，时间不可解析时去掉 ` · {time}` 后缀只报主词。
- **验收**：英文 locale 悬停层第四操作位显示 `Done` / `Replicated` / `Interacted · HH:mm`，零中文残留。

### 3. 追加分页骨架被删（OCR #5）

- **整改**：`RivalFeedGrid` 恢复 `loadingMore` 期间在瀑布流下方追加 10 个骨架卡（复用 `.omnimux-inspiration-skeleton` 原子组件，容器 `margin-top: 16px`）。
- **验收**：`loadingMore=true` 时骨架出现在卡片之后；首屏 `loading` 骨架行为不变。

### 4. `AI 拆解` 按钮生产不渲染（PM B2）

- **现状缺陷**：`RivalPostCard` 依赖 `onDeconstruct`，但 `RivalAccountsPanel` 从未传入，全仓无生产调用方。
- **整改**：面板补 `onDeconstruct`，经 `convertRivalPost(account_id, post_id, { auto_analyze: true })` 接入既有 `to-inspiration` 链路（E13：作品→灵感库并跑 AI 解析），成功后用 `InspirationPreviewModal` 展示该灵感条目（其拆解页签即"就地展开"的落点）。
- **验收**：悬停层出现第二个次级按钮 `AI 拆解`，点击进入真实链路。

### 5. e2e 断言无鉴别力（QA D4）

- **整改**：载荷换成 §9.4 十二卡 @5 列（卡数 > 列数，能区分贪心与 round-robin）；期望值按规格同款像素几何（border-box、真实换行估算）独立复算；文件头注明 jsdom 无布局、几何/间距/对比度/滤镜不在此层验证。

### 6. 验收装置不可重建（QA D5 / PM O2）

- **整改**：`docs/evidence/account-monitor-v2-cards-3110/harness/build-demo.mjs` 入口改为仓库内的 `demo-entry.jsx`（相对 import 修正为 `plugins/omnimux-inspiration/...`），esbuild 走节点解析（工作树根向上可达 `node_modules`）；`dsh-ui-kit` 别名为仓库自带 `test-fixtures/ui-kit-shim.mjs`（与 e2e 同替换）；产物落在 `harness/` 内；`harness/README.md` 写明前置与一条命令。
- **验收**：干净检出 + `pnpm install` 后 `node docs/evidence/account-monitor-v2-cards-3110/harness/build-demo.mjs` 一条命令可重建 demo。

## 不做的事（已裁定）

- 胶囊配色：§9.1 锁定「爆款/飙升 配色不变」与票面 AC ≥4.5:1 冲突，正在请用户裁定，本轮不动配色。
- `ratio` 生产不可达（解析层不产出）：属后续切片。

## 验收口径

- 先红后绿：①⑤ 先写失败测试跑红，再最小实现跑绿。
- 测试日志用 `cmd > log 2>&1; echo "REAL_EXIT=$?"` 留真实退出码，交叉验证 `ℹ fail N`。
- 共享核心改动后必须跑 `plugins/omnimux-assets` 相关测试确认零回归。
- 真实浏览器截图（5 列布局 + 纵向间距）作为交付证据。
