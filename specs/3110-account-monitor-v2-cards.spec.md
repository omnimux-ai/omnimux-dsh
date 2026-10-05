# Issue #3110 · 账号监控卡片分形 + 瀑布流（客户端）实施规格

> 唯一行为与文案真源：`docs/prd/2026-10-05-account-monitor-v2-prototype-spec.md`（下称「规格」），重点 §9.1/§9.2/§9.3/§9.6；视觉真源：`docs/prototypes/account-monitor-v2-prototype.html`（PM_SIGN_OFF: PASS）；实现参考：`docs/implementation/account-monitor-v2-plan-notes.md`。冲突时：规格 > 票面 > 实现参考。本文件仅为本任务级实施规格，不另创文案与 UI 元素。

## 目标（Objective）

账号监控 Feed 从「统一 9:16 网格 + 共用灵感库卡片」升级为：按内容类型渲染五种卡片形态（`short-video` / `long-video` / `image` / `text` / `text-media`）、按最短列贪心放置的瀑布流、默认态只留三样元素、已处理样式后退。同时落地前置预重构：补齐 `--dsw-specific-media-*` 与 `--dsw-specific-velocity-*` 两族 token。

## 用户操作旅程与期望反馈

- 用户打开「账号监控」Tab → 看到按当前排序逐张放入最短列的瀑布流，卡片按内容类型分形（竖视频高、横视频扁、图文按图比例、推文无媒体）。
- 不悬停时，每张卡只见：媒体（如有）、增速胶囊（如有）、标题或正文。不出现平台角标、时长、头像、昵称、时间、匹配度、状态文字、指标行、操作按钮（V12）。
- 有处理状态（已互动/已复刻/已处理）的卡：胶囊转中性样式、媒体 `filter: grayscale(1)` + `opacity: 0.45`（只作用媒体元素）、文字降 `label-secondary`，整卡 `opacity` 保持 1；悬停全部恢复（V14）。
- 悬停卡片 → 底部浮出悬停层：作者行（平台 SVG + 昵称 + 相对时间 + 可选匹配度）→ 指标行 → 三个次级按钮 + 状态位 → 满宽「立即复刻」（V16）。
- 点击卡片本体 → 打开详情弹窗。
- 容器宽度变化 → 列数按 `n = max(2, min(6, floor((W+16)/236)))` 变化，列宽等分且 ≥220px（V5）。
- 悬停、标为已处理不改变卡片高度，瀑布流不重排（V7）。

## 范围与边界

做：
- 新增 `rival-tokens.js`（两族 token，外壳注入一次）、`rival-masonry.js`（纯函数薄适配层）、`RivalPostCard.jsx`（五形态卡片，方案 A 分叉）、`RivalMasonry.jsx`（扁平 DOM + 绝对定位容器）。
- 改 `RivalFeedGrid.jsx`（改渲染 `RivalMasonry`，保留空态/骨架）、`rival-styles.js`（新增卡片/瀑布流/悬停层 CSS）、`rival-filter.js`（`toRivalCardRow` 透传 `type`/`ratio`/`media_kind` 等）。

不做（Non-Goals）：
- 不改 `InspirationCoverCard.jsx`、`styles.js`、灵感库/资产库任何文件。
- 不新增云调用；不写第三套贪心分列算法（调用共享核心 `distributeColumns`/`columnsForWidth`）。
- 禁 `column-count`/`columns`/`grid-auto-flow: dense`；禁按列分容器渲染（DOM 顺序必须等于排序顺序，V4）。
- 比例一律来自数据字段，禁止 `naturalWidth` 等 DOM 测量（V3/V7）。
- 不改规格/原型/设计文档；不执行任何 git 命令（提交由主理人统一做）。
- 增速胶囊三级降级算法属 #3113；本票卡片从 `card.velocity`（若存在）读 `{text,tier}`，缺失时不渲染胶囊，不自行实现该算法。
- 操作回调接线属 #3114；本票留好回调 props，无回调的按钮不渲染占位。

## 关键实现口径（锁死）

- `rivalColumnsForWidth(W)` = `columnsForWidth(W, {minColWidth:220, gap:16, minCols:2, maxCols:6})`。
- `rivalRatioOf(card, columnWidth)`：`short-video`→9/16；`long-video`→16/9；`image`→`clamp(ratio ?? 4/5, 1/1.91, 4/5)`；`text`→等效比例 `columnWidth/估算高度`；`text-media`→视频 16/9 或图片同 `image` clamp。
- 无媒体卡估算高度：`24 + (有胶囊?36:0) + min(8,ceil(字数/每行字数))*20`（`charsPerLine = floor((columnWidth-24)/14)`），下限 144。`text-media` 估算 = `24 + 36 + 60 + 8 + (columnWidth-24)/mediaRatio`。
- `rivalPlacements` 内部只调共享 `distributeColumns` 拿分桶，再按桶内顺序累加高度算 `top`；贪心决策不重写。
- 渲染：单一 `position:relative` 容器 + 卡片 `position:absolute`（`left = col*(colW+gap)`，`top` 来自 placements），DOM 顺序 = `cards` 数组顺序 = 排序顺序。
- 已处理样式只改颜色与滤镜，不改尺寸；滤镜挂 `img`/`video` 媒体元素本身，不挂容器（胶囊是独立图层）。
- token 语义：媒体上的文字/角标亮暗主题同值（暗房原则），不在 light 主题重定义。

## 验收（摘录规格 §9.6）

- V1–V7：禁 CSS columns/dense；最短列放置、等列取最左；DOM 顺序=排序顺序；断点 692/928/1164/1400；间距 16、圆角 12/8；悬停与已处理不重排。
- V8–V11：媒体比例与截断行数（9:16/1行、16:9/2行、ratio/1行、无媒体/8行、16:9/3行）；胶囊永远右上角。
- V12–V15：默认态极简白名单；已处理三处后退且整卡 opacity=1；无 `该号爆款` 文字。
- V16–V18：悬停层四段结构；指标前缀视频 `播放`、图文/推文 `浏览`；第四操作位状态文字或按钮互斥。
- V21–V22：亮暗主题 token 正确；渐隐带 20px；无字典外文字。

## 测试策略

- 纯函数单测（Node，零 DOM）：`rival-masonry.test.js` —— 五类比例、clamp 边界、缺 `ratio` 回 4:5、断点表、`rivalPlacements` 逐张独立复算最短列、追加稳定性、长/短推文等效比例断言。
- 组件渲染测试（jsdom）：五形态默认态白名单断言、已处理样式断言（媒体元素 `filter`/`opacity`、根节点 opacity=1）、截断类名。
- 真实浏览器验收：功能路径截图（亮暗主题），DOM 顺序与断点用脚本实测。

## 命令

- 单测：仓库既定测试入口，日志保留 `REAL_EXIT`。
- 浏览器验收：esbuild 打单页 + 真实浏览器截图（`react`/`react-dom`/`dsh-ui-kit` alias 到仓库真实路径）。
