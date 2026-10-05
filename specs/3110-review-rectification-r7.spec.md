# PR #3140 第七轮整改规格（Issue #3110 账号监控 v2.1 卡片与瀑布流）

## 背景
第五轮四路复审（QA FAIL / PM REJECT / 代码复审 BLOCKING / OCR 保留项）共 9 项必修 + 若干低档。其中两条结构性缺口：断行判据不在测试套件内、逐字形字宽表零测试覆盖。

## 必修项

### R7-① 断行模型补 UAX#14 EX 断后（阻塞）
- QA 定点实验：Chrome 在 `?` 之后断行（含查询串 URL 的 text-media 卡少算 1 行 → 同列 4px 物理重叠，1164/860/600 三档复现）。
- 实现：断后集合补齐到真机断后全集 = EX{!} ∪ HH ∪ HY ∪ B2 ∪ BA 非空格成员（官方 LineBreak.txt 枚举）。`!` 为 Chrome 定制不断行（真机实证，登记为规范分歧）。不实现 `/` 断后（Chrome 实测不断）。
- 验收：`rivalWrapLines('aa?<sep>bbbbbbbb', 14, 60) ≥ 2`；≥60 卡夹具（含 ? 形态 text-media 卡）1164/860/600 三档 maxAbsDiff / 实测高度重放错列数 / 同列重叠量 / 间距取值集合。

### R7-② 断行判据迁进测试套件（阻塞 · 结构性）
- `rival-masonry.test.js` 新增 UAX#14 类表断言：EX / HH / HY / B2 / BA（非空格全枚举 ≤BMP）/ BK / ZW / GL / WJ，清单独立于模型集合（按官方 LineBreak.txt 枚举，不照实现挑）。
- 验收：注入「删 ? 断后」「还原空白判定」等错误实现，具名断言变红。

### R7-③ 逐字形字宽表锁表断言（阻塞 · 结构性）
- `RIVAL_GLYPH_WIDTH_FACTOR` 导出并在套件内断言 17 个代表字形的标定值；行数层断言窄/宽词宽度可分辨（退回统一 0.592 立即变红）。

### R7-④ 字体族显式声明 + 字体前提钉住（阻塞）
- `.omnimux-rival-card-text` / `.omnimux-rival-card-title` 显式声明 font-family，与 `build-demo.mjs` 的 `--font-family` 和 dsh-ui-kit 既有约定对齐。
- `GLYPH_WIDTH_FACTOR` JSDoc 与 harness/README 写明「表仅对 SF Pro / -apple-system 14px 有效，换字体须重新标定」；codepoint-probe.mjs 字体栈与 demo 统一。

### R7-⑤ 禁用态 hover 补 :not(:disabled)（阻塞）
- `rival-styles.js` 两条 `.omnimux-rival-act-primary:hover` 与 :702/:710 同形补守卫。

### R7-⑥ 省略号挂到 label 元素（阻塞）
- `overflow:hidden; text-overflow:ellipsis` 挂 `.omnimux-rival-act-btn > span:not(.omnimux-rival-vh)`；保留按钮级 overflow:hidden 兜底。验收：像素/OCR A/B（220/224 两档），非 computed style。

### R7-⑦ 指标行省略号同根因（建议一并修）
- `.omnimux-rival-overlay-metrics` 同⑥修法（inline-flex + min-width:0 + ellipsis）。

### R7-⑧ 隐藏节点移出 <button>（阻塞）
- `.omnimux-rival-vh` 移到外层 `.omnimux-rival-act-slot`，消除可及名称重复。

### R7-⑨ cover_url / cover_src 字段一致（阻塞）
- `coverSrc` 与 `hasMedia` 同一 fallback：`row?.cover_src || row?.cover_url`；归一进 cover_key/cover_src/cover_http_url。

## 低档项
- Q2：U+000C 对齐 Chrome 实测（不断行）+ 注释修正。
- 断行集合漏码位（00AD/2012/2013/2014/2027/058A/05BE/1400/2E17/2E40）：随②全枚举一并补齐。
- F-1：rival-masonry.js:170 与 test:405 连字符注释数字改可复现。
- F-2/Q6：非 ASCII 回落 0.592 的覆盖边界写进已知偏差清单。
- F-3：r6 spec「实测高度重放错列 = 0」改为与证据一致（等高平局 2，无重叠）。
- O7：无 id 卡重复 describedby id，生产不可达，登记。

## 不做的事
- 胶囊对比度（等用户裁定，不动配色）；.clamp-* 类名风格项；ratio 生产链路（后端）；card-compact-cta flaky（非本 PR）。

## 验收口径
- 先写失败测试跑红 → 实现 → 转绿；注入 ①③④ 错误实现各自被具名断言拦住（git archive 干净副本自验）。
- ⑥用像素/OCR A/B 验收。
- 测试口径：第一段 N / 第二段 261 / 合计 M；`cmd > log 2>&1; echo REAL_EXIT=$?`，grep `ℹ fail` 交叉验证。
- 资产层（omnimux-assets）共享核心回归。
