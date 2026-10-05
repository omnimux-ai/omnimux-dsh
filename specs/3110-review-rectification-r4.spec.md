# PR #3140 第四轮整改规格：估算层建模缺陷（复审独立证据）

- 关联：Issue #3110 / PR #3140（分支 `feat/account-monitor-v2-cards-issue-3110`）
- 来源：代码复审独立取证（`/tmp/ocr-3140/probe-height.mjs`），与前三轮不同源
- 真源：`docs/prd/2026-10-05-account-monitor-v2-prototype-spec.md` §9.1（字号行高）/ §9.3（比例与高度）

## 目标

修复 `rival-masonry.js` 高度估算模型与真实 CSS 渲染之间的三处建模缺陷，使「估算高度」
重新成为可信的放置依据：估算低估 → 同列下方卡片重叠；高估 → 空洞。两者都破坏
§9.3 瀑布流的视觉承诺。

## 必修项（主理人逐条确认）

### R4-1【阻塞】胶囊行存在性判据：渲染层与估算层不一致

- 渲染层 `RivalPostCard.jsx`：`card?.velocity` 真值即渲染 `.omnimux-rival-pill-row`
  （28px 高 + 8px 间距）。
- 估算层 `rival-masonry.js`：`hasPill` 额外要求 `velocity.text` 非空。
- `VelocityPill` 自身在 `text` 为空时返回 null → `velocity = {}` 时真实 DOM 出现
  **空的胶囊行**（仍占 36px），估算不计 → 该卡比估算高 36px，同列下方卡片重叠；
  且空行本身违反 §9.1「胶囊行仅在有胶囊时渲染」。
- **验收**：三处判据收敛为同一谓词（共用处导出，渲染层复用）；
  `velocity` 为对象但 `text` 为空 → 无 pill-row DOM 且估算高度不含 36px。

### R4-2【阻塞】换行模型对非 CJK 文本系统性失真

- 现状：`textWidthPx` 逐字符密排（CJK=1×unit，ASCII=0.55×unit），无任何分词/断行
  模拟；CSS 实际按**词边界**换行（`.omnimux-rival-card-text`/`-title` 无
  `overflow-wrap`/`word-break`）。
- 后果（220px 列复审实测）：`8×#sundayfunday` 估 5 行实 8 行 → -60px 重叠；
  单条 320px URL 估 2 行实 1 行 → +20px 空洞。X/英文推文的 hashtag 与 URL 是常态
  内容；QA 12 卡夹具全短中文恰好绕过。
- **修法**：升级为「按空白分词、逐词装行」的模拟：按空白切词；每词宽度 =
  Σ字符宽（保留 CJK/ASCII 权重）；逐词尝试放入当前行，放不下换行；
  **单词本身超行宽时占 1 行**（对应 CSS overflow:hidden 的截断行为）；行数仍按
  §9.1 类型上限截断。无法用纯函数精确模拟的细节，作为文档化的已知偏差写在注释中。
- **同步**：`rival-cards.e2e.test.js` 的 oracle（`specHeightPx`）与
  `rival-masonry.test.js` 的 oracle 是逐项同式克隆，必须同步更新并在文件头维持
  「该层断言决策与给定几何一致，几何正确性由真机实测承担」的边界说明。
- **验收**（真机，headless Chrome + CDP）：§9.4 的 12 卡外加 2 张英文/hashtag/URL
  卡，逐卡 `getBoundingClientRect().height` vs `rivalCardHeightPx` 估算值比对，
  报告 max 差值；用实测高度重放最短列，报告 mismatch 数。

### R4-3【低】媒体卡未套最小高度下限

- CSS `min-height:144px` 对所有卡生效、JSDoc 声称「所有结果满足 ≥144」，但
  `rivalCardHeightPx` 媒体卡分支缺 `Math.max(RIVAL_MIN_CARD_HEIGHT, …)`——容器
  200–451px（列宽 <220）时产生 ≤4px 空隙。
- **验收**：媒体卡分支补上 `Math.max`；列宽 <220 的媒体卡估算 ≥144。

## 不做（本轮明确排除）

- 胶囊对比度（D3/O1）：规格与票面 AC 冲突，等用户裁定，不动配色。
- `ratio` 生产链路：后端切片。
- `.clamp-*`/`.t-*` 类名过泛、嵌套三元、拆解失败文案复用 `attachFailed`（F6）：
  纯风格/措辞项，本轮不做。

## 成功标准

1. `rival-masonry.test.js` / `rival-post-card.test.js` 新增断言先红后绿：
   - `velocity:{}` 的 text 卡无 `.omnimux-rival-pill-row`，估算不含 36px；
   - 词边界换行用例（hashtag 串 / 超行宽 URL）估算行数与词装行模型一致；
   - 媒体卡在列宽 <220 时估算 ≥144。
2. 真机实测（验收装置 `harness/demo.html?edge=1`）：14 卡逐卡
   |实测 − 估算| 收敛（报告具体数字），实测高度重放最短列 mismatch=0。
3. 插件全量测试与资产层测试无回归。

## 命令

```sh
cd plugins/omnimux-inspiration && node --import ./scripts/deny-network.mjs \
  --test src/client/rival-masonry.test.js src/client/rival-post-card.test.js \
  src/client/rival-cards.e2e.test.js
node docs/evidence/account-monitor-v2-cards-3110/harness/build-demo.mjs
# 真机：headless Chrome + CDP 驱动 harness 页，逐卡测量与重放
corepack pnpm --filter omnimux-assets test   # 资产层回归
```

## 边界

- 总是做：先红后绿；退出码用 `cmd > log 2>&1; echo REAL_EXIT=$?` 留存。
- 不做：不 push、不开 PR、不 amend；不动配色/文案；不改共享核心
  `masonry-layout.js`。
