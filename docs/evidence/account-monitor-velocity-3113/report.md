# Issue #3113 · 卡片增速胶囊与增速排序 · 验收报告

## 口径
- 服务端只下发事实：`{tier, confidence, vph|multiplier, samples_at}`（`mergeAccountPosts` → `toFeedRow` → `feedVelocity`）；文案由 `rival-format.js` `rivalVelocityText` 经 `t()` 字典派生，逐字取规格 §3.3。
- 三档降级：A 实测（≥2 有效采样、间隔 ≥1.5h、Δ≥0）→ B 发布均速（posted_at 否则 first_seen_at、age>0）→ C 相对（views ≥3× 账号中位）。`vph<200` 不渲染；`velocity=null` 不留位。
- 排序 `sort=velocity`：vph 降序 → relative 按倍数 → null 按 id 降序垫底。

## 证据文件
- `01-feed-dark-5col.png`：暗色整页 5 列；爆款实底橙红 / 飙升琥珀 / 观察·均速·该号 中性描边，`该号 4.2x` 无 /h。
- `02-feed-light-5col.png`：亮色整页，同一组胶囊。
- `03-feed-edge.png`：边界卡（hashtag/URL/空 velocity 对象/连字符长词/NBSP），`velocity:{}` 与 `w4` 不留胶囊空位。
- `04-relative-pill-hover.png`：相对档媒体卡近景，`该号 4.2x` 中性描边、无趋势图标。
- `05-detail-velocity-note.png`：详情弹窗口径行 `与该账号历史播放中位数对比`（逐字）。

## 测试（node --import ./scripts/deny-network.mjs --test）
- 关联 10 文件：180/180 pass。
- 插件全量一段：1146/1149 pass，fail=3 件环境性（`rival-filter-polish.e2e` / assets 4 件，`dsh-ui-kit` file: 依赖不在 .pnpm；基底同挂，非本票）。
- 二段：261/261。codepoint-probe：0 mismatches。

## 云调用
`feedVelocity` 只读已落库 `metrics.views_history` / `posted_at` / `first_seen_at` / `stats.views`；`listFeed` 无新增请求、无 fetch；deny-network 回执 0 outbound。
